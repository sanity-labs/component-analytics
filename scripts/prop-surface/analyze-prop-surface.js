#!/usr/bin/env node

/**
 * @module prop-surface/analyze-prop-surface
 *
 * Prop Surface Area Analysis
 *
 * Measures the character footprint of tracked UI library component props relative
 * to the total size of each codebase.  For every TSX/JSX file:
 *
 *   1. Count the total characters in the file.
 *   2. Find every tracked UI library component JSX opening tag.
 *   3. Measure the character length of the props portion of each tag
 *      (everything between the component name and the closing `>` / `/>`,
 *      excluding the angle brackets and component name themselves).
 *   4. Sum across all files per codebase.
 *
 * Output:
 *   - `reports/prop-surface/prop-surface-report.md`
 *   - `reports/prop-surface/prop-surface-report.csv`
 *   - `reports/prop-surface/prop-surface-report.json`
 *
 * Run directly:
 *   node scripts/prop-surface/analyze-prop-surface.js
 *
 * Or via npm:
 *   npm run analyze:prop-surface
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
 * @property {string} component  - Original tracked UI library component name.
 * @property {number} startIdx   - Character index where the props body starts (right after the component name).
 * @property {number} endIdx     - Character index of the closing `>` (exclusive).
 * @property {number} charCount  - Number of characters in the props body (endIdx - startIdx).
 */

/**
 * Find every tracked UI library component opening tag in a file and measure
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
 * @param {Object<string, string>}  importMap - local → original tracked UI library map.
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
 * @property {number}  trackedUIPropChars   - Characters occupied by tracked UI library props.
 * @property {number}  trackedUITagCount    - Number of tracked UI library opening tags found.
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
  const importMap = buildTrackedUIImportMap(content);
  const spans = measurePropSpans(content, importMap);

  let trackedUIPropChars = 0;
  /** @type {Object<string, number>} */
  const charsByComponent = {};

  for (const span of spans) {
    trackedUIPropChars += span.charCount;
    incr(charsByComponent, span.component, span.charCount);
  }

  return {
    totalChars,
    trackedUIPropChars,
    trackedUITagCount: spans.length,
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
 * @property {number} filesWithTrackedUI   - Files containing ≥ 1 tracked UI library tag.
 * @property {number} totalChars          - Characters across ALL files.
 * @property {number} uiFileChars         - Characters across UI-rendering files only.
 * @property {number} trackedUIPropChars   - Total tracked UI library prop characters.
 * @property {number} trackedUITagCount    - Total tracked UI library opening tags.
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
    filesWithTrackedUI: 0,
    totalChars: 0,
    uiFileChars: 0,
    trackedUIPropChars: 0,
    trackedUITagCount: 0,
    charsByComponent: {},
  };

  for (const result of fileResults) {
    agg.totalChars += result.totalChars;
    agg.trackedUIPropChars += result.trackedUIPropChars;
    agg.trackedUITagCount += result.trackedUITagCount;

    if (result.rendersUI) {
      agg.uiFileCount++;
      agg.uiFileChars += result.totalChars;
    }

    if (result.trackedUITagCount > 0) {
      agg.filesWithTrackedUI++;
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
 * Generate the markdown report.
 *
 * @param {Object<string, CodebaseMetrics | null>} results - Keyed by codebase name.
 * @returns {string}
 */
function generateTextReport(results) {
  const lines = [];

  lines.push(`# ${UI_LIBRARY_NAMES} Prop Surface Area Analysis`);
  lines.push("");
  lines.push(
    `Measures the character footprint of ${UI_LIBRARY_NAMES} component props/attributes`,
  );
  lines.push(
    "relative to files that render UI (contain JSX). Pure logic files",
  );
  lines.push("(hooks, types, utilities) are excluded from the denominator.");
  lines.push("");

  // ── Per-codebase sections ─────────────────────────────────────────────

  /** @type {CodebaseMetrics} */
  const grand = {
    fileCount: 0,
    uiFileCount: 0,
    filesWithTrackedUI: 0,
    totalChars: 0,
    uiFileChars: 0,
    trackedUIPropChars: 0,
    trackedUITagCount: 0,
    charsByComponent: {},
  };

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    grand.fileCount += data.fileCount;
    grand.uiFileCount += data.uiFileCount;
    grand.filesWithTrackedUI += data.filesWithTrackedUI;
    grand.totalChars += data.totalChars;
    grand.uiFileChars += data.uiFileChars;
    grand.trackedUIPropChars += data.trackedUIPropChars;
    grand.trackedUITagCount += data.trackedUITagCount;
    for (const [comp, chars] of Object.entries(data.charsByComponent)) {
      incr(grand.charsByComponent, comp, chars);
    }

    const p = pct(data.trackedUIPropChars, data.uiFileChars);

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
      `- **${UI_LIBRARY_NAMES} tags found:** ${data.trackedUITagCount.toLocaleString()}`,
    );
    lines.push(
      `- **Total chars (all files):** ${data.totalChars.toLocaleString()} (${formatSize(data.totalChars)})`,
    );
    lines.push(
      `- **UI file chars:** ${data.uiFileChars.toLocaleString()} (${formatSize(data.uiFileChars)})`,
    );
    lines.push(
      `- **${UI_LIBRARY_NAMES} prop chars:** ${data.trackedUIPropChars.toLocaleString()} (${formatSize(data.trackedUIPropChars)})`,
    );
    lines.push(`- **Prop surface area (UI):** ${p}%`);

    if (data.trackedUITagCount > 0) {
      const avgCharsPerTag = (
        data.trackedUIPropChars / data.trackedUITagCount
      ).toFixed(1);
      lines.push(`- **Avg prop chars per tag:** ${avgCharsPerTag}`);
    }
    lines.push("");

    // Top components by prop character usage
    const sorted = sortByCount(data.charsByComponent);
    if (sorted.length > 0) {
      lines.push("### Top 20 Components by Prop Character Usage");
      lines.push("");
      lines.push(
        "| Rank | Component | Prop Chars | % of Props | % of UI Code |",
      );
      lines.push("| ---: | --- | ---: | ---: | ---: |");

      for (let i = 0; i < Math.min(20, sorted.length); i++) {
        const [comp, chars] = sorted[i];
        lines.push(
          `| ${i + 1} | ${comp} | ${chars.toLocaleString()} | ${pct(chars, data.trackedUIPropChars)}% | ${pct(chars, data.uiFileChars)}% |`,
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
    `- **${UI_LIBRARY_NAMES} tags:** ${grand.trackedUITagCount.toLocaleString()}`,
  );
  lines.push(
    `- **Total chars (all files):** ${grand.totalChars.toLocaleString()} (${formatSize(grand.totalChars)})`,
  );
  lines.push(
    `- **UI file chars:** ${grand.uiFileChars.toLocaleString()} (${formatSize(grand.uiFileChars)})`,
  );
  lines.push(
    `- **${UI_LIBRARY_NAMES} prop chars:** ${grand.trackedUIPropChars.toLocaleString()} (${formatSize(grand.trackedUIPropChars)})`,
  );
  lines.push(
    `- **Prop surface area (UI):** ${pct(grand.trackedUIPropChars, grand.uiFileChars)}%`,
  );

  if (grand.trackedUITagCount > 0) {
    const avgGrand = (
      grand.trackedUIPropChars / grand.trackedUITagCount
    ).toFixed(1);
    lines.push(`- **Avg prop chars per tag:** ${avgGrand}`);
  }
  lines.push("");

  // Summary table
  lines.push("### Codebase Comparison (UI Files Only)");
  lines.push("");
  lines.push(
    "| Codebase | UI Files | UI Chars | Prop Chars | % Surface | Tags | Avg/Tag |",
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;
    const avg =
      data.trackedUITagCount > 0
        ? (data.trackedUIPropChars / data.trackedUITagCount).toFixed(1)
        : "0.0";
    lines.push(
      `| ${codebase} | ${data.uiFileCount.toLocaleString()} | ${data.uiFileChars.toLocaleString()} | ${data.trackedUIPropChars.toLocaleString()} | ${pct(data.trackedUIPropChars, data.uiFileChars)}% | ${data.trackedUITagCount.toLocaleString()} | ${avg} |`,
    );
  }

  const grandAvg =
    grand.trackedUITagCount > 0
      ? (grand.trackedUIPropChars / grand.trackedUITagCount).toFixed(1)
      : "0.0";

  lines.push(
    `| **TOTAL** | **${grand.uiFileCount.toLocaleString()}** | **${grand.uiFileChars.toLocaleString()}** | **${grand.trackedUIPropChars.toLocaleString()}** | **${pct(grand.trackedUIPropChars, grand.uiFileChars)}%** | **${grand.trackedUITagCount.toLocaleString()}** | **${grandAvg}** |`,
  );

  lines.push("");

  // Top components across all codebases
  const grandSorted = sortByCount(grand.charsByComponent);
  if (grandSorted.length > 0) {
    lines.push("### Top 20 Components by Prop Character Usage (All Codebases)");
    lines.push("");
    lines.push(
      "| Rank | Component | Prop Chars | % of All Props | % of UI Code |",
    );
    lines.push("| ---: | --- | ---: | ---: | ---: |");

    for (let i = 0; i < Math.min(20, grandSorted.length); i++) {
      const [comp, chars] = grandSorted[i];
      lines.push(
        `| ${i + 1} | ${comp} | ${chars.toLocaleString()} | ${pct(chars, grand.trackedUIPropChars)}% | ${pct(chars, grand.uiFileChars)}% |`,
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
    `Codebase,Total Files,UI Files,Files with ${UI_LIBRARY_NAMES},Total Characters,UI File Characters,${UI_LIBRARY_NAMES} Prop Characters,Prop Surface % (UI),${UI_LIBRARY_NAMES} Tags,Avg Chars per Tag`,
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
    grandPropChars += data.trackedUIPropChars;
    grandTags += data.trackedUITagCount;
    grandUIFiles += data.uiFileCount;

    const avg =
      data.trackedUITagCount > 0
        ? (data.trackedUIPropChars / data.trackedUITagCount).toFixed(1)
        : "0.0";

    rows.push(
      [
        codebase,
        data.fileCount,
        data.uiFileCount,
        data.filesWithTrackedUI,
        data.totalChars,
        data.uiFileChars,
        data.trackedUIPropChars,
        pct(data.trackedUIPropChars, data.uiFileChars) + "%",
        data.trackedUITagCount,
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
          pct(chars, data.trackedUIPropChars) + "%",
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
  let grandFilesWithTrackedUI = 0;
  /** @type {Object<string, number>} */
  const grandCharsByComponent = {};

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    grandTotalChars += data.totalChars;
    grandUIChars += data.uiFileChars;
    grandPropChars += data.trackedUIPropChars;
    grandTags += data.trackedUITagCount;
    grandFiles += data.fileCount;
    grandUIFiles += data.uiFileCount;
    grandFilesWithTrackedUI += data.filesWithTrackedUI;

    for (const [comp, chars] of Object.entries(data.charsByComponent)) {
      incr(grandCharsByComponent, comp, chars);
    }

    const sorted = sortByCount(data.charsByComponent);

    codebaseSummaries[codebase] = {
      fileCount: data.fileCount,
      uiFileCount: data.uiFileCount,
      filesWithTrackedUI: data.filesWithTrackedUI,
      totalCharacters: data.totalChars,
      uiFileCharacters: data.uiFileChars,
      trackedUIPropCharacters: data.trackedUIPropChars,
      propSurfacePercent: parseFloat(
        pct(data.trackedUIPropChars, data.uiFileChars),
      ),
      trackedUITagCount: data.trackedUITagCount,
      avgPropCharsPerTag:
        data.trackedUITagCount > 0
          ? parseFloat(
              (data.trackedUIPropChars / data.trackedUITagCount).toFixed(1),
            )
          : 0,
      topComponents: sorted.slice(0, 20).map(([comp, chars]) => ({
        component: comp,
        propChars: chars,
        percentOfProps: parseFloat(pct(chars, data.trackedUIPropChars)),
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
      filesWithTrackedUI: grandFilesWithTrackedUI,
      totalCharacters: grandTotalChars,
      uiFileCharacters: grandUIChars,
      trackedUIPropCharacters: grandPropChars,
      propSurfacePercent: parseFloat(pct(grandPropChars, grandUIChars)),
      trackedUITagCount: grandTags,
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

  const p = pct(agg.trackedUIPropChars, agg.uiFileChars);
  console.log(
    `   ${agg.uiFileCount} UI files (${formatSize(agg.uiFileChars)}), ${formatSize(agg.trackedUIPropChars)} ${UI_LIBRARY_NAMES} props (${p}%)`,
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
  console.log(`  ${UI_LIBRARY_NAMES.toUpperCase()} PROP SURFACE AREA ANALYSIS`);
  console.log("═".repeat(60));

  /** @type {Object<string, CodebaseMetrics | null>} */
  const results = {};

  for (const codebase of CODEBASES) {
    results[codebase] = await analyzeCodebase(codebase);
  }

  writeReports("prop-surface", "report", {
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
    grandProps += data.trackedUIPropChars;
    console.log(
      `  ${codebase.padEnd(12)}: ${formatSize(data.uiFileChars).padStart(10)} UI code, ${formatSize(data.trackedUIPropChars).padStart(10)} props → ${pct(data.trackedUIPropChars, data.uiFileChars)}%`,
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
  isTrackedUISource,
  buildTrackedUIImportMap,

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
