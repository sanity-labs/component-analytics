#!/usr/bin/env node

/**
 * @module line-ownership/analyze-line-ownership
 *
 * Line Ownership Analysis
 *
 * Measures the line-of-code footprint of tracked UI library across each codebase.
 * For every TSX/JSX file:
 *
 *   1. Count the total lines in the file.
 *   2. Identify lines that belong to tracked UI library:
 *      a. Import lines from the tracked UI library
 *      b. Lines within tracked UI library JSX opening tags (the `<Component` line
 *         plus every continuation line of props through the closing `>`)
 *   3. Each physical line is counted at most once even if it contains
 *      multiple tracked UI library constructs.
 *   4. Sum across all files per codebase.
 *
 * Output:
 *   - `reports/line-ownership/line-ownership-report.md`
 *   - `reports/line-ownership/line-ownership-report.csv`
 *   - `reports/line-ownership/line-ownership-report.json`
 *
 * Run directly:
 *   node scripts/line-ownership/analyze-line-ownership.js
 *
 * Or via npm:
 *   npm run analyze:line-ownership
 */

const {
  CODEBASES,
  TRACKED_COMPONENTS,
  UI_LIBRARY_NAMES,
  isTrackedUISource,
} = require("../lib/constants");
const { sortByCount, pct, incr } = require("../lib/utils");
const {
  codebaseExists,
  findFiles,
  readSafe,
  writeReports,
} = require("../lib/files");

// ═══════════════════════════════════════════════════════════════════════════════
// JSX DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check whether a file contains any JSX rendering — either a PascalCase
 * React component (`<Button`, `<MyWidget`) or a lowercase HTML/SVG tag
 * (`<div`, `<span`, `<svg`).
 *
 * Files that contain no JSX at all are pure logic (hooks, types,
 * utilities, constants) and should be excluded from the UI-file
 * denominator.
 *
 * @param {string} content - File content.
 * @returns {boolean}
 */
function hasJSX(content) {
  return /<[a-zA-Z][a-zA-Z0-9]*[\s/>]/.test(content);
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT PARSING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract ES import statements from file content.
 *
 * @param {string} content
 * @returns {Array<{ namedImports: string|null, defaultImport: string|null, source: string, index: number }>}
 */
function extractImports(content) {
  const regex = /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
  const results = [];
  let m;
  while ((m = regex.exec(content)) !== null) {
    results.push({
      namedImports: m[1] || null,
      defaultImport: m[2] || null,
      source: m[3],
      index: m.index,
    });
  }
  return results;
}

/**
 * Parse named imports into `{ original, local }` pairs.
 * Only returns PascalCase names.
 *
 * @param {string} namedImportsStr
 * @returns {Array<{ original: string, local: string }>}
 */
function parseNamedImports(namedImportsStr) {
  if (!namedImportsStr) return [];
  const results = [];
  for (const raw of namedImportsStr.split(",")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+as\s+/);
    const original = parts[0].trim();
    const local = (parts[1] || parts[0]).trim();
    if (original && /^[A-Z]/.test(original)) {
      results.push({ original, local });
    }
  }
  return results;
}

/**
 * Build `{ localName → originalName }` for tracked UI library component imports.
 *
 * @param {string} content
 * @returns {Object<string, string>}
 */
function buildTrackedUIImportMap(content) {
  const imports = extractImports(content);
  /** @type {Object<string, string>} */
  const map = {};
  for (const imp of imports) {
    if (!isTrackedUISource(imp.source)) continue;
    for (const { original, local } of parseNamedImports(imp.namedImports)) {
      if (TRACKED_COMPONENTS.includes(original)) {
        map[local] = original;
      }
    }
  }
  return map;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LINE NUMBER UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a lookup array mapping character offset → 1-based line number.
 *
 * Rather than scanning from the start for every offset, we precompute
 * the starting offset of each line.  Then `lineAt(offset)` is a binary
 * search.
 *
 * @param {string} content
 * @returns {number[]} Array of line-start offsets (0-based). Index i is the
 *   character offset where line (i+1) begins.
 */
function buildLineStarts(content) {
  const starts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
}

/**
 * Given pre-computed line starts, return the 1-based line number for a
 * character offset.
 *
 * @param {number[]} lineStarts - From {@link buildLineStarts}.
 * @param {number}   offset     - 0-based character index.
 * @returns {number} 1-based line number.
 */
function lineAt(lineStarts, offset) {
  // Binary search for the largest lineStart ≤ offset
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (lineStarts[mid] <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo + 1; // 1-based
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAG BOUNDARY DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find the closing `>` of a JSX opening tag, respecting nested `{…}`.
 *
 * @param {string} content
 * @param {number} startIdx - Position right after the tag name.
 * @returns {number} Index of `>`, or `-1`.
 */
function findTagEnd(content, startIdx) {
  let depth = 0;
  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}") depth--;
    else if (depth === 0 && content[i] === ">") return i;
  }
  return -1;
}

/**
 * Escape special regex characters.
 *
 * @param {string} s
 * @returns {string}
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ═══════════════════════════════════════════════════════════════════════════════
// LINE OWNERSHIP MEASUREMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Collect the set of 1-based line numbers that are "owned" by tracked UI library
 * import statements.
 *
 * An import like:
 *
 *     import {
 *       Button,
 *       Card,
 *     } from '<tracked-ui-library>'
 *
 * …spans 4 lines, all of which are counted as tracked UI library lines.
 *
 * To find the full extent of each import we scan from the match index
 * backward/forward to cover the entire statement (including multi-line
 * destructuring).
 *
 * @param {string}   content
 * @param {number[]} lineStarts
 * @returns {{ lines: Set<number>, importLineCount: number }}
 */
function collectImportLines(content, lineStarts) {
  const lines = new Set();

  // Match the full import statement including multi-line named imports.
  // We use a regex that captures from `import` to the closing quote + optional semicolon.
  const importRegex =
    /import\s+(?:\{[^}]*\}|\w+)(?:\s*,\s*(?:\{[^}]*\}|\w+))?\s+from\s+['"][^'"]+['"]\s*;?/gs;

  let m;
  while ((m = importRegex.exec(content)) !== null) {
    const fullMatch = m[0];
    const source = fullMatch.match(/from\s+['"]([^'"]+)['"]/);
    if (!source || !isTrackedUISource(source[1])) continue;

    const startOffset = m.index;
    const endOffset = m.index + fullMatch.length - 1;

    const startLine = lineAt(lineStarts, startOffset);
    const endLine = lineAt(lineStarts, endOffset);

    for (let line = startLine; line <= endLine; line++) {
      lines.add(line);
    }
  }

  return { lines, importLineCount: lines.size };
}

/**
 * Collect the set of 1-based line numbers that are "owned" by tracked UI library
 * JSX opening tags.
 *
 * For a tag like:
 *
 *     <Card
 *       padding={4}
 *       tone="primary"
 *     >
 *
 * …lines 1–4 are all tracked UI library lines.  The span runs from the `<` of the
 * opening tag through the closing `>`.
 *
 * @param {string}                  content
 * @param {number[]}                lineStarts
 * @param {Object<string, string>}  importMap
 * @returns {{ lines: Set<number>, tagLineCount: number, tagCount: number, linesByComponent: Object<string, Set<number>> }}
 */
function collectTagLines(content, lineStarts, importMap) {
  const localNames = Object.keys(importMap);
  if (localNames.length === 0) {
    return {
      lines: new Set(),
      tagLineCount: 0,
      tagCount: 0,
      linesByComponent: {},
    };
  }

  const pattern = localNames.map(escapeRegex).join("|");
  const tagRegex = new RegExp(`<(${pattern})\\b`, "g");

  const lines = new Set();
  /** @type {Object<string, Set<number>>} */
  const linesByComponent = {};
  let tagCount = 0;

  let openMatch;
  while ((openMatch = tagRegex.exec(content)) !== null) {
    const localName = openMatch[1];
    const original = importMap[localName];
    const tagStart = openMatch.index; // the `<` character
    const bodyStart = openMatch.index + openMatch[0].length;
    const tagEnd = findTagEnd(content, bodyStart);
    if (tagEnd === -1) continue;

    tagCount++;

    const startLine = lineAt(lineStarts, tagStart);
    const endLine = lineAt(lineStarts, tagEnd);

    if (!linesByComponent[original]) {
      linesByComponent[original] = new Set();
    }

    for (let line = startLine; line <= endLine; line++) {
      lines.add(line);
      linesByComponent[original].add(line);
    }
  }

  return { lines, tagLineCount: lines.size, tagCount, linesByComponent };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PER-FILE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} FileLineMetrics
 * @property {number}  totalLines         - Total lines in the file.
 * @property {number}  trackedUILines      - Lines owned by tracked UI library (deduplicated).
 * @property {number}  importLines        - Lines from tracked UI library imports.
 * @property {number}  tagLines           - Lines from tracked UI library JSX tags.
 * @property {number}  tagCount           - Number of tracked UI library opening tags.
 * @property {boolean} rendersUI          - Whether this file contains any JSX (React or HTML).
 * @property {Object<string, number>} linesByComponent - tracked UI library lines per component.
 */

/**
 * Analyse one file and return line-ownership metrics.
 *
 * Lines are deduplicated: if an import line and a tag line happen to be
 * the same physical line (unlikely but possible), it's counted once.
 *
 * @param {string} content
 * @returns {FileLineMetrics}
 */
function analyzeFileContent(content) {
  const totalLines = content === "" ? 0 : content.split("\n").length;
  const lineStarts = buildLineStarts(content);
  const importMap = buildTrackedUIImportMap(content);

  const importResult = collectImportLines(content, lineStarts);
  const tagResult = collectTagLines(content, lineStarts, importMap);

  // Merge line sets (deduplicate)
  const allLines = new Set([...importResult.lines, ...tagResult.lines]);

  // Convert per-component line sets to counts
  /** @type {Object<string, number>} */
  const linesByComponent = {};
  for (const [comp, lineSet] of Object.entries(tagResult.linesByComponent)) {
    linesByComponent[comp] = lineSet.size;
  }

  return {
    totalLines,
    trackedUILines: allLines.size,
    importLines: importResult.importLineCount,
    tagLines: tagResult.tagLineCount,
    tagCount: tagResult.tagCount,
    rendersUI: hasJSX(content),
    linesByComponent,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} CodebaseLineMetrics
 * @property {number} fileCount          - All files analysed.
 * @property {number} uiFileCount        - Files that render UI (contain JSX).
 * @property {number} filesWithTrackedUI  - Files containing ≥ 1 tracked UI library line.
 * @property {number} totalLines         - Grand total lines across ALL files.
 * @property {number} uiFileLines        - Lines across UI-rendering files only.
 * @property {number} trackedUILines      - Total tracked UI library lines (deduplicated per file).
 * @property {number} importLines        - Total import lines.
 * @property {number} tagLines           - Total tag lines.
 * @property {number} tagCount           - Total tracked UI library tags.
 * @property {Object<string, number>} linesByComponent - Lines per component.
 */

/**
 * Aggregate file-level metrics into a codebase summary.
 *
 * @param {FileLineMetrics[]} fileResults
 * @returns {CodebaseLineMetrics}
 */
function aggregateResults(fileResults) {
  /** @type {CodebaseLineMetrics} */
  const agg = {
    fileCount: fileResults.length,
    uiFileCount: 0,
    filesWithTrackedUI: 0,
    totalLines: 0,
    uiFileLines: 0,
    trackedUILines: 0,
    importLines: 0,
    tagLines: 0,
    tagCount: 0,
    linesByComponent: {},
  };

  for (const result of fileResults) {
    agg.totalLines += result.totalLines;
    agg.trackedUILines += result.trackedUILines;
    agg.importLines += result.importLines;
    agg.tagLines += result.tagLines;
    agg.tagCount += result.tagCount;

    if (result.rendersUI) {
      agg.uiFileCount++;
      agg.uiFileLines += result.totalLines;
    }

    if (result.trackedUILines > 0) {
      agg.filesWithTrackedUI++;
    }

    for (const [comp, lines] of Object.entries(result.linesByComponent)) {
      incr(agg.linesByComponent, comp, lines);
    }
  }

  return agg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT — Text
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate the markdown report.
 *
 * @param {Object<string, CodebaseLineMetrics | null>} results
 * @returns {string}
 */
function generateTextReport(results) {
  const lines = [];

  lines.push(`# ${UI_LIBRARY_NAMES} Line Ownership Analysis`);
  lines.push("");
  lines.push(
    `Measures the line-of-code footprint of ${UI_LIBRARY_NAMES} in each codebase.`,
  );
  lines.push(
    "Only files that render UI (contain JSX) are included in the denominator.",
  );
  lines.push("Pure logic files (hooks, types, utilities) are excluded.");
  lines.push(
    `A line is counted as '${UI_LIBRARY_NAMES}' if it is part of a tracked library import`,
  );
  lines.push(
    `statement or falls within a ${UI_LIBRARY_NAMES} JSX opening tag (including`,
  );
  lines.push(
    "multi-line prop spans). Each physical line is counted at most once.",
  );
  lines.push("");

  // ── Per-codebase sections ─────────────────────────────────────────────

  /** @type {CodebaseLineMetrics} */
  const grand = {
    fileCount: 0,
    uiFileCount: 0,
    filesWithTrackedUI: 0,
    totalLines: 0,
    uiFileLines: 0,
    trackedUILines: 0,
    importLines: 0,
    tagLines: 0,
    tagCount: 0,
    linesByComponent: {},
  };

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    grand.fileCount += data.fileCount;
    grand.uiFileCount += data.uiFileCount;
    grand.filesWithTrackedUI += data.filesWithTrackedUI;
    grand.totalLines += data.totalLines;
    grand.uiFileLines += data.uiFileLines;
    grand.trackedUILines += data.trackedUILines;
    grand.importLines += data.importLines;
    grand.tagLines += data.tagLines;
    grand.tagCount += data.tagCount;
    for (const [comp, count] of Object.entries(data.linesByComponent)) {
      incr(grand.linesByComponent, comp, count);
    }

    const p = pct(data.trackedUILines, data.uiFileLines);

    lines.push(`## ${codebase}`);
    lines.push("");
    lines.push(`- **Total files:** ${data.fileCount.toLocaleString()}`);
    lines.push(
      `- **UI files (with JSX):** ${data.uiFileCount.toLocaleString()}`,
    );
    lines.push(
      `- **Files with ${UI_LIBRARY_NAMES}:** ${data.filesWithTrackedUI.toLocaleString()}`,
    );
    lines.push(
      `- **${UI_LIBRARY_NAMES} tags found:** ${data.tagCount.toLocaleString()}`,
    );
    lines.push(
      `- **Total lines (all files):** ${data.totalLines.toLocaleString()}`,
    );
    lines.push(`- **UI file lines:** ${data.uiFileLines.toLocaleString()}`);
    lines.push(
      `- **${UI_LIBRARY_NAMES} lines:** ${data.trackedUILines.toLocaleString()}`,
    );
    lines.push(`  - Import lines: ${data.importLines.toLocaleString()}`);
    lines.push(`  - JSX tag lines: ${data.tagLines.toLocaleString()}`);
    lines.push(`- **Line ownership (UI):** ${p}%`);

    if (data.tagCount > 0) {
      const avgLinesPerTag = (data.tagLines / data.tagCount).toFixed(2);
      lines.push(`- **Avg lines per tag:** ${avgLinesPerTag}`);
    }
    lines.push("");

    // Top components by line count
    const sorted = sortByCount(data.linesByComponent);
    if (sorted.length > 0) {
      lines.push("### Top 20 Components by Line Ownership");
      lines.push("");
      lines.push("| Rank | Component | Lines | % of UI Lines | % of UI Code |");
      lines.push("| ---: | --- | ---: | ---: | ---: |");

      for (let i = 0; i < Math.min(20, sorted.length); i++) {
        const [comp, count] = sorted[i];
        lines.push(
          `| ${i + 1} | ${comp} | ${count.toLocaleString()} | ${pct(count, data.trackedUILines)}% | ${pct(count, data.uiFileLines)}% |`,
        );
      }
      lines.push("");
    }
  }

  // ── Aggregate section ─────────────────────────────────────────────────

  lines.push("## Aggregate — All Codebases Combined");
  lines.push("");
  lines.push(`- **Total files:** ${grand.fileCount.toLocaleString()}`);
  lines.push(
    `- **UI files (with JSX):** ${grand.uiFileCount.toLocaleString()}`,
  );
  lines.push(
    `- **Files with ${UI_LIBRARY_NAMES}:** ${grand.filesWithTrackedUI.toLocaleString()}`,
  );
  lines.push(
    `- **${UI_LIBRARY_NAMES} tags:** ${grand.tagCount.toLocaleString()}`,
  );
  lines.push(
    `- **Total lines (all files):** ${grand.totalLines.toLocaleString()}`,
  );
  lines.push(`- **UI file lines:** ${grand.uiFileLines.toLocaleString()}`);
  lines.push(
    `- **${UI_LIBRARY_NAMES} lines:** ${grand.trackedUILines.toLocaleString()}`,
  );
  lines.push(`  - Import lines: ${grand.importLines.toLocaleString()}`);
  lines.push(`  - JSX tag lines: ${grand.tagLines.toLocaleString()}`);
  lines.push(
    `- **Line ownership (UI):** ${pct(grand.trackedUILines, grand.uiFileLines)}%`,
  );

  if (grand.tagCount > 0) {
    const avgGrand = (grand.tagLines / grand.tagCount).toFixed(2);
    lines.push(`- **Avg lines per tag:** ${avgGrand}`);
  }
  lines.push("");

  // Comparison table
  lines.push("### Codebase Comparison (UI Files Only)");
  lines.push("");
  lines.push(
    "| Codebase | UI Files | UI Lines | SUI Lines | Import | JSX Tag | % Owned | Tags | Avg L/Tag |",
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;
    const avg =
      data.tagCount > 0 ? (data.tagLines / data.tagCount).toFixed(2) : "0.00";
    lines.push(
      `| ${codebase} | ${data.uiFileCount.toLocaleString()} | ${data.uiFileLines.toLocaleString()} | ${data.trackedUILines.toLocaleString()} | ${data.importLines.toLocaleString()} | ${data.tagLines.toLocaleString()} | ${pct(data.trackedUILines, data.uiFileLines)}% | ${data.tagCount.toLocaleString()} | ${avg} |`,
    );
  }

  const grandAvg =
    grand.tagCount > 0 ? (grand.tagLines / grand.tagCount).toFixed(2) : "0.00";

  lines.push(
    `| **TOTAL** | **${grand.uiFileCount.toLocaleString()}** | **${grand.uiFileLines.toLocaleString()}** | **${grand.trackedUILines.toLocaleString()}** | **${grand.importLines.toLocaleString()}** | **${grand.tagLines.toLocaleString()}** | **${pct(grand.trackedUILines, grand.uiFileLines)}%** | **${grand.tagCount.toLocaleString()}** | **${grandAvg}** |`,
  );
  lines.push("");

  // Top components across all codebases
  const grandSorted = sortByCount(grand.linesByComponent);
  if (grandSorted.length > 0) {
    lines.push("### Top 20 Components by Line Ownership (All Codebases)");
    lines.push("");
    lines.push("| Rank | Component | Lines | % of UI Lines | % of UI Code |");
    lines.push("| ---: | --- | ---: | ---: | ---: |");

    for (let i = 0; i < Math.min(20, grandSorted.length); i++) {
      const [comp, count] = grandSorted[i];
      lines.push(
        `| ${i + 1} | ${comp} | ${count.toLocaleString()} | ${pct(count, grand.trackedUILines)}% | ${pct(count, grand.uiFileLines)}% |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT — CSV
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a CSV report.
 *
 * @param {Object<string, CodebaseLineMetrics | null>} results
 * @returns {string}
 */
function generateCSV(results) {
  const rows = [];

  // Section 1: Codebase summary
  rows.push(
    `Codebase,Total Files,UI Files,Files with ${UI_LIBRARY_NAMES},Total Lines,UI File Lines,${UI_LIBRARY_NAMES} Lines,Import Lines,JSX Tag Lines,Line Ownership % (UI),Tags,Avg Lines per Tag`,
  );

  let grandTotal = 0;
  let grandUILines = 0;
  let grandUI = 0;
  let grandImport = 0;
  let grandTag = 0;
  let grandTags = 0;
  let grandUIFiles = 0;

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;
    grandTotal += data.totalLines;
    grandUILines += data.uiFileLines;
    grandUI += data.trackedUILines;
    grandImport += data.importLines;
    grandTag += data.tagLines;
    grandTags += data.tagCount;
    grandUIFiles += data.uiFileCount;

    const avg =
      data.tagCount > 0 ? (data.tagLines / data.tagCount).toFixed(2) : "0.00";

    rows.push(
      [
        codebase,
        data.fileCount,
        data.uiFileCount,
        data.filesWithTrackedUI,
        data.totalLines,
        data.uiFileLines,
        data.trackedUILines,
        data.importLines,
        data.tagLines,
        pct(data.trackedUILines, data.uiFileLines) + "%",
        data.tagCount,
        avg,
      ].join(","),
    );
  }

  const grandAvg = grandTags > 0 ? (grandTag / grandTags).toFixed(2) : "0.00";
  rows.push(
    [
      "TOTAL",
      "",
      grandUIFiles,
      "",
      grandTotal,
      grandUILines,
      grandUI,
      grandImport,
      grandTag,
      pct(grandUI, grandUILines) + "%",
      grandTags,
      grandAvg,
    ].join(","),
  );

  rows.push("");

  // Section 2: Per-component breakdown
  rows.push("Component,Codebase,Lines,% of UI Lines,% of UI Code");

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;
    const sorted = sortByCount(data.linesByComponent);
    for (const [comp, count] of sorted) {
      rows.push(
        [
          `"${comp}"`,
          codebase,
          count,
          pct(count, data.trackedUILines) + "%",
          pct(count, data.uiFileLines) + "%",
        ].join(","),
      );
    }
  }

  return rows.join("\n") + "\n";
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT — JSON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a JSON summary.
 *
 * @param {Object<string, CodebaseLineMetrics | null>} results
 * @returns {string}
 */
function generateJSON(results) {
  /** @type {Object<string, object>} */
  const codebaseSummaries = {};

  let grandTotal = 0;
  let grandUILines = 0;
  let grandUI = 0;
  let grandImport = 0;
  let grandTag = 0;
  let grandTags = 0;
  let grandFiles = 0;
  let grandUIFiles = 0;
  let grandFilesWithTrackedUI = 0;
  /** @type {Object<string, number>} */
  const grandByComponent = {};

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    grandTotal += data.totalLines;
    grandUILines += data.uiFileLines;
    grandUI += data.trackedUILines;
    grandImport += data.importLines;
    grandTag += data.tagLines;
    grandTags += data.tagCount;
    grandFiles += data.fileCount;
    grandUIFiles += data.uiFileCount;
    grandFilesWithTrackedUI += data.filesWithTrackedUI;

    for (const [comp, count] of Object.entries(data.linesByComponent)) {
      incr(grandByComponent, comp, count);
    }

    const sorted = sortByCount(data.linesByComponent);

    codebaseSummaries[codebase] = {
      fileCount: data.fileCount,
      uiFileCount: data.uiFileCount,
      filesWithTrackedUI: data.filesWithTrackedUI,
      totalLines: data.totalLines,
      uiFileLines: data.uiFileLines,
      trackedUILines: data.trackedUILines,
      importLines: data.importLines,
      tagLines: data.tagLines,
      lineOwnershipPercent: parseFloat(
        pct(data.trackedUILines, data.uiFileLines),
      ),
      trackedUITagCount: data.tagCount,
      avgLinesPerTag:
        data.tagCount > 0
          ? parseFloat((data.tagLines / data.tagCount).toFixed(2))
          : 0,
      topComponents: sorted.slice(0, 20).map(([comp, count]) => ({
        component: comp,
        lines: count,
        percentOfUILines: parseFloat(pct(count, data.trackedUILines)),
        percentOfUICode: parseFloat(pct(count, data.uiFileLines)),
      })),
    };
  }

  const grandSorted = sortByCount(grandByComponent);

  const summary = {
    generatedAt: new Date().toISOString(),
    codebases: codebaseSummaries,
    aggregate: {
      totalFiles: grandFiles,
      uiFileCount: grandUIFiles,
      filesWithTrackedUI: grandFilesWithTrackedUI,
      totalLines: grandTotal,
      uiFileLines: grandUILines,
      trackedUILines: grandUI,
      importLines: grandImport,
      tagLines: grandTag,
      lineOwnershipPercent: parseFloat(pct(grandUI, grandUILines)),
      trackedUITagCount: grandTags,
      avgLinesPerTag:
        grandTags > 0 ? parseFloat((grandTag / grandTags).toFixed(2)) : 0,
      topComponents: grandSorted.slice(0, 20).map(([comp, count]) => ({
        component: comp,
        lines: count,
        percentOfAllUILines: parseFloat(pct(count, grandUI)),
        percentOfUICode: parseFloat(pct(count, grandUILines)),
      })),
    },
  };

  return JSON.stringify(summary, null, 2);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CODEBASE RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyse a single codebase.
 *
 * @param {string} codebase
 * @returns {Promise<CodebaseLineMetrics | null>}
 */
async function analyzeCodebase(codebase) {
  if (!codebaseExists(codebase)) {
    console.log(`⚠️  Skipping ${codebase}: path not found`);
    return null;
  }

  console.log(`\n📊 Analyzing line ownership in ${codebase}...`);

  const files = await findFiles(codebase);
  console.log(`   Found ${files.length} component files`);

  /** @type {FileLineMetrics[]} */
  const fileResults = [];

  for (const file of files) {
    const content = readSafe(file);
    if (content === null) continue;
    fileResults.push(analyzeFileContent(content));
  }

  const agg = aggregateResults(fileResults);

  console.log(
    `   ${agg.uiFileCount} UI files (${agg.uiFileLines.toLocaleString()} lines), ${agg.trackedUILines.toLocaleString()} ${UI_LIBRARY_NAMES} lines (${pct(agg.trackedUILines, agg.uiFileLines)}%)`,
  );

  return agg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main entry point.
 *
 * @returns {Promise<void>}
 */
async function main() {
  console.log("═".repeat(60));
  console.log(`  ${UI_LIBRARY_NAMES.toUpperCase()} LINE OWNERSHIP ANALYSIS`);
  console.log("═".repeat(60));

  /** @type {Object<string, CodebaseLineMetrics | null>} */
  const results = {};

  for (const codebase of CODEBASES) {
    results[codebase] = await analyzeCodebase(codebase);
  }

  writeReports("line-ownership", "report", {
    text: generateTextReport(results),
    csv: generateCSV(results),
    json: generateJSON(results),
  });

  console.log("\n✅ Text report saved");
  console.log("✅ CSV report saved");
  console.log("✅ JSON report saved");

  // Quick console summary
  console.log("\n" + "─".repeat(60));
  console.log("  QUICK SUMMARY");
  console.log("─".repeat(60));

  let grandTotal = 0;
  let grandUI = 0;

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;
    grandTotal += data.uiFileLines;
    grandUI += data.trackedUILines;
    console.log(
      `  ${codebase.padEnd(12)}: ${data.uiFileLines.toLocaleString().padStart(9)} UI lines, ${data.trackedUILines.toLocaleString().padStart(7)} SUI lines → ${pct(data.trackedUILines, data.uiFileLines)}%`,
    );
  }

  console.log("  " + "─".repeat(56));
  console.log(
    `  ${"TOTAL".padEnd(12)}: ${grandTotal.toLocaleString().padStart(9)} UI lines, ${grandUI.toLocaleString().padStart(7)} SUI lines → ${pct(grandUI, grandTotal)}%`,
  );
  console.log("");
}

// ─── Module boundary ──────────────────────────────────────────────────────────

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  // JSX detection
  hasJSX,

  // Import parsing
  extractImports,
  parseNamedImports,
  isTrackedUISource,
  buildTrackedUIImportMap,

  // Line utilities
  buildLineStarts,
  lineAt,

  // Tag detection
  findTagEnd,
  escapeRegex,

  // Line collection
  collectImportLines,
  collectTagLines,

  // Per-file analysis
  analyzeFileContent,

  // Aggregation
  aggregateResults,

  // Report generation
  generateTextReport,
  generateCSV,
  generateJSON,
};
