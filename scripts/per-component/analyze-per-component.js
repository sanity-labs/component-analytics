#!/usr/bin/env node

/**
 * @module per-component/analyze-per-component
 *
 * Per-Component tracked UI library Analysis
 *
 * Generates an individual report for every tracked UI library component found
 * across all codebases.  Each report includes:
 *
 *   1. **Total imports** — how many files import the component
 *   2. **Total JSX instances** — how many `<Component>` tags appear
 *   3. **Prop usage** — which props are used and how often
 *   4. **Prop value usage** — for each prop, which values are passed
 *   5. **References** — file path and line number for every instance
 *
 * Reports are written to `reports/per-component/` as:
 *   - One JSON file per component  (`Button.json`, `Card.json`, …)
 *   - A summary CSV of all components
 *   - A summary JSON of all components
 *
 * Run directly:
 *   node scripts/per-component/analyze-per-component.js
 *
 * Or via npm:
 *   npm run analyze:per-component
 */

const fs = require("fs");
const path = require("path");

const {
  CODEBASES,
  TRACKED_COMPONENTS,
  UI_LIBRARY_NAMES,
  isTrackedUISource,
} = require("../lib/constants");
const {
  detectPropDefault,
  KNOWN_DEFAULT_VALUES,
  KNOWN_AS_DEFAULTS,
} = require("./detect-prop-defaults");
const { sortByCount, incr, pct } = require("../lib/utils");
const {
  codebaseExists,
  findFiles,
  readSafe,
  ensureDir,
  reportDir,
} = require("../lib/files");

// ═══════════════════════════════════════════════════════════════════════════════
// LINE NUMBER UTILITY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute the 1-based line number for a character offset in a string.
 *
 * Counts the number of newline characters before `offset` and adds 1.
 * Returns `1` if `offset` is 0 or negative.
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

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACTION — imports
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract all ES import statements from file content.
 *
 * Returns the raw named-imports string, default import name, and
 * source path for each statement.
 *
 * @param {string} content - File content.
 * @returns {Array<{ namedImports: string | null, defaultImport: string | null, source: string }>}
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
 * Parse named imports into an array of `{ original, local }` pairs.
 *
 * Handles `as` aliasing:
 *   - `Button`           → `{ original: "Button", local: "Button" }`
 *   - `Button as Btn`    → `{ original: "Button", local: "Btn" }`
 *
 * Only PascalCase names are returned.
 *
 * @param {string} namedImportsStr - The string inside `{ }`.
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
 * Build a map of `{ localName → originalName }` for every tracked UI library
 * component imported in a file.
 *
 * @param {string} content - File content.
 * @returns {Object<string, string>} local JSX name → original tracked UI library export name.
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
// EXTRACTION — JSX props
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find the end of a JSX opening tag, respecting nested `{…}` expressions.
 *
 * Returns the index of the closing `>` or `/>`, or `-1`.
 *
 * @param {string} content  - File content.
 * @param {number} startIdx - Position right after the tag name.
 * @returns {number}
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
 * Parse props from a JSX opening-tag body string.
 *
 * Returns an array of `{ name, value }` objects where `value` is:
 *   - The string literal for `prop="value"` / `prop='value'`
 *   - The expression string for `prop={expr}`
 *   - `true` for boolean shorthand props (`disabled`, `border`)
 *
 * Spread attributes (`{...props}`) are skipped.
 *
 * @param {string} tagBody - Everything between `<Component` and `>` / `/>`.
 * @returns {Array<{ name: string, value: string }>}
 */
function parseProps(tagBody) {
  const props = [];
  let i = 0;
  const len = tagBody.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(tagBody[i])) i++;
    if (i >= len) break;

    // Skip self-closing slash at end
    if (tagBody[i] === "/") break;

    // Skip spread: {...expr}
    if (tagBody[i] === "{") {
      let depth = 1;
      i++;
      while (i < len && depth > 0) {
        if (tagBody[i] === "{") depth++;
        else if (tagBody[i] === "}") depth--;
        i++;
      }
      continue;
    }

    // Read prop name (must start with a letter or _ or $)
    if (!/[a-zA-Z_$]/.test(tagBody[i])) {
      i++;
      continue;
    }

    let nameStart = i;
    while (i < len && /[a-zA-Z0-9_$-]/.test(tagBody[i])) i++;
    const propName = tagBody.slice(nameStart, i);

    // Skip whitespace before potential =
    while (i < len && /\s/.test(tagBody[i])) i++;

    if (i >= len || tagBody[i] !== "=") {
      // Boolean shorthand prop: <Card border>
      props.push({ name: propName, value: "true" });
      continue;
    }

    // Skip the '='
    i++;
    // Skip whitespace after =
    while (i < len && /\s/.test(tagBody[i])) i++;

    if (i >= len) {
      props.push({ name: propName, value: "true" });
      break;
    }

    let value;

    if (tagBody[i] === '"') {
      // Double-quoted string: prop="value"
      // Wrap in single quotes so classifyValue knows this was a literal.
      i++; // skip opening "
      let valStart = i;
      while (i < len && tagBody[i] !== '"') i++;
      value = "'" + tagBody.slice(valStart, i) + "'";
      i++; // skip closing "
    } else if (tagBody[i] === "'") {
      // Single-quoted string: prop='value'
      // Keep the quotes so classifyValue knows this was a literal.
      i++;
      let valStart = i;
      while (i < len && tagBody[i] !== "'") i++;
      value = "'" + tagBody.slice(valStart, i) + "'";
      i++;
    } else if (tagBody[i] === "{") {
      // Expression: prop={expr}
      i++; // skip {
      let depth = 1;
      let valStart = i;
      while (i < len && depth > 0) {
        if (tagBody[i] === "{") depth++;
        else if (tagBody[i] === "}") depth--;
        if (depth > 0) i++;
      }
      value = tagBody.slice(valStart, i).trim();
      i++; // skip closing }
    } else {
      // Bare value (shouldn't happen in valid JSX, but be safe)
      let valStart = i;
      while (i < len && !/[\s/>]/.test(tagBody[i])) i++;
      value = tagBody.slice(valStart, i);
    }

    props.push({ name: propName, value });
  }

  return props;
}

/**
 * Classify a prop value into a human-readable category.
 *
 * @param {string} raw - The raw value string.
 * @returns {string} One of: the literal value for simple cases,
 *   or a descriptive label like `<variable>`, `<function>`, `<expression>`.
 */
function classifyValue(raw) {
  if (raw === "true" || raw === "false") return raw;

  // Numeric literal
  if (/^-?\d+(\.\d+)?$/.test(raw)) return raw;

  // String (already unwrapped by the parser for quoted values, but
  // expression values may contain quotes)
  if (/^['"](.*)['"]$/.test(raw)) return raw.slice(1, -1);

  // Array literal: [1, 2, 3]
  if (/^\[.*\]$/.test(raw)) return "<array>";

  // Object literal: { key: value }
  if (/^\{.*\}$/.test(raw)) return "<object>";

  // Arrow function or function reference
  if (/=>/.test(raw) || /^function\b/.test(raw)) return "<function>";
  if (/^handle[A-Z]/.test(raw) || /^on[A-Z]/.test(raw)) return "<handler>";

  // Ternary
  if (/\?/.test(raw) && /:/.test(raw)) return "<ternary>";

  // Template literal
  if (/^`/.test(raw)) return "<template>";

  // Simple identifier (variable reference)
  if (/^[a-zA-Z_$][a-zA-Z0-9_$.]*$/.test(raw)) return `<variable:${raw}>`;

  return "<expression>";
}

/**
 * Normalize a classified value for aggregation.
 *
 * Keeps literal strings, numbers, and booleans as-is.  Collapses
 * dynamic values into their category label so the report isn't
 * overwhelmed by thousands of unique expressions.
 *
 * @param {string} classified - Output of {@link classifyValue}.
 * @returns {string}
 */
function normalizeValue(classified) {
  // Keep literal values
  if (classified === "true" || classified === "false") return classified;
  if (/^-?\d+(\.\d+)?$/.test(classified)) return classified;

  // Keep short string literals (common enum values like "ghost", "primary")
  if (!classified.startsWith("<") && classified.length <= 30) {
    return `"${classified}"`;
  }

  // Collapse dynamic categories
  if (classified.startsWith("<variable:")) return "<variable>";
  return classified;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PER-FILE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} ComponentInstance
 * @property {string}                     component - Original tracked UI library name.
 * @property {Array<{ name: string, value: string }>} props - Parsed props.
 * @property {number}                     line      - 1-based line number in the source file.
 */

/**
 * @typedef {object} FileResult
 * @property {Object<string, string>}  importMap  - local → original for tracked UI library imports.
 * @property {ComponentInstance[]}      instances  - Every tracked UI library JSX instance.
 */

/**
 * Analyse one file and return every tracked UI library component instance with
 * its parsed props and source line number.
 *
 * @param {string} content - File content.
 * @returns {FileResult}
 */
function analyzeFileContent(content) {
  const importMap = buildTrackedUIImportMap(content);
  const localNames = Object.keys(importMap);

  if (localNames.length === 0) {
    return { importMap, instances: [] };
  }

  /** @type {ComponentInstance[]} */
  const instances = [];

  // Build a regex that matches `<LocalName` for any imported tracked UI library component
  const pattern = localNames.map(escapeRegex).join("|");
  const tagRegex = new RegExp(`<(${pattern})\\b`, "g");

  let openMatch;
  while ((openMatch = tagRegex.exec(content)) !== null) {
    const localName = openMatch[1];
    const original = importMap[localName];
    const bodyStart = openMatch.index + openMatch[0].length;
    const tagEnd = findTagEnd(content, bodyStart);

    if (tagEnd === -1) continue;

    const tagBody = content.slice(bodyStart, tagEnd);
    const props = parseProps(tagBody);

    const line = lineNumberAt(content, openMatch.index);
    instances.push({ component: original, props, line });
  }

  return { importMap, instances };
}

/**
 * Escape special regex characters in a string.
 *
 * @param {string} s
 * @returns {string}
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} PropValueBucket
 * @property {Object<string, number>} values         - normalized value → count.
 * @property {number}                 totalUsages     - total times this prop was used.
 * @property {number}                 defaultUsages   - times the prop was set to its known default value.
 * @property {string|null}            defaultValue    - the known default value (null if unknown).
 */

/**
 * @typedef {object} InstanceReference
 * @property {string} file     - File path relative to the codebase root.
 * @property {number} line     - 1-based line number.
 * @property {string} codebase - Which codebase the file belongs to.
 */

/**
 * @typedef {object} ComponentReport
 * @property {string}                          component       - tracked UI library export name.
 * @property {number}                          totalImports    - Files that import this component.
 * @property {number}                          totalInstances  - JSX `<Component>` occurrences.
 * @property {Object<string, PropValueBucket>} props           - Per-prop breakdown.
 * @property {Object<string, number>}          codebaseImports - Imports per codebase.
 * @property {Object<string, number>}          codebaseInstances - Instances per codebase.
 * @property {InstanceReference[]}             references      - File + line for every instance.
 * @property {number}                          totalDefaultUsages - Total times any prop was set to its default.
 */

/**
 * Create an empty report skeleton for a component.
 *
 * @param {string} component - tracked UI library export name.
 * @returns {ComponentReport}
 */
function createEmptyReport(component) {
  return {
    component,
    totalImports: 0,
    totalInstances: 0,
    props: {},
    codebaseImports: {},
    codebaseInstances: {},
    references: [],
    totalDefaultUsages: 0,
  };
}

/**
 * Record a single prop occurrence into a component report.
 *
 * Records a prop usage.  Default-value detection is NOT done here —
 * it happens in a separate pass after all files have been aggregated,
 * via {@link applyAutoDetectedDefaults}.
 *
 * @param {ComponentReport} report
 * @param {string}          propName
 * @param {string}          rawValue
 */
function recordProp(report, propName, rawValue) {
  if (!report.props[propName]) {
    report.props[propName] = {
      values: {},
      totalUsages: 0,
      defaultUsages: 0,
      defaultValue: null,
    };
  }
  report.props[propName].totalUsages++;

  const classified = classifyValue(rawValue);
  const normalized = normalizeValue(classified);
  incr(report.props[propName].values, normalized);
}

/**
 * Run automatic default-value detection across every prop in every
 * component report, then count how many times each detected default
 * was explicitly set.
 *
 * This is called once after ALL files have been processed, so the
 * detection heuristics have complete usage data to work with.
 *
 * @param {Object<string, ComponentReport>} reports - Keyed by component name.
 */
function applyAutoDetectedDefaults(reports) {
  for (const [component, report] of Object.entries(reports)) {
    for (const [propName, bucket] of Object.entries(report.props)) {
      // Skip event handlers, keys, refs, data-/aria- attributes
      if (
        propName.startsWith("on") &&
        propName.length > 2 &&
        /[A-Z]/.test(propName[2])
      )
        continue;
      if (propName === "key" || propName === "ref" || propName === "children")
        continue;
      if (propName.startsWith("data-") || propName.startsWith("aria-"))
        continue;

      const detected = detectPropDefault(
        component,
        propName,
        bucket,
        report.totalInstances,
      );

      if (
        detected &&
        (detected.confidence === "high" || detected.confidence === "medium")
      ) {
        bucket.defaultValue = detected.value;
        bucket.defaultUsages = detected.count;
        report.totalDefaultUsages += detected.count;
      }
    }
  }
}

/**
 * Merge one file's results into the global per-component reports.
 *
 * @param {Object<string, ComponentReport>} reports    - Keyed by component name.
 * @param {FileResult}                      fileResult
 * @param {string}                          codebase
 * @param {string}                          [filePath] - Path relative to codebase root (for references).
 */
function mergeFileResult(reports, fileResult, codebase, filePath) {
  // Track imports: each original component imported in this file = +1 import
  const importedOriginals = new Set(Object.values(fileResult.importMap));
  for (const original of importedOriginals) {
    if (!reports[original]) {
      reports[original] = createEmptyReport(original);
    }
    reports[original].totalImports++;
    incr(reports[original].codebaseImports, codebase);
  }

  // Track instances and props
  for (const instance of fileResult.instances) {
    const report = reports[instance.component];
    if (!report) continue; // shouldn't happen, but guard

    report.totalInstances++;
    incr(report.codebaseInstances, codebase);

    if (filePath) {
      report.references.push({
        file: filePath,
        line: instance.line,
        codebase,
      });
    }

    for (const prop of instance.props) {
      recordProp(report, prop.name, prop.value);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT GENERATION — per-component JSON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a JSON object for a single component report.
 *
 * Props are sorted by usage count descending.  Within each prop, values
 * are also sorted by count descending.
 *
 * @param {ComponentReport} report
 * @returns {object} - Plain object ready for JSON.stringify.
 */
function buildComponentJson(report) {
  const propEntries = sortByCount(
    Object.fromEntries(
      Object.entries(report.props).map(([k, v]) => [k, v.totalUsages]),
    ),
  );

  const propsDetail = {};
  for (const [propName] of propEntries) {
    const bucket = report.props[propName];
    const detail = {
      totalUsages: bucket.totalUsages,
      values: Object.fromEntries(sortByCount(bucket.values)),
    };
    if (bucket.defaultValue !== null) {
      detail.defaultValue = bucket.defaultValue;
      detail.defaultUsages = bucket.defaultUsages;
    }
    propsDetail[propName] = detail;
  }

  return {
    component: report.component,
    totalImports: report.totalImports,
    totalInstances: report.totalInstances,
    codebaseImports: report.codebaseImports,
    codebaseInstances: report.codebaseInstances,
    uniqueProps: Object.keys(report.props).length,
    avgPropsPerInstance:
      report.totalInstances > 0
        ? parseFloat(
            (
              Object.values(report.props).reduce(
                (sum, p) => sum + p.totalUsages,
                0,
              ) / report.totalInstances
            ).toFixed(2),
          )
        : 0,
    totalDefaultUsages: report.totalDefaultUsages,
    props: propsDetail,
    references: report.references,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT GENERATION — summary CSV
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a summary CSV string for all components.
 *
 * @param {Object<string, ComponentReport>} reports
 * @returns {string}
 */
function generateSummaryCSV(reports) {
  const codebaseNames = [...CODEBASES];
  const header = [
    "Component",
    "Total Imports",
    "Total Instances",
    "Default Value Usages",
    ...codebaseNames.map((c) => `${c} Imports`),
    ...codebaseNames.map((c) => `${c} Instances`),
    "Unique Props",
    "Avg Props/Instance",
    "Top 5 Props",
  ].join(",");

  const sorted = Object.values(reports).sort(
    (a, b) => b.totalInstances - a.totalInstances,
  );

  const rows = [header];
  for (const r of sorted) {
    const propsSorted = sortByCount(
      Object.fromEntries(
        Object.entries(r.props).map(([k, v]) => [k, v.totalUsages]),
      ),
    );
    const top5 = propsSorted
      .slice(0, 5)
      .map(([name, count]) => `${name}(${count})`)
      .join("; ");

    const uniqueProps = Object.keys(r.props).length;
    const totalPropUsages = Object.values(r.props).reduce(
      (s, p) => s + p.totalUsages,
      0,
    );
    const avgProps =
      r.totalInstances > 0
        ? (totalPropUsages / r.totalInstances).toFixed(2)
        : "0.00";

    rows.push(
      [
        `"${r.component}"`,
        r.totalImports,
        r.totalInstances,
        r.totalDefaultUsages,
        ...codebaseNames.map((c) => r.codebaseImports[c] || 0),
        ...codebaseNames.map((c) => r.codebaseInstances[c] || 0),
        uniqueProps,
        avgProps,
        `"${top5}"`,
      ].join(","),
    );
  }

  return rows.join("\n") + "\n";
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT GENERATION — summary JSON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a summary JSON string for all components.
 *
 * @param {Object<string, ComponentReport>} reports
 * @returns {string}
 */
function generateSummaryJSON(reports) {
  const sorted = Object.values(reports).sort(
    (a, b) => b.totalInstances - a.totalInstances,
  );

  const components = sorted.map((r) => {
    const propsSorted = sortByCount(
      Object.fromEntries(
        Object.entries(r.props).map(([k, v]) => [k, v.totalUsages]),
      ),
    );

    return {
      component: r.component,
      totalImports: r.totalImports,
      totalInstances: r.totalInstances,
      codebaseImports: r.codebaseImports,
      codebaseInstances: r.codebaseInstances,
      uniqueProps: Object.keys(r.props).length,
      totalDefaultUsages: r.totalDefaultUsages,
      topProps: propsSorted.slice(0, 10).map(([name, count]) => ({
        name,
        usages: count,
        defaultUsages: r.props[name].defaultUsages,
        defaultValue: r.props[name].defaultValue,
      })),
    };
  });

  let totalImports = 0;
  let totalInstances = 0;
  let totalDefaultUsages = 0;
  for (const r of sorted) {
    totalImports += r.totalImports;
    totalInstances += r.totalInstances;
    totalDefaultUsages += r.totalDefaultUsages;
  }

  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      totalComponents: sorted.length,
      totalImports,
      totalInstances,
      totalDefaultUsages,
      components,
    },
    null,
    2,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT GENERATION — summary TXT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a plain-text summary report.
 *
 * @param {Object<string, ComponentReport>} reports
 * @returns {string}
 */
function generateSummaryText(reports) {
  const sorted = Object.values(reports).sort(
    (a, b) => b.totalInstances - a.totalInstances,
  );

  const lines = [];

  lines.push("═".repeat(90));
  lines.push(
    `  PER-COMPONENT ${UI_LIBRARY_NAMES.toUpperCase()} ANALYSIS — SUMMARY`,
  );
  lines.push("═".repeat(90));
  lines.push("");

  let totalImports = 0;
  let totalInstances = 0;
  let totalDefaultUsages = 0;
  for (const r of sorted) {
    totalImports += r.totalImports;
    totalInstances += r.totalInstances;
    totalDefaultUsages += r.totalDefaultUsages;
  }

  lines.push(`  Components analysed:   ${sorted.length}`);
  lines.push(`  Total imports:         ${totalImports}`);
  lines.push(`  Total JSX instances:   ${totalInstances}`);
  lines.push(
    `  Default value usages:  ${totalDefaultUsages}  (props explicitly set to their default)`,
  );
  lines.push("");

  // Ranked table
  lines.push(
    "  " +
      "Rank".padEnd(6) +
      "Component".padEnd(30) +
      "Imports".padStart(9) +
      "Instances".padStart(11) +
      "  " +
      "Props".padStart(7) +
      "  " +
      "Avg P/Use".padStart(10) +
      "  " +
      "Defaults".padStart(9),
  );
  lines.push("  " + "-".repeat(87));

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const uniqueProps = Object.keys(r.props).length;
    const totalPropUsages = Object.values(r.props).reduce(
      (s, p) => s + p.totalUsages,
      0,
    );
    const avgProps =
      r.totalInstances > 0
        ? (totalPropUsages / r.totalInstances).toFixed(2)
        : "0.00";

    lines.push(
      "  " +
        String(i + 1).padEnd(6) +
        r.component.padEnd(30) +
        String(r.totalImports).padStart(9) +
        String(r.totalInstances).padStart(11) +
        "  " +
        String(uniqueProps).padStart(7) +
        "  " +
        avgProps.padStart(10) +
        "  " +
        String(r.totalDefaultUsages).padStart(9),
    );
  }

  lines.push("");

  // Per-component detail (top 20 by instances)
  const topComponents = sorted.slice(0, 20);
  for (const r of topComponents) {
    lines.push("─".repeat(90));
    lines.push(`  ${r.component}`);
    lines.push("─".repeat(90));
    lines.push(
      `  Imports: ${r.totalImports}   Instances: ${r.totalInstances}   Unique props: ${Object.keys(r.props).length}`,
    );
    lines.push("");

    const propsSorted = sortByCount(
      Object.fromEntries(
        Object.entries(r.props).map(([k, v]) => [k, v.totalUsages]),
      ),
    );

    if (propsSorted.length === 0) {
      lines.push("  (no props used)");
      lines.push("");
      continue;
    }

    lines.push(
      "  " +
        "Prop".padEnd(28) +
        "Usages".padStart(8) +
        "  " +
        "Defaults".padStart(9) +
        "  " +
        "% of instances".padStart(15) +
        "  " +
        "Top values",
    );
    lines.push("  " + "-".repeat(95));

    for (const [propName, usages] of propsSorted.slice(0, 20)) {
      const bucket = r.props[propName];
      const percentage = pct(usages, r.totalInstances);
      const defaultStr =
        bucket.defaultValue !== null ? String(bucket.defaultUsages) : "—";
      const topVals = sortByCount(bucket.values)
        .slice(0, 5)
        .map(([v, c]) => `${v}(${c})`)
        .join(", ");

      lines.push(
        "  " +
          propName.padEnd(28) +
          String(usages).padStart(8) +
          "  " +
          defaultStr.padStart(9) +
          "  " +
          (percentage + "%").padStart(15) +
          "  " +
          topVals,
      );
    }

    // Show total default usages for this component
    if (r.totalDefaultUsages > 0) {
      lines.push("");
      lines.push(
        `  ⚠ ${r.totalDefaultUsages} prop usages explicitly set to their default value`,
      );
    }
    lines.push("");
  }

  lines.push("═".repeat(90));
  lines.push("");

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// CODEBASE RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyse a single codebase, merging results into the reports map.
 *
 * @param {string}                          codebase
 * @param {Object<string, ComponentReport>} reports  - Mutated in place.
 * @returns {Promise<number>} Number of files analysed.
 */
async function analyzeCodebase(codebase, reports) {
  if (!codebaseExists(codebase)) {
    console.log(`⚠️  Skipping ${codebase}: path not found`);
    return 0;
  }

  console.log(`\n📊 Analyzing ${codebase}...`);

  const files = await findFiles(codebase);
  console.log(`   Found ${files.length} component files`);

  const { codebasePath } = require("../lib/files");
  const basePath = codebasePath(codebase);

  let analyzed = 0;
  for (const file of files) {
    const content = readSafe(file);
    if (content === null) continue;

    const result = analyzeFileContent(content);
    // Store a relative path from the codebase root for readability
    const relPath = path.relative(basePath, file);
    mergeFileResult(reports, result, codebase, relPath);
    analyzed++;
  }

  return analyzed;
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
  console.log(`  PER-COMPONENT ${UI_LIBRARY_NAMES.toUpperCase()} ANALYSIS`);
  console.log("═".repeat(60));

  /** @type {Object<string, ComponentReport>} */
  const reports = {};

  // Seed reports for all known components so we get entries even for
  // components that are never used.
  for (const comp of TRACKED_COMPONENTS) {
    reports[comp] = createEmptyReport(comp);
  }

  let totalFiles = 0;
  for (const codebase of CODEBASES) {
    totalFiles += await analyzeCodebase(codebase, reports);
  }

  // Run automatic default-value detection now that all usage data is
  // collected.  This replaces the old approach of reading defaults
  // from the config file.
  applyAutoDetectedDefaults(reports);

  // Write reports
  const outDir = reportDir("components");
  ensureDir(outDir);

  // Individual component JSON files
  const componentsDir = path.join(outDir, "detail");
  ensureDir(componentsDir);

  let writtenCount = 0;
  for (const [name, report] of Object.entries(reports)) {
    if (report.totalInstances === 0 && report.totalImports === 0) continue;
    const json = JSON.stringify(buildComponentJson(report), null, 2);
    fs.writeFileSync(path.join(componentsDir, `${name}.json`), json);
    writtenCount++;
  }

  // Summary files
  const summaryCSV = generateSummaryCSV(reports);
  fs.writeFileSync(path.join(outDir, "summary.csv"), summaryCSV);

  const summaryJSON = generateSummaryJSON(reports);
  fs.writeFileSync(path.join(outDir, "summary.json"), summaryJSON);

  const summaryText = generateSummaryText(reports);
  fs.writeFileSync(path.join(outDir, "summary.txt"), summaryText);

  console.log(`\n✅ ${writtenCount} component reports written`);
  console.log("✅ Summary CSV written");
  console.log("✅ Summary JSON written");
  console.log("✅ Summary TXT written");

  // Quick console summary
  console.log("\n" + "─".repeat(60));
  console.log("  QUICK SUMMARY");
  console.log("─".repeat(60));
  console.log(`  Files analysed:     ${totalFiles}`);
  console.log(`  Components found:   ${writtenCount}`);

  const topByInstances = Object.values(reports)
    .sort((a, b) => b.totalInstances - a.totalInstances)
    .slice(0, 5);

  console.log("  Top 5 by instances:");
  for (const r of topByInstances) {
    const topProp = sortByCount(
      Object.fromEntries(
        Object.entries(r.props).map(([k, v]) => [k, v.totalUsages]),
      ),
    )[0];
    const topPropStr = topProp
      ? `  top prop: ${topProp[0]}(${topProp[1]})`
      : "";
    console.log(
      `    ${r.component.padEnd(24)} ${String(r.totalInstances).padStart(6)} instances, ${String(r.totalImports).padStart(4)} imports${topPropStr}`,
    );
  }
  console.log("");
}

// ─── Module boundary ──────────────────────────────────────────────────────────

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  // Line number utility
  lineNumberAt,

  // Import extraction
  extractImports,
  parseNamedImports,
  isTrackedUISource,
  buildTrackedUIImportMap,

  // JSX prop extraction
  findTagEnd,
  parseProps,
  classifyValue,
  normalizeValue,

  // Per-file analysis
  analyzeFileContent,

  // Aggregation
  createEmptyReport,
  recordProp,
  mergeFileResult,

  // Default detection (post-aggregation)
  applyAutoDetectedDefaults,

  // Report generation
  buildComponentJson,
  generateSummaryCSV,
  generateSummaryJSON,
  generateSummaryText,
};
