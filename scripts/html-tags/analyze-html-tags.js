#!/usr/bin/env node

/**
 * @module analyze-html-tags
 *
 * HTML Tag Usage Analysis for Multiple Codebases
 *
 * Scans TSX/JSX files across all codebases and counts raw HTML tag usage.
 * Produces per-codebase and aggregate reports showing which native HTML
 * elements are used most frequently, helping identify opportunities to
 * replace raw HTML with Sanity UI primitives.
 *
 * Run directly:
 *   node scripts/analyze-html-tags.js
 *
 * Or via npm:
 *   npm run analyze:html-tags
 */

const {
  CODEBASES,
  HTML_TAG_CATEGORIES,
  KNOWN_TAGS,
} = require("../lib/constants");
const {
  sortByCount,
  pct,
  incr,
  mergeCounters,
  compact,
} = require("../lib/utils");
const {
  codebaseExists,
  findFiles,
  readSafe,
  writeReports,
} = require("../lib/files");

// ─── Tag Category Lookup ──────────────────────────────────────────────────────

/**
 * Build a reverse lookup mapping each tag name to its category.
 *
 * Iterates every category in {@link HTML_TAG_CATEGORIES} and creates a
 * flat `{ tagName: categoryName }` map.  Tags that appear in the last
 * category encountered win if there are duplicates (shouldn't happen
 * with a well-maintained constant).
 *
 * @returns {Object<string, string>} Tag-name → category-name map.
 */
function buildTagCategoryMap() {
  /** @type {Object<string, string>} */
  const map = {};
  for (const [category, tags] of Object.entries(HTML_TAG_CATEGORIES)) {
    for (const tag of tags) {
      map[tag] = category;
    }
  }
  return map;
}

/**
 * Return the category for a single tag name.
 *
 * Falls back to `"other"` for tags that don't appear in the category
 * map (e.g. custom elements, TypeScript type keywords that leak through
 * the regex).
 *
 * @param {string} tag - Lowercase tag name.
 * @param {Object<string, string>} categoryMap - As returned by {@link buildTagCategoryMap}.
 * @returns {string} Category name.
 */
function getTagCategory(tag, categoryMap) {
  return categoryMap[tag] || "other";
}

// ─── Extraction ───────────────────────────────────────────────────────────────

/**
 * Strip string and template literals from source code so that tags
 * embedded inside them don't produce false positives.
 *
 * Replaces:
 *   - Template literals (`…`)  → empty template literals
 *   - Single-quoted strings    → empty single-quoted strings
 *   - Double-quoted strings    → empty double-quoted strings
 *
 * @param {string} content - Raw file content.
 * @returns {string} Content with literal bodies removed.
 */
function stripStringLiterals(content) {
  return content
    .replace(/`[^`]*`/gs, "``")
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""');
}

/**
 * Match opening HTML tags in JSX that start with a lowercase letter.
 *
 * Uses a **full** regex that requires the tag to close with `>` or `/>`:
 *
 *     <tagname …>   or   <tagname … />
 *
 * @param {string} cleaned - Content with string literals already stripped.
 * @returns {Object<string, number>} Tag → count map.
 */
function matchFullTags(cleaned) {
  /** @type {Object<string, number>} */
  const tags = {};
  const regex = /<([a-z][a-zA-Z0-9]*)\s*(?:[^>]*?)?\/?>/g;
  let m;
  while ((m = regex.exec(cleaned)) !== null) {
    incr(tags, m[1]);
  }
  return tags;
}

/**
 * Match opening HTML tags using a simpler pattern that catches tags
 * split across multiple lines (where the full regex may miss).
 *
 * Looks for `<tagname` followed immediately by whitespace, `/`, or `>`.
 *
 * @param {string} cleaned - Content with string literals already stripped.
 * @returns {Object<string, number>} Tag → count map.
 */
function matchSimpleTags(cleaned) {
  /** @type {Object<string, number>} */
  const tags = {};
  const regex = /<([a-z][a-zA-Z0-9]*)[\s/>]/g;
  let m;
  while ((m = regex.exec(cleaned)) !== null) {
    incr(tags, m[1]);
  }
  return tags;
}

/**
 * Extract HTML tag usages from JSX/TSX file content.
 *
 * Runs two regex passes (full and simple) against the content after
 * stripping string literals, then merges the results by taking the
 * higher count for each tag.  This maximises recall without
 * double-counting.
 *
 * PascalCase React components, JSX fragments, and closing tags are
 * all ignored by the regexes.
 *
 * @param {string} content - Raw file content.
 * @returns {Object<string, number>} Tag name → occurrence count.
 */
function extractHTMLTags(content) {
  const cleaned = stripStringLiterals(content);
  const full = matchFullTags(cleaned);
  const simple = matchSimpleTags(cleaned);

  // Merge: take the higher count for each tag.
  for (const [tag, count] of Object.entries(simple)) {
    if (!full[tag] || count > full[tag]) {
      full[tag] = count;
    }
  }

  // Filter to only known HTML/SVG tags — discard false positives like
  // TypeScript type keywords ("string", "boolean", "typeof") and
  // library-specific JSX elements ("motion").
  for (const tag of Object.keys(full)) {
    if (!KNOWN_TAGS.has(tag)) {
      delete full[tag];
    }
  }

  return full;
}

// ─── Per-file analysis ────────────────────────────────────────────────────────

/**
 * @typedef {object} FileTagResult
 * @property {Object<string, number>} tags       - Tag → count.
 * @property {number}                 totalTags  - Sum of all counts.
 * @property {number}                 uniqueTags - Number of distinct tags.
 */

/**
 * Analyse one file's content and return structured tag usage data.
 *
 * @param {string} content - Raw file content.
 * @returns {FileTagResult}
 */
function analyzeContent(content) {
  const tags = extractHTMLTags(content);
  let totalTags = 0;
  for (const count of Object.values(tags)) {
    totalTags += count;
  }
  return {
    tags,
    totalTags,
    uniqueTags: Object.keys(tags).length,
  };
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

/**
 * @typedef {object} AggregatedTagResult
 * @property {Object<string, number>} tags           - Tag → total count.
 * @property {number}                 totalInstances - Grand total across all tags.
 * @property {number}                 uniqueTags     - Distinct tag count.
 * @property {number}                 fileCount      - Number of files analysed.
 * @property {number}                 filesWithHTML  - Files that contained ≥ 1 tag.
 */

/**
 * Aggregate results from multiple file analyses into a single summary.
 *
 * @param {FileTagResult[]} fileResults
 * @returns {AggregatedTagResult}
 */
function aggregateResults(fileResults) {
  /** @type {AggregatedTagResult} */
  const aggregated = {
    tags: {},
    totalInstances: 0,
    uniqueTags: 0,
    fileCount: fileResults.length,
    filesWithHTML: 0,
  };

  for (const result of fileResults) {
    if (result.totalTags > 0) {
      aggregated.filesWithHTML++;
    }
    for (const [tag, count] of Object.entries(result.tags)) {
      incr(aggregated.tags, tag, count);
      aggregated.totalInstances += count;
    }
  }

  aggregated.uniqueTags = Object.keys(aggregated.tags).length;
  return aggregated;
}

// ─── Report: Text ─────────────────────────────────────────────────────────────

/**
 * Format a ranked table of tags for the text report.
 *
 * @param {Array<[string, number]>} sorted      - Sorted `[tag, count]` pairs.
 * @param {Object<string, string>}  categoryMap - Tag → category lookup.
 * @param {number}                  [limit=30]  - Maximum rows.
 * @returns {string[]} Lines to append to the report.
 */
function formatTagTable(sorted, categoryMap, limit = 30) {
  const lines = [];
  lines.push(
    "  " +
      "Rank".padEnd(6) +
      "Tag".padEnd(22) +
      "Instances".padStart(10) +
      "  " +
      "Category".padEnd(12),
  );
  lines.push("  " + "-".repeat(54));

  const top = sorted.slice(0, limit);
  for (let i = 0; i < top.length; i++) {
    const [tag, count] = top[i];
    const category = getTagCategory(tag, categoryMap);
    lines.push(
      "  " +
        String(i + 1).padEnd(6) +
        tag.padEnd(22) +
        String(count).padStart(10) +
        "  " +
        category.padEnd(12),
    );
  }
  return lines;
}

/**
 * Build a category-breakdown table for a single codebase.
 *
 * @param {Object<string, number>} tags       - Tag → count.
 * @param {number}                 total      - Total tag instances.
 * @param {Object<string, string>} categoryMap
 * @returns {string[]} Lines to append to the report.
 */
function formatCategoryBreakdown(tags, total, categoryMap) {
  /** @type {Object<string, number>} */
  const categoryTotals = {};
  for (const [tag, count] of Object.entries(tags)) {
    incr(categoryTotals, getTagCategory(tag, categoryMap), count);
  }
  const sorted = sortByCount(categoryTotals);

  const lines = [];
  lines.push("  USAGE BY CATEGORY");
  lines.push(
    "  " +
      "Category".padEnd(16) +
      "Instances".padStart(10) +
      "  " +
      "% of Total".padStart(10),
  );
  lines.push("  " + "-".repeat(40));
  for (const [cat, count] of sorted) {
    lines.push(
      "  " +
        cat.padEnd(16) +
        String(count).padStart(10) +
        "  " +
        (pct(count, total) + "%").padStart(10),
    );
  }
  return lines;
}

/**
 * Format the per-codebase section of the text report.
 *
 * @param {string}              codebase    - Codebase name.
 * @param {AggregatedTagResult} data        - Aggregated results.
 * @param {Object<string, string>} categoryMap
 * @returns {string[]} Lines.
 */
function formatCodebaseSection(codebase, data, categoryMap) {
  const lines = [];
  lines.push("─".repeat(80));
  lines.push(`  CODEBASE: ${codebase.toUpperCase()}`);
  lines.push("─".repeat(80));
  lines.push("");
  lines.push(`  Files analyzed:     ${data.fileCount}`);
  lines.push(`  Files with HTML:    ${data.filesWithHTML}`);
  lines.push(`  Unique tags:        ${data.uniqueTags}`);
  lines.push(`  Total instances:    ${data.totalInstances}`);
  lines.push("");

  lines.push("  TOP 30 MOST USED HTML TAGS");
  lines.push(...formatTagTable(sortByCount(data.tags), categoryMap));
  lines.push("");
  lines.push(
    ...formatCategoryBreakdown(data.tags, data.totalInstances, categoryMap),
  );
  lines.push("");
  return lines;
}

/**
 * Format the aggregate section that combines all codebases.
 *
 * @param {Object<string, AggregatedTagResult>} results - Non-null results only.
 * @param {Object<string, string>} categoryMap
 * @returns {string[]} Lines.
 */
function formatAggregateSection(results, categoryMap) {
  const lines = [];
  lines.push("═".repeat(80));
  lines.push("  AGGREGATE - ALL CODEBASES COMBINED");
  lines.push("═".repeat(80));
  lines.push("");

  /** @type {Object<string, number>} */
  const allTags = {};
  let totalInstances = 0;
  let totalFiles = 0;
  let totalFilesWithHTML = 0;

  for (const data of Object.values(results)) {
    totalFiles += data.fileCount;
    totalFilesWithHTML += data.filesWithHTML;
    mergeCounters(allTags, data.tags);
    totalInstances += data.totalInstances;
  }

  lines.push(`  Total files:        ${totalFiles}`);
  lines.push(`  Files with HTML:    ${totalFilesWithHTML}`);
  lines.push(`  Unique tags:        ${Object.keys(allTags).length}`);
  lines.push(`  Total instances:    ${totalInstances}`);
  lines.push("");

  lines.push("  TOP 30 MOST USED HTML TAGS (ALL CODEBASES)");
  lines.push(...formatTagTable(sortByCount(allTags), categoryMap));
  lines.push("");
  lines.push("═".repeat(80));
  lines.push("");
  return lines;
}

/**
 * Generate the full plain-text report.
 *
 * @param {Object<string, AggregatedTagResult | null>} results - Keyed by codebase name.
 * @returns {string}
 */
function generateTextReport(results) {
  const categoryMap = buildTagCategoryMap();
  const lines = [];

  lines.push("═".repeat(80));
  lines.push("  HTML TAG USAGE ANALYSIS - ALL CODEBASES");
  lines.push("═".repeat(80));
  lines.push("");

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;
    lines.push(...formatCodebaseSection(codebase, data, categoryMap));
  }

  lines.push(...formatAggregateSection(compact(results), categoryMap));
  return lines.join("\n");
}

// ─── Report: CSV ──────────────────────────────────────────────────────────────

/**
 * Collect every tag that appears in any codebase result.
 *
 * @param {Object<string, AggregatedTagResult>} results - Non-null only.
 * @returns {Set<string>}
 */
function collectAllTags(results) {
  const all = new Set();
  for (const data of Object.values(results)) {
    for (const tag of Object.keys(data.tags)) {
      all.add(tag);
    }
  }
  return all;
}

/**
 * Generate a CSV report with one row per tag and per-codebase columns.
 *
 * @param {Object<string, AggregatedTagResult | null>} results
 * @returns {string}
 */
function generateCSV(results) {
  const categoryMap = buildTagCategoryMap();
  const live = compact(results);
  const codebaseNames = Object.keys(live);
  const allTags = collectAllTags(live);

  const header = [
    "Tag",
    "Category",
    ...codebaseNames.map((c) => `${c} Count`),
    "Total",
  ].join(",");

  /** @type {Array<{ tag: string, category: string, counts: number[], total: number }>} */
  const rows = [];

  for (const tag of allTags) {
    let total = 0;
    const counts = codebaseNames.map((cb) => {
      const count = (live[cb] && live[cb].tags[tag]) || 0;
      total += count;
      return count;
    });
    rows.push({
      tag,
      category: getTagCategory(tag, categoryMap),
      counts,
      total,
    });
  }

  rows.sort((a, b) => b.total - a.total);

  const csvLines = [header];
  for (const row of rows) {
    csvLines.push(
      [
        `"${row.tag}"`,
        `"${row.category}"`,
        ...row.counts.map(String),
        String(row.total),
      ].join(","),
    );
  }

  return csvLines.join("\n") + "\n";
}

// ─── Report: JSON ─────────────────────────────────────────────────────────────

/**
 * Build the per-codebase summary object for the JSON report.
 *
 * @param {AggregatedTagResult}    data
 * @param {Object<string, string>} categoryMap
 * @returns {object}
 */
function buildCodebaseJsonSummary(data, categoryMap) {
  const sorted = sortByCount(data.tags);
  return {
    fileCount: data.fileCount,
    filesWithHTML: data.filesWithHTML,
    uniqueTags: data.uniqueTags,
    totalInstances: data.totalInstances,
    topTags: sorted.slice(0, 20).map(([tag, count]) => ({
      tag,
      count,
      category: getTagCategory(tag, categoryMap),
    })),
  };
}

/**
 * Generate a JSON summary string.
 *
 * @param {Object<string, AggregatedTagResult | null>} results
 * @returns {string} Pretty-printed JSON.
 */
function generateJSON(results) {
  const categoryMap = buildTagCategoryMap();
  const live = compact(results);

  /** @type {Object<string, number>} */
  const allTags = {};
  let grandTotalInstances = 0;
  let grandTotalFiles = 0;

  /** @type {Object<string, object>} */
  const codebaseSummaries = {};

  for (const [codebase, data] of Object.entries(live)) {
    grandTotalFiles += data.fileCount;
    codebaseSummaries[codebase] = buildCodebaseJsonSummary(data, categoryMap);

    mergeCounters(allTags, data.tags);
    grandTotalInstances += data.totalInstances;
  }

  const sortedAll = sortByCount(allTags);

  const summary = {
    generatedAt: new Date().toISOString(),
    codebases: codebaseSummaries,
    aggregate: {
      totalFiles: grandTotalFiles,
      uniqueTags: Object.keys(allTags).length,
      totalInstances: grandTotalInstances,
      topTags: sortedAll.slice(0, 30).map(([tag, count]) => ({
        tag,
        count,
        category: getTagCategory(tag, categoryMap),
      })),
    },
  };

  return JSON.stringify(summary, null, 2);
}

// ─── Codebase runner ──────────────────────────────────────────────────────────

/**
 * Analyse a single codebase for HTML tag usage.
 *
 * Returns `null` if the codebase directory doesn't exist on disk (the
 * caller is expected to skip it).
 *
 * @param {string} codebase - Directory name under `codebases/`.
 * @returns {Promise<AggregatedTagResult | null>}
 */
async function analyzeCodebase(codebase) {
  if (!codebaseExists(codebase)) {
    console.log(`⚠️  Skipping ${codebase}: path not found`);
    return null;
  }

  console.log(`\n📊 Analyzing HTML tags in ${codebase}...`);

  const files = await findFiles(codebase);
  console.log(`   Found ${files.length} component files`);

  const fileResults = [];
  for (const file of files) {
    const content = readSafe(file);
    if (content !== null) {
      fileResults.push(analyzeContent(content));
    }
  }

  const aggregated = aggregateResults(fileResults);
  console.log(
    `   ${aggregated.uniqueTags} unique tags, ${aggregated.totalInstances} total instances`,
  );

  return aggregated;
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

/**
 * Main entry point — analyses every codebase and writes reports.
 *
 * @returns {Promise<void>}
 */
async function main() {
  console.log("═".repeat(60));
  console.log("  HTML TAG USAGE ANALYSIS");
  console.log("═".repeat(60));

  /** @type {Object<string, AggregatedTagResult | null>} */
  const results = {};
  for (const codebase of CODEBASES) {
    results[codebase] = await analyzeCodebase(codebase);
  }

  writeReports("html-tags", "html-tags", {
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

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;
    const top3 = sortByCount(data.tags)
      .slice(0, 3)
      .map(([t, c]) => `${t}(${c})`)
      .join(", ");
    console.log(
      `  ${codebase.padEnd(10)}: ${String(data.totalInstances).padStart(6)} instances, ${String(data.uniqueTags).padStart(3)} unique tags  [${top3}]`,
    );
  }
  console.log("");
}

// ─── Module boundary ──────────────────────────────────────────────────────────

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  // Extraction
  extractHTMLTags,
  stripStringLiterals,
  matchFullTags,
  matchSimpleTags,

  // Analysis
  analyzeContent,
  aggregateResults,

  // Category helpers
  buildTagCategoryMap,
  getTagCategory,

  // Report generation
  generateTextReport,
  generateCSV,
  generateJSON,

  // Sub-formatters (exposed for testing)
  formatTagTable,
  formatCategoryBreakdown,
  formatCodebaseSection,
  formatAggregateSection,
  collectAllTags,
  buildCodebaseJsonSummary,

  // Re-export constant so tests can reference it from here
  HTML_TAG_CATEGORIES,

  // Re-export utility so existing tests that import sortTagsByCount still work
  sortTagsByCount: sortByCount,
};
