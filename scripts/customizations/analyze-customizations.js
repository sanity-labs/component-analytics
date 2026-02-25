#!/usr/bin/env node

/**
 * @module analyze-customizations
 *
 * UI Library Customization Analysis
 *
 * Scans TSX/JSX files across all codebases to measure how often tracked
 * UI library components receive inline `style` props or are wrapped with `styled()`.
 * Captures the actual inline style properties and the styled-components
 * template content for each occurrence.
 *
 * Run directly:
 *   node scripts/analyze-customizations.js
 *
 * Or via npm:
 *   npm run analyze:sanity-ui-customizations
 */

const {
  CODEBASES,
  TRACKED_COMPONENTS,
  UI_LIBRARY_NAMES,
} = require("../lib/constants");
const { sortByCount, incr, compact } = require("../lib/utils");
const {
  codebaseExists,
  findFiles,
  readSafe,
  writeReports,
} = require("../lib/files");

// ─── Shared regex fragment ────────────────────────────────────────────────────

/**
 * Build a regex alternation string from the tracked UI component list.
 *
 * The result is cached on first call because the component list never
 * changes at runtime.
 *
 * @returns {string} e.g. `"Box|Button|Card|…"`
 */
let _cachedPattern = null;
function componentPattern() {
  if (!_cachedPattern) {
    _cachedPattern = TRACKED_COMPONENTS.join("|");
  }
  return _cachedPattern;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACTION — inline style={}
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract `style={{ … }}` values from a JSX props string.
 *
 * Walks the string looking for the literal marker `style={`, then
 * counts brace depth to find the matching close.  This handles
 * nested expressions like `style={{ bg: isActive ? 'red' : 'blue' }}`.
 *
 * @param {string} propsStr - The props portion of a JSX opening tag.
 * @returns {string[]} Array of style-object content strings (without
 *   the outer `style={…}` wrapper).
 */
function extractStyleFromProps(propsStr) {
  const results = [];
  const marker = "style={";
  let searchStart = 0;

  while (true) {
    const idx = propsStr.indexOf(marker, searchStart);
    if (idx === -1) break;

    const contentStart = idx + marker.length;
    let depth = 1;
    let i = contentStart;

    while (i < propsStr.length && depth > 0) {
      if (propsStr[i] === "{") depth++;
      else if (propsStr[i] === "}") depth--;
      i++;
    }

    results.push(propsStr.slice(contentStart, i - 1));
    searchStart = i;
  }

  return results;
}

/**
 * Find the end position of a JSX opening tag, accounting for
 * embedded `{…}` expressions that may contain `>` characters.
 *
 * Scans forward from `startIdx` tracking brace depth; returns the
 * index of the first `>` encountered at depth 0, or `-1` if no
 * closing bracket is found before EOF.
 *
 * @param {string} content  - Full file content.
 * @param {number} startIdx - Position immediately after the tag name.
 * @returns {number} Index of the closing `>`, or `-1`.
 */
function findTagEnd(content, startIdx) {
  let depth = 0;
  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === "{") {
      depth++;
    } else if (content[i] === "}") {
      depth--;
    } else if (depth === 0 && content[i] === ">") {
      return i;
    }
  }
  return -1;
}

/**
 * Extract inline styles from multi-line JSX tags.
 *
 * Handles the common pattern where the `style` prop spans several
 * lines:
 *
 * ```jsx
 * <Card
 *   padding={2}
 *   style={{
 *     color: 'red',
 *     padding: '4px',
 *   }}
 * >
 * ```
 *
 * This is the **primary** extractor — it handles both single-line
 * and multi-line tags because it scans for the full tag boundary
 * using brace-depth tracking.
 *
 * @param {string} content - Full file content.
 * @returns {Array<{ component: string, styleContent: string, raw: string }>}
 */
function extractMultiLineInlineStyles(content) {
  const results = [];
  const openTagRegex = new RegExp(`<(${componentPattern()})\\b`, "g");
  let openMatch;

  while ((openMatch = openTagRegex.exec(content)) !== null) {
    const component = openMatch[1];
    const startIdx = openMatch.index + openMatch[0].length;
    const tagEnd = findTagEnd(content, startIdx);

    if (tagEnd === -1) continue;

    const tagContent = content.slice(startIdx, tagEnd);
    const styleResults = extractStyleFromProps(tagContent);

    for (const styleContent of styleResults) {
      results.push({
        component,
        styleContent: styleContent.trim(),
        raw: `<${component} style={${styleContent.trim()}}>`,
      });
    }
  }

  return results;
}

/**
 * Extract inline `style` props from tracked UI library components in JSX.
 *
 * Runs a fast single-line regex pass first, then a slower but more
 * robust multi-line pass.  Results are deduplicated by component +
 * style content so no occurrence is counted twice.
 *
 * @param {string} content - File content.
 * @returns {Array<{ component: string, styleContent: string, raw: string }>}
 */
function extractInlineStyles(content) {
  const results = [];

  // ── Fast single-line pass ────────────────────────────────────────────
  const tagRegex = new RegExp(
    `<(${componentPattern()})\\b([^>]*(?:\\{[^}]*\\}[^>]*)*)>|` +
      `<(${componentPattern()})\\b([^>]*(?:\\{[^}]*\\}[^>]*)*)\\/>`,
    "g",
  );

  let tagMatch;
  while ((tagMatch = tagRegex.exec(content)) !== null) {
    const component = tagMatch[1] || tagMatch[3];
    const propsStr = tagMatch[2] || tagMatch[4] || "";
    const styleMatches = extractStyleFromProps(propsStr);

    for (const styleContent of styleMatches) {
      results.push({
        component,
        styleContent: styleContent.trim(),
        raw: `<${component} style={${styleContent}}>`,
      });
    }
  }

  // ── Multi-line pass (deduplicates against the fast pass) ─────────────
  const multiLineResults = extractMultiLineInlineStyles(content);
  for (const result of multiLineResults) {
    const isDuplicate = results.some(
      (r) =>
        r.component === result.component &&
        r.styleContent === result.styleContent,
    );
    if (!isDuplicate) {
      results.push(result);
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACTION — styled()
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract the body of a parenthesised expression by counting depth.
 *
 * Starts scanning at `startIdx` (which should be the character
 * immediately after the opening `(`).  Returns the content between
 * the parens, exclusive.
 *
 * @param {string} content  - Full file content.
 * @param {number} startIdx - Position right after the opening `(`.
 * @returns {string} Content between the parens.
 */
function extractParenBody(content, startIdx) {
  let depth = 1;
  let i = startIdx;
  while (i < content.length && depth > 0) {
    if (content[i] === "(") depth++;
    else if (content[i] === ")") depth--;
    i++;
  }
  return content.slice(startIdx, i - 1).trim();
}

/**
 * Match `styled(Component)` usages that use **tagged template literals**.
 *
 * Handles:
 * - `styled(Card)\`…\``
 * - `styled(Card).attrs({…})\`…\``
 * - `styled(Card)<Props>\`…\``
 * - `export const Foo = styled(Card)\`…\``
 *
 * @param {string} content - File content.
 * @returns {Array<{ component: string, styledContent: string, variableName: string | null }>}
 */
function matchStyledTemplateLiterals(content) {
  const results = [];
  const regex = new RegExp(
    `(?:(?:export\\s+)?(?:const|let|var)\\s+(\\w+)\\s*=\\s*)?` +
      `styled\\((${componentPattern()})\\)` +
      `(?:<[^>]*>)?(?:\\.attrs\\([^)]*\\))?(?:<[^>]*>)?` +
      "`([^`]*)`",
    "g",
  );

  let match;
  while ((match = regex.exec(content)) !== null) {
    results.push({
      component: match[2],
      styledContent: match[3].trim(),
      variableName: match[1] || null,
    });
  }
  return results;
}

/**
 * Match `styled(Component)(…)` usages that use **function call syntax**.
 *
 * Handles:
 * - `styled(Card)(rootStyle)`
 * - `styled(Card)((props) => css\`…\`)`
 * - `export const Root = styled(Card)(…)`
 *
 * @param {string} content - File content.
 * @param {Array<{ component: string, variableName: string | null }>} existing
 *   Already-matched results to check for duplicates against.
 * @returns {Array<{ component: string, styledContent: string, variableName: string | null }>}
 */
function matchStyledFunctionCalls(content, existing) {
  const results = [];
  const regex = new RegExp(
    `(?:(?:export\\s+)?(?:const|let|var)\\s+(\\w+)\\s*=\\s*)?` +
      `styled\\((${componentPattern()})\\)` +
      `(?:<[^>]*>)?(?:\\.attrs\\([^)]*\\))?(?:<[^>]*>)?\\(`,
    "g",
  );

  let match;
  while ((match = regex.exec(content)) !== null) {
    const component = match[2];
    const variableName = match[1] || null;
    const callStart = match.index + match[0].length;
    const styledContent = extractParenBody(content, callStart);

    const isDuplicate = existing.some(
      (r) => r.component === component && r.variableName === variableName,
    );
    if (!isDuplicate) {
      results.push({ component, styledContent, variableName });
    }
  }
  return results;
}

/**
 * Extract all `styled()` usages that wrap tracked UI library components.
 *
 * Combines the template-literal and function-call patterns, deduplicating
 * so that a single `styled(Card)` call is never counted twice.
 *
 * @param {string} content - File content.
 * @returns {Array<{ component: string, styledContent: string, variableName: string | null }>}
 */
function extractStyledUsages(content) {
  const templateResults = matchStyledTemplateLiterals(content);
  const fnResults = matchStyledFunctionCalls(content, templateResults);
  return [...templateResults, ...fnResults];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROPERTY PARSING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse CSS property names from a JavaScript style-object string.
 *
 * Handles both camelCase identifiers and quoted keys:
 *
 * - `{ color: 'red', padding: 4 }` → `["color", "padding"]`
 * - `{ '--custom-prop': 'val' }`   → `["--custom-prop"]`
 *
 * @param {string} styleStr - The content inside `style={{ … }}`.
 * @returns {string[]} Array of property names.
 */
function parseStyleProperties(styleStr) {
  const properties = [];
  const propRegex =
    /(?:^|[{,;]\s*)([a-zA-Z_$][\w$]*)\s*:|(?:^|[{,;]\s*)['"]([^'"]+)['"]\s*:/g;
  let match;

  while ((match = propRegex.exec(styleStr)) !== null) {
    const prop = match[1] || match[2];
    if (prop) properties.push(prop);
  }
  return properties;
}

/**
 * Parse CSS property names from a styled-components template string.
 *
 * Matches standard CSS declarations (`property-name: value;`) while
 * filtering out single-character matches and leading-dash selectors.
 *
 * @param {string} templateStr - The CSS inside a tagged template literal.
 * @returns {string[]} Array of CSS property names.
 */
function parseStyledProperties(templateStr) {
  const properties = [];
  const propRegex = /(?:^|\n|;)\s*([a-z-]+)\s*:/gm;
  let match;

  while ((match = propRegex.exec(templateStr)) !== null) {
    const prop = match[1];
    if (prop && !prop.startsWith("-") && prop.length > 1) {
      properties.push(prop);
    }
  }
  return properties;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PER-FILE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} InlineStyleEntry
 * @property {string}   component    - Tracked UI library component name.
 * @property {string}   styleContent - Raw content of the style object.
 * @property {string}   raw          - Reconstructed JSX for reference.
 * @property {string[]} properties   - Parsed property names.
 */

/**
 * @typedef {object} StyledUsageEntry
 * @property {string}      component    - Tracked UI library component being wrapped.
 * @property {string}      styledContent - CSS / JS content inside styled().
 * @property {string|null} variableName - Variable the result is assigned to.
 * @property {string[]}    properties   - Parsed CSS property names.
 */

/**
 * @typedef {object} FileCustomizationResult
 * @property {InlineStyleEntry[]} inlineStyles  - All inline style occurrences.
 * @property {StyledUsageEntry[]} styledUsages  - All styled() occurrences.
 * @property {object}             summary       - Quick-access counts.
 * @property {number}             summary.inlineStyleCount
 * @property {number}             summary.styledCount
 * @property {number}             summary.totalCustomizations
 * @property {string[]}           summary.componentsWithInlineStyles
 * @property {string[]}           summary.componentsWithStyled
 */

/**
 * Analyse one file's content for tracked UI library customisations.
 *
 * Returns both the raw extraction results (with parsed properties
 * attached) and a quick summary object.
 *
 * @param {string} content - File content.
 * @returns {FileCustomizationResult}
 */
function analyzeContent(content) {
  const inlineStyles = extractInlineStyles(content).map((s) => ({
    ...s,
    properties: parseStyleProperties(s.styleContent),
  }));

  const styledUsages = extractStyledUsages(content).map((s) => ({
    ...s,
    properties: parseStyledProperties(s.styledContent),
  }));

  return {
    inlineStyles,
    styledUsages,
    summary: {
      inlineStyleCount: inlineStyles.length,
      styledCount: styledUsages.length,
      totalCustomizations: inlineStyles.length + styledUsages.length,
      componentsWithInlineStyles: [
        ...new Set(inlineStyles.map((s) => s.component)),
      ],
      componentsWithStyled: [...new Set(styledUsages.map((s) => s.component))],
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} ComponentPropertyBucket
 * @property {number}                 count      - Total occurrences.
 * @property {Object<string, number>} properties - Property → count.
 */

/**
 * @typedef {object} AggregatedCustomizationResult
 * @property {number} totalFiles
 * @property {number} filesWithCustomizations
 * @property {number} totalInlineStyles
 * @property {number} totalStyledUsages
 * @property {number} totalCustomizations
 * @property {Object<string, ComponentPropertyBucket>} inlineStylesByComponent
 * @property {Object<string, ComponentPropertyBucket>} styledByComponent
 * @property {Object<string, number>} inlineStyleProperties
 * @property {Object<string, number>} styledProperties
 * @property {InlineStyleEntry[]}     allInlineStyles
 * @property {StyledUsageEntry[]}     allStyledUsages
 */

/**
 * Increment the per-component property bucket for a single occurrence.
 *
 * Creates the component key if it doesn't exist yet, increments the
 * count, and merges the property list.
 *
 * @param {Object<string, ComponentPropertyBucket>} byComponent
 * @param {string}   comp       - Component name.
 * @param {string[]} properties - Property names from this occurrence.
 * @param {Object<string, number>} globalProps - Global property counter
 *   to update in parallel.
 */
function recordComponentProperties(byComponent, comp, properties, globalProps) {
  if (!byComponent[comp]) {
    byComponent[comp] = { count: 0, properties: {} };
  }
  byComponent[comp].count++;

  for (const prop of properties) {
    incr(byComponent[comp].properties, prop);
    incr(globalProps, prop);
  }
}

/**
 * Aggregate results from multiple file analyses into a single summary.
 *
 * @param {FileCustomizationResult[]} fileResults
 * @returns {AggregatedCustomizationResult}
 */
function aggregateResults(fileResults) {
  /** @type {AggregatedCustomizationResult} */
  const agg = {
    totalFiles: fileResults.length,
    filesWithCustomizations: 0,
    totalInlineStyles: 0,
    totalStyledUsages: 0,
    totalCustomizations: 0,
    inlineStylesByComponent: {},
    styledByComponent: {},
    inlineStyleProperties: {},
    styledProperties: {},
    allInlineStyles: [],
    allStyledUsages: [],
  };

  for (const result of fileResults) {
    if (result.summary.totalCustomizations > 0) {
      agg.filesWithCustomizations++;
    }

    agg.totalInlineStyles += result.summary.inlineStyleCount;
    agg.totalStyledUsages += result.summary.styledCount;
    agg.totalCustomizations += result.summary.totalCustomizations;

    for (const style of result.inlineStyles) {
      recordComponentProperties(
        agg.inlineStylesByComponent,
        style.component,
        style.properties,
        agg.inlineStyleProperties,
      );
      agg.allInlineStyles.push(style);
    }

    for (const styled of result.styledUsages) {
      recordComponentProperties(
        agg.styledByComponent,
        styled.component,
        styled.properties,
        agg.styledProperties,
      );
      agg.allStyledUsages.push(styled);
    }
  }

  return agg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT — Text
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract a flat `{ component: count }` object from a by-component
 * bucket map, suitable for sorting.
 *
 * @param {Object<string, ComponentPropertyBucket>} byComponent
 * @returns {Object<string, number>}
 */
function flattenComponentCounts(byComponent) {
  return Object.fromEntries(
    Object.entries(byComponent).map(([k, v]) => [k, v.count]),
  );
}

/**
 * Format a "by component" table for the markdown report.
 *
 * Each row shows the component name, count, and top 5 properties.
 *
 * @param {string} heading - Section heading.
 * @param {Object<string, ComponentPropertyBucket>} byComponent
 * @param {string} propColumnName - Column label for properties.
 * @returns {string[]} Lines.
 */
function formatComponentTable(heading, byComponent, propColumnName) {
  const sorted = sortByCount(flattenComponentCounts(byComponent));
  if (sorted.length === 0) return [];

  const lines = [];
  lines.push(`#### ${heading}`);
  lines.push("");
  lines.push(`| Component | Count | ${propColumnName} |`);
  lines.push(`| --- | ---: | --- |`);

  for (const [comp, count] of sorted) {
    const topProps = sortByCount(byComponent[comp].properties)
      .slice(0, 5)
      .map(([p, c]) => `${p}(${c})`)
      .join(", ");
    lines.push(`| ${comp} | ${count} | ${topProps} |`);
  }
  return lines;
}

/**
 * Format a "top properties" table for the markdown report.
 *
 * @param {string}                  heading - Section heading.
 * @param {Object<string, number>}  props   - Property → count.
 * @param {number}                  [limit=20]
 * @returns {string[]} Lines.
 */
function formatPropertyTable(heading, props, limit = 20) {
  const sorted = sortByCount(props).slice(0, limit);
  if (sorted.length === 0) return [];

  const lines = [];
  lines.push(`#### ${heading}`);
  lines.push("");
  lines.push("| Property | Count |");
  lines.push("| --- | ---: |");
  for (const [prop, count] of sorted) {
    lines.push(`| ${prop} | ${count} |`);
  }
  return lines;
}

/**
 * Format a single codebase section of the markdown report.
 *
 * @param {string}                        codebase
 * @param {AggregatedCustomizationResult} data
 * @returns {string[]} Lines.
 */
function formatCodebaseSection(codebase, data) {
  const lines = [];
  lines.push(`## ${codebase}`);
  lines.push("");
  lines.push(`- **Files analyzed:** ${data.totalFiles}`);
  lines.push(
    `- **Files with customizations:** ${data.filesWithCustomizations}`,
  );
  lines.push(`- **Total inline style=:** ${data.totalInlineStyles}`);
  lines.push(`- **Total styled() wraps:** ${data.totalStyledUsages}`);
  lines.push(`- **Total customizations:** ${data.totalCustomizations}`);
  lines.push("");

  lines.push(
    ...formatComponentTable(
      "Inline Styles by Component",
      data.inlineStylesByComponent,
      "Top Properties",
    ),
  );
  if (Object.keys(data.inlineStylesByComponent).length > 0) lines.push("");

  lines.push(
    ...formatComponentTable(
      "styled() Wraps by Component",
      data.styledByComponent,
      "Top CSS Properties",
    ),
  );
  if (Object.keys(data.styledByComponent).length > 0) lines.push("");

  lines.push(
    ...formatPropertyTable(
      "Top Inline Style Properties",
      data.inlineStyleProperties,
    ),
  );
  if (Object.keys(data.inlineStyleProperties).length > 0) lines.push("");

  lines.push(
    ...formatPropertyTable(
      "Top styled() CSS Properties",
      data.styledProperties,
    ),
  );
  if (Object.keys(data.styledProperties).length > 0) lines.push("");

  return lines;
}

/**
 * Format a simple ranked table (component + count, no properties).
 *
 * @param {string}                 heading
 * @param {Object<string, number>} counts
 * @returns {string[]} Lines.
 */
function formatSimpleComponentTable(heading, counts) {
  const sorted = sortByCount(counts);
  if (sorted.length === 0) return [];

  const lines = [];
  lines.push(`#### ${heading}`);
  lines.push("");
  lines.push("| Component | Count |");
  lines.push("| --- | ---: |");
  for (const [comp, count] of sorted) {
    lines.push(`| ${comp} | ${count} |`);
  }
  return lines;
}

/**
 * Format the aggregate section that combines all codebases.
 *
 * @param {Object<string, AggregatedCustomizationResult>} liveResults
 * @returns {string[]} Lines.
 */
function formatAggregateSection(liveResults) {
  const lines = [];
  lines.push("## Aggregate — All Codebases Combined");
  lines.push("");

  let grandInline = 0;
  let grandStyled = 0;
  /** @type {Object<string, number>} */
  const allInlineByComp = {};
  /** @type {Object<string, number>} */
  const allStyledByComp = {};

  for (const data of Object.values(liveResults)) {
    grandInline += data.totalInlineStyles;
    grandStyled += data.totalStyledUsages;

    for (const [comp, info] of Object.entries(data.inlineStylesByComponent)) {
      incr(allInlineByComp, comp, info.count);
    }
    for (const [comp, info] of Object.entries(data.styledByComponent)) {
      incr(allStyledByComp, comp, info.count);
    }
  }

  lines.push(`- **Total inline style=:** ${grandInline}`);
  lines.push(`- **Total styled() wraps:** ${grandStyled}`);
  lines.push(`- **Grand total:** ${grandInline + grandStyled}`);
  lines.push("");

  lines.push(
    ...formatSimpleComponentTable(
      "Inline Styles by Component (All Codebases)",
      allInlineByComp,
    ),
  );
  if (Object.keys(allInlineByComp).length > 0) lines.push("");

  lines.push(
    ...formatSimpleComponentTable(
      "styled() Wraps by Component (All Codebases)",
      allStyledByComp,
    ),
  );
  if (Object.keys(allStyledByComp).length > 0) lines.push("");

  return lines;
}

/**
 * Generate the full markdown report.
 *
 * @param {Object<string, AggregatedCustomizationResult | null>} results
 * @returns {string}
 */
function generateTextReport(results) {
  const lines = [];
  lines.push(
    `# ${UI_LIBRARY_NAMES} Customization Analysis — Inline Styles & styled()`,
  );
  lines.push("");

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;
    lines.push(...formatCodebaseSection(codebase, data));
  }

  lines.push(...formatAggregateSection(compact(results)));
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT — CSV
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Collect every component name that appears in any codebase result
 * (in either inline or styled buckets).
 *
 * @param {Object<string, AggregatedCustomizationResult>} liveResults
 * @returns {string[]} Sorted component names.
 */
function collectAllComponents(liveResults) {
  const all = new Set();
  for (const data of Object.values(liveResults)) {
    for (const comp of Object.keys(data.inlineStylesByComponent)) {
      all.add(comp);
    }
    for (const comp of Object.keys(data.styledByComponent)) {
      all.add(comp);
    }
  }
  return [...all].sort();
}

/**
 * Build a single CSV data row for one component + type combination.
 *
 * @param {string}   comp
 * @param {string}   type          - `"inline style"` or `"styled()"`.
 * @param {string[]} codebaseNames
 * @param {Object<string, AggregatedCustomizationResult>} liveResults
 * @param {(data: AggregatedCustomizationResult, comp: string) => ComponentPropertyBucket | undefined} getBucket
 * @returns {{ csvLine: string, total: number } | null} `null` if total is 0.
 */
function buildCsvRow(comp, type, codebaseNames, liveResults, getBucket) {
  let total = 0;
  const counts = codebaseNames.map((cb) => {
    const bucket = getBucket(liveResults[cb], comp);
    const count = bucket ? bucket.count : 0;
    total += count;
    return count;
  });

  if (total === 0) return null;

  // Gather top properties across codebases
  /** @type {Object<string, number>} */
  const propTotals = {};
  for (const cb of codebaseNames) {
    const bucket = getBucket(liveResults[cb], comp);
    if (bucket) {
      for (const [prop, count] of Object.entries(bucket.properties)) {
        incr(propTotals, prop, count);
      }
    }
  }
  const topProps = sortByCount(propTotals)
    .slice(0, 5)
    .map(([p]) => p)
    .join("; ");

  const csvLine = [
    `"${comp}"`,
    `"${type}"`,
    ...counts.map(String),
    String(total),
    `"${topProps}"`,
  ].join(",");

  return { csvLine, total };
}

/**
 * Generate a CSV report.
 *
 * Produces one row per component + type (`inline style` / `styled()`)
 * combination, with per-codebase columns and a total.
 *
 * @param {Object<string, AggregatedCustomizationResult | null>} results
 * @returns {string}
 */
function generateCSV(results) {
  const live = compact(results);
  const codebaseNames = Object.keys(live);
  const allComponents = collectAllComponents(live);

  const header = [
    "Component",
    "Type",
    ...codebaseNames.map((c) => `${c} Count`),
    "Total",
    "Top Properties",
  ].join(",");

  /** @type {Array<{ csvLine: string, total: number }>} */
  const rows = [];

  for (const comp of allComponents) {
    const inlineRow = buildCsvRow(
      comp,
      "inline style",
      codebaseNames,
      live,
      (data, c) => data && data.inlineStylesByComponent[c],
    );
    if (inlineRow) rows.push(inlineRow);

    const styledRow = buildCsvRow(
      comp,
      "styled()",
      codebaseNames,
      live,
      (data, c) => data && data.styledByComponent[c],
    );
    if (styledRow) rows.push(styledRow);
  }

  // Sort by total descending
  rows.sort((a, b) => b.total - a.total);

  return [header, ...rows.map((r) => r.csvLine)].join("\n") + "\n";
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT — JSON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the per-codebase summary object for the JSON report.
 *
 * @param {AggregatedCustomizationResult} data
 * @returns {object}
 */
function buildCodebaseJsonSummary(data) {
  return {
    totalFiles: data.totalFiles,
    filesWithCustomizations: data.filesWithCustomizations,
    inlineStyleCount: data.totalInlineStyles,
    styledCount: data.totalStyledUsages,
    totalCustomizations: data.totalCustomizations,
    inlineStylesByComponent: Object.fromEntries(
      sortByCount(flattenComponentCounts(data.inlineStylesByComponent)),
    ),
    styledByComponent: Object.fromEntries(
      sortByCount(flattenComponentCounts(data.styledByComponent)),
    ),
    topInlineProperties: sortByCount(data.inlineStyleProperties)
      .slice(0, 20)
      .map(([prop, count]) => ({ property: prop, count })),
    topStyledProperties: sortByCount(data.styledProperties)
      .slice(0, 20)
      .map(([prop, count]) => ({ property: prop, count })),
  };
}

/**
 * Generate a JSON summary string.
 *
 * @param {Object<string, AggregatedCustomizationResult | null>} results
 * @returns {string} Pretty-printed JSON.
 */
function generateJSON(results) {
  const live = compact(results);
  /** @type {Object<string, object>} */
  const codebaseSummaries = {};

  for (const [codebase, data] of Object.entries(live)) {
    codebaseSummaries[codebase] = buildCodebaseJsonSummary(data);
  }

  return JSON.stringify(
    { generatedAt: new Date().toISOString(), codebases: codebaseSummaries },
    null,
    2,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CODEBASE RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyse a single codebase for tracked UI library customisations.
 *
 * Returns `null` if the codebase directory doesn't exist.
 *
 * @param {string} codebase - Directory name under `codebases/`.
 * @returns {Promise<AggregatedCustomizationResult | null>}
 */
async function analyzeCodebase(codebase) {
  if (!codebaseExists(codebase)) {
    console.log(`⚠️  Skipping ${codebase}: path not found`);
    return null;
  }

  console.log(
    `\n📊 Analyzing ${UI_LIBRARY_NAMES} customizations in ${codebase}...`,
  );

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
    `   ${aggregated.totalInlineStyles} inline styles, ${aggregated.totalStyledUsages} styled() usages`,
  );
  return aggregated;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main entry point — analyses every codebase and writes reports.
 *
 * @returns {Promise<void>}
 */
async function main() {
  console.log("═".repeat(60));
  console.log(`  ${UI_LIBRARY_NAMES.toUpperCase()} CUSTOMIZATION ANALYSIS`);
  console.log("═".repeat(60));

  /** @type {Object<string, AggregatedCustomizationResult | null>} */
  const results = {};
  for (const codebase of CODEBASES) {
    results[codebase] = await analyzeCodebase(codebase);
  }

  writeReports("customizations", "report", {
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
    console.log(
      `  ${codebase.padEnd(10)}: ${String(data.totalInlineStyles).padStart(4)} inline styles, ${String(data.totalStyledUsages).padStart(4)} styled(), ${String(data.totalCustomizations).padStart(4)} total`,
    );
  }
  console.log("");
}

// ─── Module boundary ──────────────────────────────────────────────────────────

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  // Inline-style extraction
  extractInlineStyles,
  extractStyleFromProps,
  extractMultiLineInlineStyles,
  findTagEnd,

  // styled() extraction
  extractStyledUsages,
  matchStyledTemplateLiterals,
  matchStyledFunctionCalls,
  extractParenBody,

  // Property parsing
  parseStyleProperties,
  parseStyledProperties,

  // Analysis & aggregation
  analyzeContent,
  aggregateResults,
  recordComponentProperties,
  flattenComponentCounts,

  // Report generation
  generateTextReport,
  generateCSV,
  generateJSON,

  // Sub-formatters (exposed for testing)
  formatComponentTable,
  formatPropertyTable,
  formatCodebaseSection,
  formatSimpleComponentTable,
  formatAggregateSection,
  collectAllComponents,
  buildCsvRow,
  buildCodebaseJsonSummary,

  // Re-export so existing tests that import sortByCount/TRACKED_COMPONENTS
  // from this module continue to work.
  sortByCount,
  TRACKED_COMPONENTS,
};
