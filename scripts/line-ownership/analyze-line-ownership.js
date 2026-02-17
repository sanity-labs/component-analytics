#!/usr/bin/env node

/**
 * @module line-ownership/analyze-line-ownership
 *
 * Line Ownership Analysis
 *
 * Measures the line-of-code footprint of Sanity UI across each codebase.
 * For every TSX/JSX file:
 *
 *   1. Count the total lines in the file.
 *   2. Identify lines that belong to Sanity UI:
 *      a. Import lines from `@sanity/ui`
 *      b. Lines within Sanity UI JSX opening tags (the `<Component` line
 *         plus every continuation line of props through the closing `>`)
 *   3. Each physical line is counted at most once even if it contains
 *      multiple Sanity UI constructs.
 *   4. Sum across all files per codebase.
 *
 * Output:
 *   - `reports/line-ownership/line-ownership-report.txt`
 *   - `reports/line-ownership/line-ownership-report.csv`
 *   - `reports/line-ownership/line-ownership-report.json`
 *
 * Run directly:
 *   node scripts/line-ownership/analyze-line-ownership.js
 *
 * Or via npm:
 *   npm run analyze:line-ownership
 */

const { CODEBASES, SANITY_UI_COMPONENTS } = require("../lib/constants");
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
 * Check whether an import source is `@sanity/ui` (not `/theme`).
 *
 * @param {string} source
 * @returns {boolean}
 */
function isSanityUISource(source) {
  return /@sanity\/ui(?!\/theme)/.test(source);
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
 * Build `{ localName → originalName }` for Sanity UI component imports.
 *
 * @param {string} content
 * @returns {Object<string, string>}
 */
function buildSanityUIImportMap(content) {
  const imports = extractImports(content);
  /** @type {Object<string, string>} */
  const map = {};
  for (const imp of imports) {
    if (!isSanityUISource(imp.source)) continue;
    for (const { original, local } of parseNamedImports(imp.namedImports)) {
      if (SANITY_UI_COMPONENTS.includes(original)) {
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
 * Collect the set of 1-based line numbers that are "owned" by Sanity UI
 * import statements.
 *
 * An import like:
 *
 *     import {
 *       Button,
 *       Card,
 *     } from '@sanity/ui'
 *
 * …spans 4 lines, all of which are counted as Sanity UI lines.
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
    if (!source || !isSanityUISource(source[1])) continue;

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
 * Collect the set of 1-based line numbers that are "owned" by Sanity UI
 * JSX opening tags.
 *
 * For a tag like:
 *
 *     <Card
 *       padding={4}
 *       tone="primary"
 *     >
 *
 * …lines 1–4 are all Sanity UI lines.  The span runs from the `<` of the
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
 * @property {number}  sanityUILines      - Lines owned by Sanity UI (deduplicated).
 * @property {number}  importLines        - Lines from Sanity UI imports.
 * @property {number}  tagLines           - Lines from Sanity UI JSX tags.
 * @property {number}  tagCount           - Number of Sanity UI opening tags.
 * @property {boolean} rendersUI          - Whether this file contains any JSX (React or HTML).
 * @property {Object<string, number>} linesByComponent - Sanity UI lines per component.
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
  const importMap = buildSanityUIImportMap(content);

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
    sanityUILines: allLines.size,
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
 * @property {number} filesWithSanityUI  - Files containing ≥ 1 Sanity UI line.
 * @property {number} totalLines         - Grand total lines across ALL files.
 * @property {number} uiFileLines        - Lines across UI-rendering files only.
 * @property {number} sanityUILines      - Total Sanity UI lines (deduplicated per file).
 * @property {number} importLines        - Total import lines.
 * @property {number} tagLines           - Total tag lines.
 * @property {number} tagCount           - Total Sanity UI tags.
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
    filesWithSanityUI: 0,
    totalLines: 0,
    uiFileLines: 0,
    sanityUILines: 0,
    importLines: 0,
    tagLines: 0,
    tagCount: 0,
    linesByComponent: {},
  };

  for (const result of fileResults) {
    agg.totalLines += result.totalLines;
    agg.sanityUILines += result.sanityUILines;
    agg.importLines += result.importLines;
    agg.tagLines += result.tagLines;
    agg.tagCount += result.tagCount;

    if (result.rendersUI) {
      agg.uiFileCount++;
      agg.uiFileLines += result.totalLines;
    }

    if (result.sanityUILines > 0) {
      agg.filesWithSanityUI++;
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
 * Generate the plain-text report.
 *
 * @param {Object<string, CodebaseLineMetrics | null>} results
 * @returns {string}
 */
function generateTextReport(results) {
  const lines = [];

  lines.push("═".repeat(90));
  lines.push("  SANITY UI LINE OWNERSHIP ANALYSIS");
  lines.push("═".repeat(90));
  lines.push("");
  lines.push(
    "  Measures the line-of-code footprint of Sanity UI in each codebase.",
  );
  lines.push(
    "  Only files that render UI (contain JSX) are included in the denominator.",
  );
  lines.push("  Pure logic files (hooks, types, utilities) are excluded.");
  lines.push(
    "  A line is counted as 'Sanity UI' if it is part of a @sanity/ui import",
  );
  lines.push(
    "  statement or falls within a Sanity UI JSX opening tag (including",
  );
  lines.push(
    "  multi-line prop spans).  Each physical line is counted at most once.",
  );
  lines.push("");

  // ── Per-codebase sections ─────────────────────────────────────────────

  /** @type {CodebaseLineMetrics} */
  const grand = {
    fileCount: 0,
    uiFileCount: 0,
    filesWithSanityUI: 0,
    totalLines: 0,
    uiFileLines: 0,
    sanityUILines: 0,
    importLines: 0,
    tagLines: 0,
    tagCount: 0,
    linesByComponent: {},
  };

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    grand.fileCount += data.fileCount;
    grand.uiFileCount += data.uiFileCount;
    grand.filesWithSanityUI += data.filesWithSanityUI;
    grand.totalLines += data.totalLines;
    grand.uiFileLines += data.uiFileLines;
    grand.sanityUILines += data.sanityUILines;
    grand.importLines += data.importLines;
    grand.tagLines += data.tagLines;
    grand.tagCount += data.tagCount;
    for (const [comp, count] of Object.entries(data.linesByComponent)) {
      incr(grand.linesByComponent, comp, count);
    }

    const p = pct(data.sanityUILines, data.uiFileLines);

    lines.push("─".repeat(90));
    lines.push(`  CODEBASE: ${codebase.toUpperCase()}`);
    lines.push("─".repeat(90));
    lines.push("");
    lines.push(
      `  Total files:                 ${data.fileCount.toLocaleString()}`,
    );
    lines.push(
      `  UI files (with JSX):         ${data.uiFileCount.toLocaleString()}`,
    );
    lines.push(
      `  Files with Sanity UI:        ${data.filesWithSanityUI.toLocaleString()}`,
    );
    lines.push(
      `  Sanity UI tags found:        ${data.tagCount.toLocaleString()}`,
    );
    lines.push("");
    lines.push(
      `  Total lines (all files):     ${data.totalLines.toLocaleString()}`,
    );
    lines.push(
      `  UI file lines:               ${data.uiFileLines.toLocaleString()}`,
    );
    lines.push(
      `  Sanity UI lines:             ${data.sanityUILines.toLocaleString()}`,
    );
    lines.push(
      `    ├─ Import lines:           ${data.importLines.toLocaleString()}`,
    );
    lines.push(
      `    └─ JSX tag lines:          ${data.tagLines.toLocaleString()}`,
    );
    lines.push(`  Line ownership (UI):         ${p}%`);
    lines.push("");

    if (data.tagCount > 0) {
      const avgLinesPerTag = (data.tagLines / data.tagCount).toFixed(2);
      lines.push(`  Avg lines per tag:           ${avgLinesPerTag}`);
      lines.push("");
    }

    // Top components by line count
    const sorted = sortByCount(data.linesByComponent);
    if (sorted.length > 0) {
      lines.push("  TOP 20 COMPONENTS BY LINE OWNERSHIP");
      lines.push(
        "  " +
          "Rank".padEnd(6) +
          "Component".padEnd(28) +
          "Lines".padStart(10) +
          "  " +
          "% of UI Lines".padStart(13) +
          "  " +
          "% of UI Code".padStart(13),
      );
      lines.push("  " + "-".repeat(74));

      for (let i = 0; i < Math.min(20, sorted.length); i++) {
        const [comp, count] = sorted[i];
        lines.push(
          "  " +
            String(i + 1).padEnd(6) +
            comp.padEnd(28) +
            count.toLocaleString().padStart(10) +
            "  " +
            (pct(count, data.sanityUILines) + "%").padStart(13) +
            "  " +
            (pct(count, data.uiFileLines) + "%").padStart(13),
        );
      }
      lines.push("");
    }
  }

  // ── Aggregate section ─────────────────────────────────────────────────

  lines.push("═".repeat(90));
  lines.push("  AGGREGATE — ALL CODEBASES COMBINED");
  lines.push("═".repeat(90));
  lines.push("");
  lines.push(
    `  Total files:                 ${grand.fileCount.toLocaleString()}`,
  );
  lines.push(
    `  UI files (with JSX):         ${grand.uiFileCount.toLocaleString()}`,
  );
  lines.push(
    `  Files with Sanity UI:        ${grand.filesWithSanityUI.toLocaleString()}`,
  );
  lines.push(
    `  Sanity UI tags:              ${grand.tagCount.toLocaleString()}`,
  );
  lines.push("");
  lines.push(
    `  Total lines (all files):     ${grand.totalLines.toLocaleString()}`,
  );
  lines.push(
    `  UI file lines:               ${grand.uiFileLines.toLocaleString()}`,
  );
  lines.push(
    `  Sanity UI lines:             ${grand.sanityUILines.toLocaleString()}`,
  );
  lines.push(
    `    ├─ Import lines:           ${grand.importLines.toLocaleString()}`,
  );
  lines.push(
    `    └─ JSX tag lines:          ${grand.tagLines.toLocaleString()}`,
  );
  lines.push(
    `  Line ownership (UI):         ${pct(grand.sanityUILines, grand.uiFileLines)}%`,
  );
  lines.push("");

  if (grand.tagCount > 0) {
    const avgGrand = (grand.tagLines / grand.tagCount).toFixed(2);
    lines.push(`  Avg lines per tag:           ${avgGrand}`);
    lines.push("");
  }

  // Comparison table
  lines.push("  CODEBASE COMPARISON (UI FILES ONLY)");
  lines.push(
    "  " +
      "Codebase".padEnd(14) +
      "UI Files".padStart(10) +
      "  " +
      "UI Lines".padStart(11) +
      "  " +
      "SUI Lines".padStart(10) +
      "  " +
      "Import".padStart(8) +
      "  " +
      "JSX Tag".padStart(8) +
      "  " +
      "% Owned".padStart(8) +
      "  " +
      "Tags".padStart(7) +
      "  " +
      "Avg L/Tag".padStart(9),
  );
  lines.push("  " + "-".repeat(95));

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;
    const avg =
      data.tagCount > 0 ? (data.tagLines / data.tagCount).toFixed(2) : "0.00";
    lines.push(
      "  " +
        codebase.padEnd(14) +
        data.uiFileCount.toLocaleString().padStart(10) +
        "  " +
        data.uiFileLines.toLocaleString().padStart(11) +
        "  " +
        data.sanityUILines.toLocaleString().padStart(10) +
        "  " +
        data.importLines.toLocaleString().padStart(8) +
        "  " +
        data.tagLines.toLocaleString().padStart(8) +
        "  " +
        (pct(data.sanityUILines, data.uiFileLines) + "%").padStart(8) +
        "  " +
        data.tagCount.toLocaleString().padStart(7) +
        "  " +
        avg.padStart(9),
    );
  }

  lines.push("  " + "-".repeat(95));

  const grandAvg =
    grand.tagCount > 0 ? (grand.tagLines / grand.tagCount).toFixed(2) : "0.00";

  lines.push(
    "  " +
      "TOTAL".padEnd(14) +
      grand.uiFileCount.toLocaleString().padStart(10) +
      "  " +
      grand.uiFileLines.toLocaleString().padStart(11) +
      "  " +
      grand.sanityUILines.toLocaleString().padStart(10) +
      "  " +
      grand.importLines.toLocaleString().padStart(8) +
      "  " +
      grand.tagLines.toLocaleString().padStart(8) +
      "  " +
      (pct(grand.sanityUILines, grand.uiFileLines) + "%").padStart(8) +
      "  " +
      grand.tagCount.toLocaleString().padStart(7) +
      "  " +
      grandAvg.padStart(9),
  );
  lines.push("");

  // Top components across all codebases
  const grandSorted = sortByCount(grand.linesByComponent);
  if (grandSorted.length > 0) {
    lines.push("  TOP 20 COMPONENTS BY LINE OWNERSHIP (ALL CODEBASES)");
    lines.push(
      "  " +
        "Rank".padEnd(6) +
        "Component".padEnd(28) +
        "Lines".padStart(10) +
        "  " +
        "% of UI Lines".padStart(13) +
        "  " +
        "% of UI Code".padStart(13),
    );
    lines.push("  " + "-".repeat(74));

    for (let i = 0; i < Math.min(20, grandSorted.length); i++) {
      const [comp, count] = grandSorted[i];
      lines.push(
        "  " +
          String(i + 1).padEnd(6) +
          comp.padEnd(28) +
          count.toLocaleString().padStart(10) +
          "  " +
          (pct(count, grand.sanityUILines) + "%").padStart(13) +
          "  " +
          (pct(count, grand.uiFileLines) + "%").padStart(13),
      );
    }
    lines.push("");
  }

  lines.push("═".repeat(90));
  lines.push("");

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
    "Codebase,Total Files,UI Files,Files with Sanity UI,Total Lines,UI File Lines,Sanity UI Lines,Import Lines,JSX Tag Lines,Line Ownership % (UI),Tags,Avg Lines per Tag",
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
    grandUI += data.sanityUILines;
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
        data.filesWithSanityUI,
        data.totalLines,
        data.uiFileLines,
        data.sanityUILines,
        data.importLines,
        data.tagLines,
        pct(data.sanityUILines, data.uiFileLines) + "%",
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
          pct(count, data.sanityUILines) + "%",
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
  let grandFilesWithSanityUI = 0;
  /** @type {Object<string, number>} */
  const grandByComponent = {};

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    grandTotal += data.totalLines;
    grandUILines += data.uiFileLines;
    grandUI += data.sanityUILines;
    grandImport += data.importLines;
    grandTag += data.tagLines;
    grandTags += data.tagCount;
    grandFiles += data.fileCount;
    grandUIFiles += data.uiFileCount;
    grandFilesWithSanityUI += data.filesWithSanityUI;

    for (const [comp, count] of Object.entries(data.linesByComponent)) {
      incr(grandByComponent, comp, count);
    }

    const sorted = sortByCount(data.linesByComponent);

    codebaseSummaries[codebase] = {
      fileCount: data.fileCount,
      uiFileCount: data.uiFileCount,
      filesWithSanityUI: data.filesWithSanityUI,
      totalLines: data.totalLines,
      uiFileLines: data.uiFileLines,
      sanityUILines: data.sanityUILines,
      importLines: data.importLines,
      tagLines: data.tagLines,
      lineOwnershipPercent: parseFloat(
        pct(data.sanityUILines, data.uiFileLines),
      ),
      sanityUITagCount: data.tagCount,
      avgLinesPerTag:
        data.tagCount > 0
          ? parseFloat((data.tagLines / data.tagCount).toFixed(2))
          : 0,
      topComponents: sorted.slice(0, 20).map(([comp, count]) => ({
        component: comp,
        lines: count,
        percentOfUILines: parseFloat(pct(count, data.sanityUILines)),
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
      filesWithSanityUI: grandFilesWithSanityUI,
      totalLines: grandTotal,
      uiFileLines: grandUILines,
      sanityUILines: grandUI,
      importLines: grandImport,
      tagLines: grandTag,
      lineOwnershipPercent: parseFloat(pct(grandUI, grandUILines)),
      sanityUITagCount: grandTags,
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
    `   ${agg.uiFileCount} UI files (${agg.uiFileLines.toLocaleString()} lines), ${agg.sanityUILines.toLocaleString()} Sanity UI lines (${pct(agg.sanityUILines, agg.uiFileLines)}%)`,
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
  console.log("  SANITY UI LINE OWNERSHIP ANALYSIS");
  console.log("═".repeat(60));

  /** @type {Object<string, CodebaseLineMetrics | null>} */
  const results = {};

  for (const codebase of CODEBASES) {
    results[codebase] = await analyzeCodebase(codebase);
  }

  writeReports("line-ownership", "line-ownership", {
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
    grandUI += data.sanityUILines;
    console.log(
      `  ${codebase.padEnd(12)}: ${data.uiFileLines.toLocaleString().padStart(9)} UI lines, ${data.sanityUILines.toLocaleString().padStart(7)} SUI lines → ${pct(data.sanityUILines, data.uiFileLines)}%`,
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
  isSanityUISource,
  buildSanityUIImportMap,

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
