#!/usr/bin/env node

/**
 * @module prop-combos/analyze-prop-combos
 *
 * Cross-tabulates prop value combinations for configured components.
 *
 * For each entry in `config.propCombos`, this script scans every codebase
 * for instances of the specified component, extracts the values of the
 * listed props, and counts how often each unique combination appears.
 *
 * This answers questions like:
 *   - "Which `weight` × `size` pairings are used on `<Text>`?"
 *   - "Do developers ever use `tone='critical'` with `mode='ghost'` on `<Button>`?"
 *   - "Which three-way `tone` × `padding` × `radius` combos occur on `<Card>`?"
 *
 * Output:
 *   - `reports/prop-combos/report.md`
 *   - `reports/prop-combos/report.csv`
 *   - `reports/prop-combos/report.json`
 *
 * Run directly:
 *   node scripts/prop-combos/analyze-prop-combos.js
 *
 * Or via npm:
 *   npm run analyze:prop-combos
 */

const {
  CODEBASES,
  PROP_COMBOS,
  UI_LIBRARY_NAMES,
} = require("../lib/constants");
const { sortByCount, pct, incr } = require("../lib/utils");
const {
  codebaseExists,
  findFiles,
  readSafe,
  writeReports,
} = require("../lib/files");
const {
  analyzeFileContent,
  classifyValue,
  normalizeValue,
} = require("../per-component/analyze-per-component");

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} ComboInstance
 * @property {string}   codebase - Which codebase.
 * @property {string}   file     - Relative file path.
 * @property {number}   line     - 1-based line number.
 * @property {string[]} values   - Prop values in the same order as the combo's `props` array.
 */

/**
 * @typedef {object} ComboResult
 * @property {string}                  component  - Component name.
 * @property {string[]}                props      - Prop names being combined.
 * @property {number}                  totalInstances - Total instances of the component found.
 * @property {number}                  matchedInstances - Instances where at least one combo prop was set.
 * @property {Object<string, number>}  comboCounts - "val1 × val2" key → count.
 * @property {Object<string, Object<string, number>>} comboCountsByCodebase
 *   Codebase → { comboKey → count }.
 * @property {ComboInstance[]}         instances  - Every matched instance (capped for JSON).
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

/** Sentinel for "prop not supplied on this instance". */
const UNSET = "(unset)";

/**
 * Build a display key for a combination tuple.
 *
 * @param {string[]} values
 * @returns {string}
 */
function comboKey(values) {
  return values.join(" × ");
}

/**
 * Normalize a raw prop value the same way per-component does, so that
 * combo keys are consistent with the existing reports.
 *
 * @param {string} raw
 * @returns {string}
 */
function normalize(raw) {
  return normalizeValue(classifyValue(raw));
}

/**
 * Analyse a single codebase for one combo entry.
 *
 * @param {import("../lib/config-schema").PropComboEntry} combo
 * @param {string} codebase
 * @returns {Promise<{ totalInstances: number, matchedInstances: number, comboCounts: Object<string, number>, instances: ComboInstance[] } | null>}
 */
async function analyzeCodebaseForCombo(combo, codebase) {
  if (!codebaseExists(codebase)) return null;

  const files = await findFiles(codebase);
  let totalInstances = 0;
  let matchedInstances = 0;
  /** @type {Object<string, number>} */
  const comboCounts = {};
  /** @type {ComboInstance[]} */
  const instances = [];

  for (const filePath of files) {
    const content = readSafe(filePath);
    if (!content) continue;

    const { instances: fileInstances } = analyzeFileContent(content);

    for (const inst of fileInstances) {
      if (inst.component !== combo.component) continue;

      totalInstances++;

      // Build a map of prop name → normalized value for this instance
      /** @type {Object<string, string>} */
      const propMap = {};
      for (const p of inst.props) {
        propMap[p.name] = normalize(p.value);
      }

      // Extract values for the configured props
      const values = combo.props.map((p) => propMap[p] || UNSET);

      // Only count as "matched" if at least one configured prop was set
      const hasAny = values.some((v) => v !== UNSET);
      if (!hasAny) continue;

      matchedInstances++;
      const key = comboKey(values);
      incr(comboCounts, key);

      // Derive a short relative path from the absolute filePath
      const codebasePath = require("../lib/files").codebasePath(codebase);
      const path = require("path");
      const relPath = path.relative(codebasePath, filePath);

      instances.push({
        codebase,
        file: relPath,
        line: inst.line,
        values,
      });
    }
  }

  return { totalInstances, matchedInstances, comboCounts, instances };
}

/**
 * Run the full analysis for one combo entry across all codebases.
 *
 * @param {import("../lib/config-schema").PropComboEntry} combo
 * @returns {Promise<ComboResult>}
 */
async function analyzeCombo(combo) {
  /** @type {Object<string, number>} */
  const comboCounts = {};
  /** @type {Object<string, Object<string, number>>} */
  const comboCountsByCodebase = {};
  /** @type {ComboInstance[]} */
  const allInstances = [];
  let totalInstances = 0;
  let matchedInstances = 0;

  for (const codebase of CODEBASES) {
    const result = await analyzeCodebaseForCombo(combo, codebase);
    if (!result) continue;

    totalInstances += result.totalInstances;
    matchedInstances += result.matchedInstances;

    for (const [key, count] of Object.entries(result.comboCounts)) {
      incr(comboCounts, key, count);
    }

    comboCountsByCodebase[codebase] = result.comboCounts;
    allInstances.push(...result.instances);
  }

  return {
    component: combo.component,
    props: combo.props,
    totalInstances,
    matchedInstances,
    comboCounts,
    comboCountsByCodebase,
    instances: allInstances,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT GENERATION — Markdown
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate the markdown report for a single combo result.
 *
 * @param {ComboResult} result
 * @returns {string}
 */
function generateText(result) {
  const lines = [];
  const propsLabel = result.props.join(" × ");

  lines.push(`# ${result.component} Prop Combinations — ${propsLabel}`);
  lines.push("");
  lines.push(
    `Cross-tabulation of \`${propsLabel}\` value combinations on \`<${result.component}>\`.`,
  );
  lines.push(
    "Only instances where at least one of the listed props is set are included.",
  );
  lines.push("");
  lines.push(
    `- **Total \`<${result.component}>\` instances:** ${result.totalInstances}`,
  );
  lines.push(
    `- **Instances with at least one combo prop:** ${result.matchedInstances}`,
  );
  lines.push(
    `- **Unique combinations:** ${Object.keys(result.comboCounts).length}`,
  );
  lines.push("");

  const sorted = sortByCount(result.comboCounts);

  if (sorted.length === 0) {
    lines.push("*No instances found with these props set.*");
    lines.push("");
    return lines.join("\n") + "\n";
  }

  // Main combo table
  lines.push("## Combinations");
  lines.push("");

  const propHeaders = result.props.map((p) => `\`${p}\``).join(" | ");
  lines.push(`| Rank | ${propHeaders} | Count | % of Matched |`);
  const alignments = result.props.map(() => "---").join(" | ");
  lines.push(`| ---: | ${alignments} | ---: | ---: |`);

  for (let i = 0; i < sorted.length; i++) {
    const [key, count] = sorted[i];
    const values = key.split(" × ");
    const valueCells = values.map((v) => `\`${v}\``).join(" | ");
    lines.push(
      `| ${i + 1} | ${valueCells} | ${count} | ${pct(count, result.matchedInstances)}% |`,
    );
  }
  lines.push("");

  // Per-codebase breakdown (only if multiple codebases)
  const codebaseNames = Object.keys(result.comboCountsByCodebase);
  if (codebaseNames.length > 1) {
    lines.push("## By Codebase");
    lines.push("");

    const cbHeaders = codebaseNames.join(" | ");
    const cbAligns = codebaseNames.map(() => "---:").join(" | ");
    lines.push(`| Combination | ${cbHeaders} | Total |`);
    lines.push(`| --- | ${cbAligns} | ---: |`);

    for (const [key, total] of sorted.slice(0, 30)) {
      const perCb = codebaseNames
        .map((cb) => {
          const count = (result.comboCountsByCodebase[cb] || {})[key] || 0;
          return String(count);
        })
        .join(" | ");
      lines.push(`| ${key} | ${perCb} | ${total} |`);
    }

    if (sorted.length > 30) {
      lines.push("");
      lines.push(`*... and ${sorted.length - 30} more combinations*`);
    }
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT GENERATION — CSV
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Escape a CSV field value (wrap in quotes if it contains commas, quotes, or newlines).
 *
 * @param {string} value
 * @returns {string}
 */
function csvEscape(value) {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Generate the CSV report for a single combo result.
 *
 * @param {ComboResult} result
 * @returns {string}
 */
function generateCsv(result) {
  const rows = [];
  const header = ["Component", ...result.props, ...CODEBASES, "Total"].map(
    csvEscape,
  );
  rows.push(header.join(","));

  const sorted = sortByCount(result.comboCounts);

  for (const [key, total] of sorted) {
    const values = key.split(" × ");
    const perCb = CODEBASES.map((cb) => {
      return (result.comboCountsByCodebase[cb] || {})[key] || 0;
    });
    const row = [result.component, ...values, ...perCb, total].map(csvEscape);
    rows.push(row.join(","));
  }

  return rows.join("\n") + "\n";
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT GENERATION — JSON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate the JSON report for a single combo result.
 *
 * @param {ComboResult} result
 * @returns {string}
 */
function generateJson(result) {
  const sorted = sortByCount(result.comboCounts);

  const output = {
    generatedAt: new Date().toISOString(),
    libraryNames: UI_LIBRARY_NAMES,
    component: result.component,
    props: result.props,
    totalInstances: result.totalInstances,
    matchedInstances: result.matchedInstances,
    uniqueCombinations: sorted.length,
    combinations: sorted.map(([key, count]) => {
      const values = key.split(" × ");
      const propValues = {};
      for (let i = 0; i < result.props.length; i++) {
        propValues[result.props[i]] = values[i];
      }
      return {
        ...propValues,
        count,
        percentOfMatched: parseFloat(pct(count, result.matchedInstances)),
      };
    }),
    byCodebase: Object.fromEntries(
      Object.entries(result.comboCountsByCodebase).map(([codebase, counts]) => [
        codebase,
        {
          total: Object.values(counts).reduce((a, b) => a + b, 0),
          combinations: sortByCount(counts).map(([key, count]) => {
            const values = key.split(" × ");
            const propValues = {};
            for (let i = 0; i < result.props.length; i++) {
              propValues[result.props[i]] = values[i];
            }
            return { ...propValues, count };
          }),
        },
      ]),
    ),
    // Cap instances in JSON to keep file size reasonable
    sampleInstances: result.instances.slice(0, 500).map((inst) => ({
      codebase: inst.codebase,
      file: inst.file,
      line: inst.line,
      props: Object.fromEntries(
        result.props.map((p, i) => [p, inst.values[i]]),
      ),
    })),
  };

  return JSON.stringify(output, null, 2) + "\n";
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the report subdirectory and base filename for a combo result.
 *
 * Directory:  `prop-combos/<Component>`
 * Base name:  `<Component>-<prop1>-<prop2>-...-combo`
 *
 * @param {ComboResult} result
 * @returns {{ subdir: string, baseName: string }}
 */
function comboReportPath(result) {
  const subdir = `prop-combos/${result.component}`;
  const baseName = result.component + "-" + result.props.join("-") + "-combo";
  return { subdir, baseName };
}

async function main() {
  console.log("═".repeat(60));
  console.log("  PROP COMBINATION ANALYSIS");
  console.log("═".repeat(60));
  console.log("");

  if (PROP_COMBOS.length === 0) {
    console.log(
      "  ⚠ No propCombos configured in component-analytics.config.js",
    );
    console.log(
      "  Add entries to the `propCombos` array to enable this report.",
    );
    console.log("");
    return;
  }

  console.log(`  Combos configured: ${PROP_COMBOS.length}`);
  for (const combo of PROP_COMBOS) {
    console.log(`    ${combo.component}: ${combo.props.join(" × ")}`);
  }
  console.log("");

  /** @type {ComboResult[]} */
  const results = [];

  for (const combo of PROP_COMBOS) {
    console.log(
      `  Analysing ${combo.component} [${combo.props.join(", ")}]...`,
    );
    const result = await analyzeCombo(combo);
    results.push(result);

    const uniqueCombos = Object.keys(result.comboCounts).length;
    console.log(
      `    ${result.matchedInstances} matched / ${result.totalInstances} total → ${uniqueCombos} unique combos`,
    );

    // Write this combo's reports to its own directory
    const { subdir, baseName } = comboReportPath(result);
    const text = generateText(result);
    const csv = generateCsv(result);
    const json = generateJson(result);

    const { mdPath, csvPath, jsonPath } = writeReports(subdir, baseName, {
      text,
      csv,
      json,
    });

    console.log(`     ${mdPath}`);
    console.log(`     ${csvPath}`);
    console.log(`     ${jsonPath}`);
  }

  // Quick console summary
  console.log("");
  console.log("─".repeat(60));
  console.log("  QUICK SUMMARY");
  console.log("─".repeat(60));

  for (const result of results) {
    const sorted = sortByCount(result.comboCounts);
    const top3 = sorted
      .slice(0, 3)
      .map(([key, count]) => `${key} (${count})`)
      .join(", ");
    console.log(
      `  ${result.component} [${result.props.join("×")}]: ${sorted.length} combos, top: ${top3}`,
    );
  }
  console.log("");
}

main().catch((err) => {
  console.error("❌ Prop combo analysis failed:", err);
  process.exit(1);
});

module.exports = {
  analyzeCodebaseForCombo,
  analyzeCombo,
  generateText,
  generateCsv,
  generateJson,
  comboReportPath,
  comboKey,
  normalize,
  UNSET,
};
