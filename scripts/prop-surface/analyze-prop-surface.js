#!/usr/bin/env node

/**
 * @module prop-surface/analyze-prop-surface
 *
 * Prop Surface Area Analysis
 *
 * Measures the character footprint of Sanity UI component props relative
 * to the total size of each codebase.  For every TSX/JSX file:
 *
 *   1. Count the total characters in the file.
 *   2. Find every Sanity UI component JSX opening tag.
 *   3. Measure the character length of the props portion of each tag
 *      (everything between the component name and the closing `>` / `/>`,
 *      excluding the angle brackets and component name themselves).
 *   4. Sum across all files per codebase.
 *
 * Output:
 *   - `reports/prop-surface/prop-surface-report.txt`
 *   - `reports/prop-surface/prop-surface-report.csv`
 *   - `reports/prop-surface/prop-surface-report.json`
 *
 * Run directly:
 *   node scripts/prop-surface/analyze-prop-surface.js
 *
 * Or via npm:
 *   npm run analyze:prop-surface
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
  // Matches <Tag or <tag followed by whitespace, /, or >
  return /<[a-zA-Z][a-zA-Z0-9]*[\s/>]/.test(content);
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT PARSING (mirrors per-component logic)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract ES import statements from file content.
 *
 * @param {string} content
 * @returns {Array<{ namedImports: string|null, defaultImport: string|null, source: string }>}
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
 * Check whether an import source is `@sanity/ui` (not `/theme`).
 *
 * @param {string} source
 * @returns {boolean}
 */
function isSanityUISource(source) {
  return /@sanity\/ui(?!\/theme)/.test(source);
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
// PROP SURFACE MEASUREMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} PropSpan
 * @property {string} component  - Original @sanity/ui component name.
 * @property {number} startIdx   - Character index where the props body starts (right after the component name).
 * @property {number} endIdx     - Character index of the closing `>` (exclusive).
 * @property {number} charCount  - Number of characters in the props body (endIdx - startIdx).
 */

/**
 * Find every Sanity UI component opening tag in a file and measure
 * the character span of its props body.
 *
 * The props body is defined as the substring between the end of the
 * component name and the closing `>` or `/>`.  For example:
 *
 *     <Card padding={4} tone="primary" border>
 *          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 *          ← this portion is the props body →
 *
 * Self-closing `/>` counts as part of the span since it sits inside
 * the tag.  The opening `<ComponentName` and the final `>` are excluded.
 *
 * @param {string} content          - Full file content.
 * @param {Object<string, string>}  importMap - local → original Sanity UI map.
 * @returns {PropSpan[]}
 */
function measurePropSpans(content, importMap) {
  const localNames = Object.keys(importMap);
  if (localNames.length === 0) return [];

  const pattern = localNames.map(escapeRegex).join("|");
  const tagRegex = new RegExp(`<(${pattern})\\b`, "g");

  /** @type {PropSpan[]} */
  const spans = [];
  let openMatch;

  while ((openMatch = tagRegex.exec(content)) !== null) {
    const localName = openMatch[1];
    const original = importMap[localName];
    const bodyStart = openMatch.index + openMatch[0].length;
    const tagEnd = findTagEnd(content, bodyStart);
    if (tagEnd === -1) continue;

    // The props body runs from bodyStart to tagEnd (exclusive of the `>` itself).
    const charCount = tagEnd - bodyStart;

    spans.push({
      component: original,
      startIdx: bodyStart,
      endIdx: tagEnd,
      charCount,
    });
  }

  return spans;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PER-FILE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} FileMetrics
 * @property {number}  totalChars          - Total characters in the file.
 * @property {number}  sanityUIPropChars   - Characters occupied by Sanity UI props.
 * @property {number}  sanityUITagCount    - Number of Sanity UI opening tags found.
 * @property {boolean} rendersUI           - Whether this file contains any JSX (React or HTML).
 * @property {Object<string, number>} charsByComponent - Prop chars broken down by component.
 */

/**
 * Analyse one file and return character metrics.
 *
 * @param {string} content - File content.
 * @returns {FileMetrics}
 */
function analyzeFileContent(content) {
  const totalChars = content.length;
  const importMap = buildSanityUIImportMap(content);
  const spans = measurePropSpans(content, importMap);

  let sanityUIPropChars = 0;
  /** @type {Object<string, number>} */
  const charsByComponent = {};

  for (const span of spans) {
    sanityUIPropChars += span.charCount;
    incr(charsByComponent, span.component, span.charCount);
  }

  return {
    totalChars,
    sanityUIPropChars,
    sanityUITagCount: spans.length,
    rendersUI: hasJSX(content),
    charsByComponent,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} CodebaseMetrics
 * @property {number} fileCount           - All files analysed.
 * @property {number} uiFileCount         - Files that render UI (contain JSX).
 * @property {number} filesWithSanityUI   - Files containing ≥ 1 Sanity UI tag.
 * @property {number} totalChars          - Characters across ALL files.
 * @property {number} uiFileChars         - Characters across UI-rendering files only.
 * @property {number} sanityUIPropChars   - Total Sanity UI prop characters.
 * @property {number} sanityUITagCount    - Total Sanity UI opening tags.
 * @property {Object<string, number>} charsByComponent - Prop chars per component.
 */

/**
 * Aggregate file-level metrics into a codebase summary.
 *
 * @param {FileMetrics[]} fileResults
 * @returns {CodebaseMetrics}
 */
function aggregateResults(fileResults) {
  /** @type {CodebaseMetrics} */
  const agg = {
    fileCount: fileResults.length,
    uiFileCount: 0,
    filesWithSanityUI: 0,
    totalChars: 0,
    uiFileChars: 0,
    sanityUIPropChars: 0,
    sanityUITagCount: 0,
    charsByComponent: {},
  };

  for (const result of fileResults) {
    agg.totalChars += result.totalChars;
    agg.sanityUIPropChars += result.sanityUIPropChars;
    agg.sanityUITagCount += result.sanityUITagCount;

    if (result.rendersUI) {
      agg.uiFileCount++;
      agg.uiFileChars += result.totalChars;
    }

    if (result.sanityUITagCount > 0) {
      agg.filesWithSanityUI++;
    }

    for (const [comp, chars] of Object.entries(result.charsByComponent)) {
      incr(agg.charsByComponent, comp, chars);
    }
  }

  return agg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT — Text
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format a size in characters as a human-friendly string (e.g. "1.2 MB").
 *
 * @param {number} chars
 * @returns {string}
 */
function formatSize(chars) {
  if (chars >= 1_000_000) return (chars / 1_000_000).toFixed(2) + " MB";
  if (chars >= 1_000) return (chars / 1_000).toFixed(1) + " KB";
  return chars + " chars";
}

/**
 * Generate the plain-text report.
 *
 * @param {Object<string, CodebaseMetrics | null>} results - Keyed by codebase name.
 * @returns {string}
 */
function generateTextReport(results) {
  const lines = [];

  lines.push("═".repeat(90));
  lines.push("  SANITY UI PROP SURFACE AREA ANALYSIS");
  lines.push("═".repeat(90));
  lines.push("");
  lines.push(
    "  Measures the character footprint of Sanity UI component props/attributes",
  );
  lines.push(
    "  relative to files that render UI (contain JSX).  Pure logic files",
  );
  lines.push("  (hooks, types, utilities) are excluded from the denominator.");
  lines.push("");

  // ── Per-codebase sections ─────────────────────────────────────────────

  /** @type {CodebaseMetrics} */
  const grand = {
    fileCount: 0,
    uiFileCount: 0,
    filesWithSanityUI: 0,
    totalChars: 0,
    uiFileChars: 0,
    sanityUIPropChars: 0,
    sanityUITagCount: 0,
    charsByComponent: {},
  };

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    grand.fileCount += data.fileCount;
    grand.uiFileCount += data.uiFileCount;
    grand.filesWithSanityUI += data.filesWithSanityUI;
    grand.totalChars += data.totalChars;
    grand.uiFileChars += data.uiFileChars;
    grand.sanityUIPropChars += data.sanityUIPropChars;
    grand.sanityUITagCount += data.sanityUITagCount;
    for (const [comp, chars] of Object.entries(data.charsByComponent)) {
      incr(grand.charsByComponent, comp, chars);
    }

    const p = pct(data.sanityUIPropChars, data.uiFileChars);

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
      `  Sanity UI tags found:        ${data.sanityUITagCount.toLocaleString()}`,
    );
    lines.push("");
    lines.push(
      `  Total chars (all files):     ${data.totalChars.toLocaleString()}  (${formatSize(data.totalChars)})`,
    );
    lines.push(
      `  UI file chars:               ${data.uiFileChars.toLocaleString()}  (${formatSize(data.uiFileChars)})`,
    );
    lines.push(
      `  Sanity UI prop chars:        ${data.sanityUIPropChars.toLocaleString()}  (${formatSize(data.sanityUIPropChars)})`,
    );
    lines.push(`  Prop surface area (UI):      ${p}%`);
    lines.push("");

    if (data.sanityUITagCount > 0) {
      const avgCharsPerTag = (
        data.sanityUIPropChars / data.sanityUITagCount
      ).toFixed(1);
      lines.push(`  Avg prop chars per tag:      ${avgCharsPerTag}`);
      lines.push("");
    }

    // Top components by prop character usage
    const sorted = sortByCount(data.charsByComponent);
    if (sorted.length > 0) {
      lines.push("  TOP 20 COMPONENTS BY PROP CHARACTER USAGE");
      lines.push(
        "  " +
          "Rank".padEnd(6) +
          "Component".padEnd(28) +
          "Prop Chars".padStart(12) +
          "  " +
          "% of Props".padStart(10) +
          "  " +
          "% of UI Code".padStart(13),
      );
      lines.push("  " + "-".repeat(73));

      for (let i = 0; i < Math.min(20, sorted.length); i++) {
        const [comp, chars] = sorted[i];
        lines.push(
          "  " +
            String(i + 1).padEnd(6) +
            comp.padEnd(28) +
            chars.toLocaleString().padStart(12) +
            "  " +
            (pct(chars, data.sanityUIPropChars) + "%").padStart(10) +
            "  " +
            (pct(chars, data.uiFileChars) + "%").padStart(13),
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
    `  Sanity UI tags:              ${grand.sanityUITagCount.toLocaleString()}`,
  );
  lines.push("");
  lines.push(
    `  Total chars (all files):     ${grand.totalChars.toLocaleString()}  (${formatSize(grand.totalChars)})`,
  );
  lines.push(
    `  UI file chars:               ${grand.uiFileChars.toLocaleString()}  (${formatSize(grand.uiFileChars)})`,
  );
  lines.push(
    `  Sanity UI prop chars:        ${grand.sanityUIPropChars.toLocaleString()}  (${formatSize(grand.sanityUIPropChars)})`,
  );
  lines.push(
    `  Prop surface area (UI):      ${pct(grand.sanityUIPropChars, grand.uiFileChars)}%`,
  );
  lines.push("");

  if (grand.sanityUITagCount > 0) {
    const avgGrand = (grand.sanityUIPropChars / grand.sanityUITagCount).toFixed(
      1,
    );
    lines.push(`  Avg prop chars per tag:      ${avgGrand}`);
    lines.push("");
  }

  // Summary table
  lines.push("  CODEBASE COMPARISON (UI FILES ONLY)");
  lines.push(
    "  " +
      "Codebase".padEnd(14) +
      "UI Files".padStart(10) +
      "  " +
      "UI Chars".padStart(14) +
      "  " +
      "Prop Chars".padStart(12) +
      "  " +
      "% Surface".padStart(10) +
      "  " +
      "Tags".padStart(8) +
      "  " +
      "Avg/Tag".padStart(8),
  );
  lines.push("  " + "-".repeat(82));

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;
    const avg =
      data.sanityUITagCount > 0
        ? (data.sanityUIPropChars / data.sanityUITagCount).toFixed(1)
        : "0.0";
    lines.push(
      "  " +
        codebase.padEnd(14) +
        data.uiFileCount.toLocaleString().padStart(10) +
        "  " +
        data.uiFileChars.toLocaleString().padStart(14) +
        "  " +
        data.sanityUIPropChars.toLocaleString().padStart(12) +
        "  " +
        (pct(data.sanityUIPropChars, data.uiFileChars) + "%").padStart(10) +
        "  " +
        data.sanityUITagCount.toLocaleString().padStart(8) +
        "  " +
        avg.padStart(8),
    );
  }

  lines.push("  " + "-".repeat(82));

  const grandAvg =
    grand.sanityUITagCount > 0
      ? (grand.sanityUIPropChars / grand.sanityUITagCount).toFixed(1)
      : "0.0";

  lines.push(
    "  " +
      "TOTAL".padEnd(14) +
      grand.uiFileCount.toLocaleString().padStart(10) +
      "  " +
      grand.uiFileChars.toLocaleString().padStart(14) +
      "  " +
      grand.sanityUIPropChars.toLocaleString().padStart(12) +
      "  " +
      (pct(grand.sanityUIPropChars, grand.uiFileChars) + "%").padStart(10) +
      "  " +
      grand.sanityUITagCount.toLocaleString().padStart(8) +
      "  " +
      grandAvg.padStart(8),
  );

  lines.push("");

  // Top components across all codebases
  const grandSorted = sortByCount(grand.charsByComponent);
  if (grandSorted.length > 0) {
    lines.push("  TOP 20 COMPONENTS BY PROP CHARACTER USAGE (ALL CODEBASES)");
    lines.push(
      "  " +
        "Rank".padEnd(6) +
        "Component".padEnd(28) +
        "Prop Chars".padStart(12) +
        "  " +
        "% of All Props".padStart(14) +
        "  " +
        "% of UI Code".padStart(13),
    );
    lines.push("  " + "-".repeat(77));

    for (let i = 0; i < Math.min(20, grandSorted.length); i++) {
      const [comp, chars] = grandSorted[i];
      lines.push(
        "  " +
          String(i + 1).padEnd(6) +
          comp.padEnd(28) +
          chars.toLocaleString().padStart(12) +
          "  " +
          (pct(chars, grand.sanityUIPropChars) + "%").padStart(14) +
          "  " +
          (pct(chars, grand.uiFileChars) + "%").padStart(13),
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
 * Two sections:
 *   1. Codebase-level summary rows
 *   2. Per-component breakdown rows
 *
 * @param {Object<string, CodebaseMetrics | null>} results
 * @returns {string}
 */
function generateCSV(results) {
  const rows = [];

  // Section 1: Codebase summary
  rows.push(
    "Codebase,Total Files,UI Files,Files with Sanity UI,Total Characters,UI File Characters,Sanity UI Prop Characters,Prop Surface % (UI),Sanity UI Tags,Avg Chars per Tag",
  );

  let grandTotalChars = 0;
  let grandUIChars = 0;
  let grandPropChars = 0;
  let grandTags = 0;
  let grandUIFiles = 0;

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;
    grandTotalChars += data.totalChars;
    grandUIChars += data.uiFileChars;
    grandPropChars += data.sanityUIPropChars;
    grandTags += data.sanityUITagCount;
    grandUIFiles += data.uiFileCount;

    const avg =
      data.sanityUITagCount > 0
        ? (data.sanityUIPropChars / data.sanityUITagCount).toFixed(1)
        : "0.0";

    rows.push(
      [
        codebase,
        data.fileCount,
        data.uiFileCount,
        data.filesWithSanityUI,
        data.totalChars,
        data.uiFileChars,
        data.sanityUIPropChars,
        pct(data.sanityUIPropChars, data.uiFileChars) + "%",
        data.sanityUITagCount,
        avg,
      ].join(","),
    );
  }

  // Total row
  const grandAvg =
    grandTags > 0 ? (grandPropChars / grandTags).toFixed(1) : "0.0";
  rows.push(
    [
      "TOTAL",
      "",
      grandUIFiles,
      "",
      grandTotalChars,
      grandUIChars,
      grandPropChars,
      pct(grandPropChars, grandUIChars) + "%",
      grandTags,
      grandAvg,
    ].join(","),
  );

  rows.push("");

  // Section 2: Per-component breakdown
  rows.push(
    "Component,Codebase,Prop Characters,% of Codebase Props,% of UI Code",
  );

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    const sorted = sortByCount(data.charsByComponent);
    for (const [comp, chars] of sorted) {
      rows.push(
        [
          `"${comp}"`,
          codebase,
          chars,
          pct(chars, data.sanityUIPropChars) + "%",
          pct(chars, data.uiFileChars) + "%",
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
 * @param {Object<string, CodebaseMetrics | null>} results
 * @returns {string}
 */
function generateJSON(results) {
  /** @type {Object<string, object>} */
  const codebaseSummaries = {};

  let grandTotalChars = 0;
  let grandUIChars = 0;
  let grandPropChars = 0;
  let grandTags = 0;
  let grandFiles = 0;
  let grandUIFiles = 0;
  let grandFilesWithSanityUI = 0;
  /** @type {Object<string, number>} */
  const grandCharsByComponent = {};

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    grandTotalChars += data.totalChars;
    grandUIChars += data.uiFileChars;
    grandPropChars += data.sanityUIPropChars;
    grandTags += data.sanityUITagCount;
    grandFiles += data.fileCount;
    grandUIFiles += data.uiFileCount;
    grandFilesWithSanityUI += data.filesWithSanityUI;

    for (const [comp, chars] of Object.entries(data.charsByComponent)) {
      incr(grandCharsByComponent, comp, chars);
    }

    const sorted = sortByCount(data.charsByComponent);

    codebaseSummaries[codebase] = {
      fileCount: data.fileCount,
      uiFileCount: data.uiFileCount,
      filesWithSanityUI: data.filesWithSanityUI,
      totalCharacters: data.totalChars,
      uiFileCharacters: data.uiFileChars,
      sanityUIPropCharacters: data.sanityUIPropChars,
      propSurfacePercent: parseFloat(
        pct(data.sanityUIPropChars, data.uiFileChars),
      ),
      sanityUITagCount: data.sanityUITagCount,
      avgPropCharsPerTag:
        data.sanityUITagCount > 0
          ? parseFloat(
              (data.sanityUIPropChars / data.sanityUITagCount).toFixed(1),
            )
          : 0,
      topComponents: sorted.slice(0, 20).map(([comp, chars]) => ({
        component: comp,
        propChars: chars,
        percentOfProps: parseFloat(pct(chars, data.sanityUIPropChars)),
        percentOfUICode: parseFloat(pct(chars, data.uiFileChars)),
      })),
    };
  }

  const grandSorted = sortByCount(grandCharsByComponent);

  const summary = {
    generatedAt: new Date().toISOString(),
    codebases: codebaseSummaries,
    aggregate: {
      totalFiles: grandFiles,
      uiFileCount: grandUIFiles,
      filesWithSanityUI: grandFilesWithSanityUI,
      totalCharacters: grandTotalChars,
      uiFileCharacters: grandUIChars,
      sanityUIPropCharacters: grandPropChars,
      propSurfacePercent: parseFloat(pct(grandPropChars, grandUIChars)),
      sanityUITagCount: grandTags,
      avgPropCharsPerTag:
        grandTags > 0 ? parseFloat((grandPropChars / grandTags).toFixed(1)) : 0,
      topComponents: grandSorted.slice(0, 20).map(([comp, chars]) => ({
        component: comp,
        propChars: chars,
        percentOfAllProps: parseFloat(pct(chars, grandPropChars)),
        percentOfUICode: parseFloat(pct(chars, grandUIChars)),
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
 * @returns {Promise<CodebaseMetrics | null>}
 */
async function analyzeCodebase(codebase) {
  if (!codebaseExists(codebase)) {
    console.log(`⚠️  Skipping ${codebase}: path not found`);
    return null;
  }

  console.log(`\n📊 Analyzing prop surface area in ${codebase}...`);

  const files = await findFiles(codebase);
  console.log(`   Found ${files.length} component files`);

  /** @type {FileMetrics[]} */
  const fileResults = [];

  for (const file of files) {
    const content = readSafe(file);
    if (content === null) continue;
    fileResults.push(analyzeFileContent(content));
  }

  const agg = aggregateResults(fileResults);

  const p = pct(agg.sanityUIPropChars, agg.uiFileChars);
  console.log(
    `   ${agg.uiFileCount} UI files (${formatSize(agg.uiFileChars)}), ${formatSize(agg.sanityUIPropChars)} Sanity UI props (${p}%)`,
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
  console.log("  SANITY UI PROP SURFACE AREA ANALYSIS");
  console.log("═".repeat(60));

  /** @type {Object<string, CodebaseMetrics | null>} */
  const results = {};

  for (const codebase of CODEBASES) {
    results[codebase] = await analyzeCodebase(codebase);
  }

  writeReports("prop-surface", "prop-surface", {
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
  let grandProps = 0;

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;
    grandTotal += data.uiFileChars;
    grandProps += data.sanityUIPropChars;
    console.log(
      `  ${codebase.padEnd(12)}: ${formatSize(data.uiFileChars).padStart(10)} UI code, ${formatSize(data.sanityUIPropChars).padStart(10)} props → ${pct(data.sanityUIPropChars, data.uiFileChars)}%`,
    );
  }

  console.log("  " + "─".repeat(56));
  console.log(
    `  ${"TOTAL".padEnd(12)}: ${formatSize(grandTotal).padStart(10)} UI code, ${formatSize(grandProps).padStart(10)} props → ${pct(grandProps, grandTotal)}%`,
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

  // Tag detection
  findTagEnd,
  escapeRegex,

  // Measurement
  measurePropSpans,
  analyzeFileContent,

  // Aggregation
  aggregateResults,

  // Formatting
  formatSize,

  // Report generation
  generateTextReport,
  generateCSV,
  generateJSON,
};
