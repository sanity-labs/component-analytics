#!/usr/bin/env node

/**
 * @module per-component/detect-prop-defaults
 *
 * Automatic Prop Default Detection
 *
 * Analyses the existing per-component report JSON files to infer which
 * prop values are likely defaults.  Uses two complementary strategies:
 *
 *   1. **Name matching** — values that match well-known default patterns
 *      (e.g. `"default"`, `"div"`, `"row"`, `true`, `0`) and appear in
 *      the usage data are flagged with high confidence.
 *
 *   2. **Statistical inference** — for props where the lowest-frequency
 *      value matches a default pattern, or where a single value accounts
 *      for < 10% of usage while every other value is much higher, the
 *      minority value is flagged as a probable default.
 *
 * Output:
 *   - `reports/per-component/detected-prop-defaults.json`
 *     Machine-readable map of `{ Component: { prop: { value, confidence, reason, count, total } } }`
 *
 *   - `reports/per-component/detected-prop-defaults.txt`
 *     Human-readable summary showing every detected default with its
 *     evidence and confidence level.
 *
 *   - Optionally prints a config-ready snippet that can be pasted
 *     directly into `component-analytics.config.js`.
 *
 * Run directly:
 *   node scripts/per-component/detect-prop-defaults.js
 *
 * Or via npm:
 *   npm run detect:prop-defaults
 */

const fs = require("fs");
const path = require("path");

const { TRACKED_COMPONENTS } = require("../lib/constants");
const { sortByCount } = require("../lib/utils");
const { ensureDir, reportDir } = require("../lib/files");

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWN DEFAULT PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Values that are extremely common defaults in UI component libraries.
 *
 * Each entry maps a prop name (or `"*"` for any prop) to a set of
 * values that are likely defaults.  Values are in the normalised form
 * produced by the per-component analyser:
 *
 *   - String literals:  `'"default"'`
 *   - Numbers:          `'2'`
 *   - Booleans:         `'true'`
 *
 * @type {Object<string, Set<string>>}
 */
const KNOWN_DEFAULT_VALUES = {
  // ── By prop name ────────────────────────────────────────────────────────
  mode: new Set(['"default"']),
  tone: new Set(['"default"']),
  as: new Set([
    '"div"',
    '"span"',
    '"button"',
    '"a"',
    '"label"',
    '"h2"',
    '"code"',
  ]),
  type: new Set(['"button"', '"text"']),
  direction: new Set(['"row"']),
  align: new Set(['"stretch"']),
  justify: new Set(['"flex-start"']),
  wrap: new Set(['"nowrap"']),
  weight: new Set(['"regular"']),
  placement: new Set(['"top"', '"bottom"']),
  position: new Set(['"fixed"', '"relative"']),
  size: new Set(['"2"', '"0"', "0", "2"]),
  animated: new Set(["true"]),
  overflow: new Set(['"visible"']),
  display: new Set(['"block"', '"flex"']),
};

/**
 * Well-known HTML element defaults for the `as` prop, keyed by
 * component name.
 *
 * When a component is known to render a specific HTML element by
 * default, seeing `as="<that element>"` is redundant.
 *
 * @type {Object<string, string>}
 */
const KNOWN_AS_DEFAULTS = {
  Box: '"div"',
  Flex: '"div"',
  Grid: '"div"',
  Stack: '"div"',
  Inline: '"div"',
  Container: '"div"',
  Card: '"div"',
  Button: '"button"',
  Tab: '"button"',
  MenuItem: '"button"',
  Text: '"span"',
  Badge: '"span"',
  Label: '"label"',
  Heading: '"h2"',
  Code: '"code"',
};

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTION STRATEGIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} DetectedDefault
 * @property {string} component  - Component name.
 * @property {string} prop       - Prop name.
 * @property {string} value      - The inferred default value (normalised form).
 * @property {string} confidence - "high", "medium", or "low".
 * @property {string} reason     - Human-readable explanation.
 * @property {number} count      - How many times this value was explicitly set.
 * @property {number} total      - Total usages of the prop across all instances.
 */

/**
 * Attempt to detect the default value for a single prop on a single
 * component by applying every strategy in order.
 *
 * Returns the first match with the highest confidence, or `null` if
 * no default can be inferred.
 *
 * @param {string} component       - Component name.
 * @param {string} propName        - Prop name.
 * @param {object} propData        - The prop's data from the per-component JSON.
 * @param {number} propData.totalUsages
 * @param {Object<string, number>} propData.values - normalised value → count.
 * @param {number} totalInstances  - Total instances of this component.
 * @returns {DetectedDefault | null}
 */
function detectPropDefault(component, propName, propData, totalInstances) {
  const { totalUsages, values } = propData;
  if (!values || totalUsages === 0) return null;

  const sorted = sortByCount(values);

  // ── Strategy 1: Known `as` defaults per component ───────────────────
  if (propName === "as" && KNOWN_AS_DEFAULTS[component]) {
    const expected = KNOWN_AS_DEFAULTS[component];
    if (values[expected] != null) {
      return {
        component,
        prop: propName,
        value: expected,
        confidence: "high",
        reason: `Known default: ${component} renders as <${expected.replace(/"/g, "")}> by default`,
        count: values[expected],
        total: totalUsages,
      };
    }
  }

  // ── Strategy 2: Known default value for this prop name ──────────────
  const knownForProp = KNOWN_DEFAULT_VALUES[propName];
  if (knownForProp) {
    for (const candidate of knownForProp) {
      if (values[candidate] != null) {
        // If this value is the LEAST used (or among the least), high confidence
        const count = values[candidate];
        const isMinority = sorted.length > 1 && count <= sorted[0][1] * 0.5;
        const isLiteral =
          candidate === '"default"' || candidate === '"regular"';

        const confidence = isLiteral
          ? "high"
          : isMinority
            ? "high"
            : sorted.length === 1
              ? "medium"
              : "medium";

        return {
          component,
          prop: propName,
          value: candidate,
          confidence,
          reason:
            `Known default pattern: ${propName}=${candidate}` +
            (isMinority
              ? ` (${count} of ${totalUsages} usages — minority value)`
              : ""),
          count,
          total: totalUsages,
        };
      }
    }
  }

  // ── Strategy 3: Statistical minority with a "default-like" name ─────
  // If the least-used value looks like a default (contains "default",
  // is a common element name, is 0, etc.) and accounts for < 15% of
  // all usages of this prop, flag it.
  if (sorted.length >= 2) {
    const leastUsed = sorted[sorted.length - 1];
    const [leastValue, leastCount] = leastUsed;
    const ratio = leastCount / totalUsages;

    if (ratio < 0.15) {
      const looksLikeDefault =
        leastValue === '"default"' ||
        leastValue === '"regular"' ||
        leastValue === '"normal"' ||
        leastValue === '"none"' ||
        leastValue === '"inherit"' ||
        leastValue === "true" ||
        leastValue === "false" ||
        leastValue === "0";

      if (looksLikeDefault) {
        return {
          component,
          prop: propName,
          value: leastValue,
          confidence: "low",
          reason: `Statistical: ${leastValue} is the least-used value (${leastCount}/${totalUsages} = ${(ratio * 100).toFixed(1)}%) and looks like a default`,
          count: leastCount,
          total: totalUsages,
        };
      }
    }
  }

  // ── Strategy 4: Value named "default" anywhere in the value list ────
  // Even if it's not the least used, a value literally called "default"
  // is almost certainly the default.
  if (values['"default"'] != null && propName !== "data-testid") {
    return {
      component,
      prop: propName,
      value: '"default"',
      confidence: "high",
      reason: `Value is literally "default" (${values['"default"']} of ${totalUsages} usages)`,
      count: values['"default"'],
      total: totalUsages,
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT LOADING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load a per-component JSON report from disk.
 *
 * @param {string} component - PascalCase component name.
 * @returns {object | null} The parsed JSON, or null if not found.
 */
function loadComponentReport(component) {
  const filePath = path.join(
    reportDir("components"),
    "components",
    `${component}.json`,
  );

  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULL ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run detection across all known components and return every detected
 * default.
 *
 * @returns {DetectedDefault[]}
 */
function detectAllDefaults() {
  /** @type {DetectedDefault[]} */
  const results = [];

  for (const component of TRACKED_COMPONENTS) {
    const report = loadComponentReport(component);
    if (!report || !report.props) continue;

    const totalInstances = report.totalInstances || 0;

    for (const [propName, propData] of Object.entries(report.props)) {
      // Skip event handlers and internal props — they don't have meaningful defaults
      if (
        propName.startsWith("on") &&
        propName.length > 2 &&
        /[A-Z]/.test(propName[2])
      )
        continue;
      if (propName === "key" || propName === "ref" || propName === "children")
        continue;
      if (propName.startsWith("data-")) continue;
      if (propName.startsWith("aria-")) continue;

      const detected = detectPropDefault(
        component,
        propName,
        propData,
        totalInstances,
      );
      if (detected) {
        results.push(detected);
      }
    }
  }

  // Sort by confidence (high first), then component, then prop
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) => {
    const co =
      (confidenceOrder[a.confidence] || 3) -
      (confidenceOrder[b.confidence] || 3);
    if (co !== 0) return co;
    const cn = a.component.localeCompare(b.component);
    if (cn !== 0) return cn;
    return a.prop.localeCompare(b.prop);
  });

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OUTPUT: JSON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert detected defaults into a structured JSON object keyed by
 * component and prop.
 *
 * @param {DetectedDefault[]} results
 * @returns {object}
 */
function buildJsonOutput(results) {
  /** @type {Object<string, Object<string, object>>} */
  const byComponent = {};

  for (const r of results) {
    if (!byComponent[r.component]) {
      byComponent[r.component] = {};
    }
    byComponent[r.component][r.prop] = {
      value: r.value,
      confidence: r.confidence,
      reason: r.reason,
      count: r.count,
      total: r.total,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    totalDetected: results.length,
    byConfidence: {
      high: results.filter((r) => r.confidence === "high").length,
      medium: results.filter((r) => r.confidence === "medium").length,
      low: results.filter((r) => r.confidence === "low").length,
    },
    components: byComponent,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// OUTPUT: Text
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a human-readable text report.
 *
 * @param {DetectedDefault[]} results
 * @returns {string}
 */
function buildTextOutput(results) {
  const lines = [];

  lines.push("═".repeat(90));
  lines.push("  DETECTED PROP DEFAULTS");
  lines.push("═".repeat(90));
  lines.push("");
  lines.push(
    "  Auto-detected default prop values from per-component report data.",
  );
  lines.push(
    "  These are props that developers explicitly set to what is likely the",
  );
  lines.push("  component's built-in default — i.e. redundant usage.");
  lines.push("");

  const high = results.filter((r) => r.confidence === "high");
  const medium = results.filter((r) => r.confidence === "medium");
  const low = results.filter((r) => r.confidence === "low");

  lines.push(`  Total detected:   ${results.length}`);
  lines.push(`    High confidence:   ${high.length}`);
  lines.push(`    Medium confidence: ${medium.length}`);
  lines.push(`    Low confidence:    ${low.length}`);
  lines.push("");

  // ── Grouped by confidence ──────────────────────────────────────────────

  for (const [label, group] of [
    ["HIGH CONFIDENCE", high],
    ["MEDIUM CONFIDENCE", medium],
    ["LOW CONFIDENCE", low],
  ]) {
    if (group.length === 0) continue;

    lines.push("─".repeat(90));
    lines.push(`  ${label} (${group.length})`);
    lines.push("─".repeat(90));
    lines.push("");
    lines.push(
      "  " +
        "Component".padEnd(26) +
        "Prop".padEnd(20) +
        "Default Value".padEnd(16) +
        "Explicit Uses".padStart(14) +
        "  " +
        "Reason",
    );
    lines.push("  " + "-".repeat(86));

    for (const r of group) {
      lines.push(
        "  " +
          r.component.padEnd(26) +
          r.prop.padEnd(20) +
          r.value.padEnd(16) +
          `${r.count} / ${r.total}`.padStart(14) +
          "  " +
          r.reason,
      );
    }
    lines.push("");
  }

  // ── Config-ready snippet ───────────────────────────────────────────────

  lines.push("═".repeat(90));
  lines.push("  CONFIG-READY SNIPPET (high + medium confidence only)");
  lines.push("═".repeat(90));
  lines.push("");
  lines.push("  Paste this into the `propDefaults` section of your");
  lines.push("  `component-analytics.config.js` uiLibraries entry:");
  lines.push("");
  lines.push("  ```js");
  lines.push("  propDefaults: {");

  // Group high + medium by component
  const configWorthy = results.filter(
    (r) => r.confidence === "high" || r.confidence === "medium",
  );
  /** @type {Object<string, DetectedDefault[]>} */
  const grouped = {};
  for (const r of configWorthy) {
    if (!grouped[r.component]) grouped[r.component] = [];
    grouped[r.component].push(r);
  }

  for (const [comp, props] of Object.entries(grouped).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const entries = props
      .map((r) => `${r.prop}: ${JSON.stringify(r.value)}`)
      .join(", ");
    lines.push(`    ${comp}: { ${entries} },`);
  }

  lines.push("  },");
  lines.push("  ```");
  lines.push("");
  lines.push("═".repeat(90));
  lines.push("");

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main entry point.
 */
function main() {
  console.log("═".repeat(60));
  console.log("  PROP DEFAULT DETECTION");
  console.log("═".repeat(60));
  console.log("");

  // Check that per-component reports exist
  const componentsDir = path.join(reportDir("components"), "detail");
  if (!fs.existsSync(componentsDir)) {
    console.error(
      "❌ Per-component reports not found. Run `npm run analyze:per-component` first.",
    );
    process.exit(1);
  }

  const results = detectAllDefaults();

  console.log(`  Detected ${results.length} prop defaults:`);
  console.log(
    `    High confidence:   ${results.filter((r) => r.confidence === "high").length}`,
  );
  console.log(
    `    Medium confidence: ${results.filter((r) => r.confidence === "medium").length}`,
  );
  console.log(
    `    Low confidence:    ${results.filter((r) => r.confidence === "low").length}`,
  );

  // Write reports
  const outDir = reportDir("components");
  ensureDir(outDir);

  const jsonOutput = buildJsonOutput(results);
  fs.writeFileSync(
    path.join(outDir, "detected-prop-defaults.json"),
    JSON.stringify(jsonOutput, null, 2),
  );
  console.log("\n✅ JSON report saved");

  const textOutput = buildTextOutput(results);
  fs.writeFileSync(path.join(outDir, "detected-prop-defaults.txt"), textOutput);
  console.log("✅ Text report saved");

  // Print top findings to console
  console.log("\n" + "─".repeat(60));
  console.log("  TOP FINDINGS (high confidence)");
  console.log("─".repeat(60));

  const highConf = results.filter((r) => r.confidence === "high");
  for (const r of highConf.slice(0, 15)) {
    console.log(
      `  ${r.component.padEnd(22)} ${r.prop.padEnd(16)} = ${r.value.padEnd(14)} (${r.count} explicit uses)`,
    );
  }

  if (highConf.length > 15) {
    console.log(`  ... and ${highConf.length - 15} more`);
  }

  console.log("");
}

// ─── Module boundary ──────────────────────────────────────────────────────────

if (require.main === module) {
  main();
}

module.exports = {
  // Detection
  detectPropDefault,
  detectAllDefaults,

  // Constants
  KNOWN_DEFAULT_VALUES,
  KNOWN_AS_DEFAULTS,

  // Report helpers
  loadComponentReport,
  buildJsonOutput,
  buildTextOutput,
};
