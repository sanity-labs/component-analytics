#!/usr/bin/env node
/* eslint-disable no-unused-vars */

/**
 * @module analyze-html-tags
 *
 * HTML Tag Usage Analysis for Multiple Codebases
 *
 * Scans TSX/JSX files across all codebases and counts raw HTML tag usage.
 * Produces per-codebase and aggregate reports showing which native HTML
 * elements are used most frequently, helping identify opportunities to
 * replace raw HTML with tracked UI library primitives.
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
const path = require("path");
const {
  codebaseExists,
  findFiles,
  readSafe,
  writeReports,
} = require("../lib/files");

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Compute the 1-based line number for a character offset in a string.
 *
 * @param {string} content - Full file content.
 * @param {number} offset  - Character index (0-based).
 * @returns {number} 1-based line number.
 */
function lineNumberAt(content, offset) {
  if (offset <= 0) return 1;
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

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

// ─── Instance-level extraction (with references) ──────────────────────────────

/**
 * @typedef {object} TagInstance
 * @property {string} tag        - The HTML/SVG tag name.
 * @property {number} line       - 1-based line number in the source file.
 * @property {string} sourceCode - The opening tag collapsed to a single line.
 */

/**
 * Extract every HTML/SVG tag instance with its position in the source.
 *
 * Unlike {@link extractHTMLTags} (which returns only counts), this
 * function returns an array of individual instances so that callers
 * can build per-tag reference lists with file + line information.
 *
 * Uses the same "full" regex as {@link matchFullTags} to capture the
 * complete opening tag (for the `sourceCode` snippet).
 *
 * @param {string} content - Raw file content.
 * @returns {TagInstance[]}
 */
function extractHTMLTagInstances(content) {
  // Run the regex against the original content (not cleaned) so that
  // character offsets are accurate for lineNumberAt.  The tag-matching
  // regex only captures `<lowercase…>` patterns which don't appear
  // inside string literals in real JSX/TSX files.
  const regex = /<([a-z][a-zA-Z0-9]*)\s*(?:[^>]*?)?\/?>/g;

  /** @type {TagInstance[]} */
  const instances = [];
  let m;
  while ((m = regex.exec(content)) !== null) {
    const tag = m[1];
    if (!KNOWN_TAGS.has(tag)) continue;

    instances.push({
      tag,
      line: lineNumberAt(content, m.index),
      sourceCode: m[0].replace(/\s+/g, " ").trim(),
    });
  }
  return instances;
}

// ─── Per-file analysis ────────────────────────────────────────────────────────

/**
 * @typedef {object} FileTagResult
 * @property {Object<string, number>} tags       - Tag → count.
 * @property {number}                 totalTags  - Sum of all counts.
 * @property {number}                 uniqueTags - Number of distinct tags.
 * @property {TagInstance[]}          instances  - Every tag instance with position.
 */

/**
 * Analyse one file's content and return structured tag usage data.
 *
 * @param {string} content - Raw file content.
 * @returns {FileTagResult}
 */
function analyzeContent(content) {
  const tags = extractHTMLTags(content);
  const instances = extractHTMLTagInstances(content);
  let totalTags = 0;
  for (const count of Object.values(tags)) {
    totalTags += count;
  }
  return {
    tags,
    totalTags,
    uniqueTags: Object.keys(tags).length,
    instances,
  };
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

/**
 * @typedef {object} TagReference
 * @property {string} file       - File path relative to the codebase root.
 * @property {number} line       - 1-based line number.
 * @property {string} codebase   - Which codebase the file belongs to.
 * @property {string} sourceCode - The opening tag collapsed to a single line.
 */

/**
 * @typedef {object} AggregatedTagResult
 * @property {Object<string, number>}          tags           - Tag → total count.
 * @property {Object<string, TagReference[]>}  references     - Tag → array of references.
 * @property {number}                          totalInstances - Grand total across all tags.
 * @property {number}                          uniqueTags     - Distinct tag count.
 * @property {number}                          fileCount      - Number of files analysed.
 * @property {number}                          filesWithHTML  - Files that contained ≥ 1 tag.
 */

/**
 * Aggregate results from multiple file analyses into a single summary.
 *
 * When `filePath` and `codebase` are provided, per-instance references
 * are collected for every tag.  When omitted (backward-compatible path),
 * the `references` map is still created but left empty.
 *
 * @param {FileTagResult[]} fileResults
 * @param {object}          [options]
 * @param {string[]}        [options.filePaths]  - Parallel array of relative file paths.
 * @param {string}          [options.codebase]   - Codebase name for references.
 * @returns {AggregatedTagResult}
 */
function aggregateResults(fileResults, options = {}) {
  const { filePaths, codebase } = options;

  /** @type {AggregatedTagResult} */
  const aggregated = {
    tags: {},
    references: {},
    totalInstances: 0,
    uniqueTags: 0,
    fileCount: fileResults.length,
    filesWithHTML: 0,
  };

  for (let i = 0; i < fileResults.length; i++) {
    const result = fileResults[i];
    if (result.totalTags > 0) {
      aggregated.filesWithHTML++;
    }
    for (const [tag, count] of Object.entries(result.tags)) {
      incr(aggregated.tags, tag, count);
      aggregated.totalInstances += count;
    }

    // Collect per-instance references when file paths are available
    if (filePaths && codebase && result.instances) {
      for (const inst of result.instances) {
        if (!aggregated.references[inst.tag]) {
          aggregated.references[inst.tag] = [];
        }
        aggregated.references[inst.tag].push({
          file: filePaths[i],
          line: inst.line,
          codebase,
          sourceCode: inst.sourceCode,
        });
      }
    }
  }

  aggregated.uniqueTags = Object.keys(aggregated.tags).length;
  return aggregated;
}

// ─── Report: Markdown ─────────────────────────────────────────────────────────

/**
 * Format a ranked table of tags for the markdown report.
 *
 * @param {Array<[string, number]>} sorted      - Sorted `[tag, count]` pairs.
 * @param {Object<string, string>}  categoryMap - Tag → category lookup.
 * @param {number}                  [limit=30]  - Maximum rows.
 * @returns {string[]} Lines to append to the report.
 */
function formatTagTable(sorted, categoryMap, limit = 30) {
  const lines = [];
  lines.push("| Rank | Tag | Instances | Category |");
  lines.push("| ---: | --- | ---: | --- |");

  const top = sorted.slice(0, limit);
  for (let i = 0; i < top.length; i++) {
    const [tag, count] = top[i];
    const category = getTagCategory(tag, categoryMap);
    lines.push(`| ${i + 1} | ${tag} | ${count} | ${category} |`);
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
  lines.push("#### Usage by Category");
  lines.push("");
  lines.push("| Category | Instances | % of Total |");
  lines.push("| --- | ---: | ---: |");
  for (const [cat, count] of sorted) {
    lines.push(`| ${cat} | ${count} | ${pct(count, total)}% |`);
  }
  return lines;
}

/**
 * Format the per-codebase section of the markdown report.
 *
 * @param {string}              codebase    - Codebase name.
 * @param {AggregatedTagResult} data        - Aggregated results.
 * @param {Object<string, string>} categoryMap
 * @returns {string[]} Lines.
 */
function formatCodebaseSection(codebase, data, categoryMap) {
  const lines = [];
  lines.push(`## ${codebase}`);
  lines.push("");
  lines.push(`- **Files analyzed:** ${data.fileCount}`);
  lines.push(`- **Files with HTML:** ${data.filesWithHTML}`);
  lines.push(`- **Unique tags:** ${data.uniqueTags}`);
  lines.push(`- **Total instances:** ${data.totalInstances}`);
  lines.push("");

  lines.push("### Top 30 Most Used HTML Tags");
  lines.push("");
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
  lines.push("## Aggregate — All Codebases Combined");
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

  lines.push(`- **Total files:** ${totalFiles}`);
  lines.push(`- **Files with HTML:** ${totalFilesWithHTML}`);
  lines.push(`- **Unique tags:** ${Object.keys(allTags).length}`);
  lines.push(`- **Total instances:** ${totalInstances}`);
  lines.push("");

  lines.push("### Top 30 Most Used HTML Tags (All Codebases)");
  lines.push("");
  lines.push(...formatTagTable(sortByCount(allTags), categoryMap));
  lines.push("");
  return lines;
}

/**
 * Generate the full markdown report.
 *
 * @param {Object<string, AggregatedTagResult | null>} results - Keyed by codebase name.
 * @returns {string}
 */
function generateMarkdown(results) {
  const categoryMap = buildTagCategoryMap();
  const lines = [];

  lines.push("# HTML Tag Usage Analysis");
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
    tags: Object.fromEntries(
      sorted.map(([tag, count]) => [
        tag,
        {
          count,
          category: getTagCategory(tag, categoryMap),
          references: (data.references && data.references[tag]) || [],
        },
      ]),
    ),
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

  const { codebasePath } = require("../lib/files");
  const basePath = codebasePath(codebase);

  const fileResults = [];
  const filePaths = [];
  for (const file of files) {
    const content = readSafe(file);
    if (content !== null) {
      fileResults.push(analyzeContent(content));
      filePaths.push(path.relative(basePath, file));
    }
  }

  const aggregated = aggregateResults(fileResults, { filePaths, codebase });
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

  writeReports("html-tags", "report", {
    markdown: generateMarkdown(results),
    csv: generateCSV(results),
    json: generateJSON(results),
  });

  console.log("\n✅ Markdown report saved");
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
  extractHTMLTagInstances,
  stripStringLiterals,
  matchFullTags,
  matchSimpleTags,

  // Utilities
  lineNumberAt,

  // Analysis
  analyzeContent,
  aggregateResults,

  // Category helpers
  buildTagCategoryMap,
  getTagCategory,

  // Report generation
  generateMarkdown,
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
