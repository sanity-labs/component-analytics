#!/usr/bin/env node

/**
 * @module versions/analyze-versions
 *
 * Version Usage Analysis
 *
 * Reads the per-component detail JSON reports (which include
 * `packageVersion` on every instance reference) and produces:
 *
 *   1. A cross-codebase summary in `reports/sources/versions.json`
 *      and `reports/sources/versions.md`
 *   2. Per-codebase breakdowns in `reports/codebases/<name>/versions.json`
 *      and `reports/codebases/<name>/versions.md`
 *
 * Run directly:
 *   node scripts/versions/analyze-versions.js
 *
 * Or add a step in run.js.
 */

const fs = require("fs");
const path = require("path");

const { CODEBASES } = require("../lib/constants");
const { ensureDir, reportDir } = require("../lib/files");
const { sortByCount } = require("../lib/utils");

// ═══════════════════════════════════════════════════════════════════════════════
// DATA COLLECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} VersionEntry
 * @property {string}      version   - The declared package version string.
 * @property {string}      codebase  - Which codebase the instance belongs to.
 * @property {string}      component - The component name (e.g. "Button").
 * @property {string}      library   - The library name (e.g. "Sanity UI").
 * @property {string}      file      - Relative file path.
 * @property {number}      line      - 1-based line number.
 */

/**
 * Load all per-component detail JSON files and extract version data
 * from every instance reference.
 *
 * @returns {{ entries: VersionEntry[], libraries: Set<string> }}
 */
function collectVersionData() {
  const detailDir = path.join(reportDir("components"), "detail");

  if (!fs.existsSync(detailDir)) {
    console.error(
      "❌ Per-component detail reports not found at:",
      detailDir,
    );
    console.error(
      "   Run `npm run analyze:per-component` first.",
    );
    process.exit(1);
  }

  const files = fs
    .readdirSync(detailDir)
    .filter((f) => f.endsWith(".json"));

  /** @type {VersionEntry[]} */
  const entries = [];
  const libraries = new Set();

  for (const file of files) {
    const data = JSON.parse(
      fs.readFileSync(path.join(detailDir, file), "utf8"),
    );

    const library = data.library || "Unknown";
    libraries.add(library);

    for (const ref of data.references || []) {
      const version = ref.packageVersion || "unknown";
      entries.push({
        version,
        codebase: ref.codebase,
        component: data.component,
        library,
        file: ref.file,
        line: ref.line,
      });
    }
  }

  return { entries, libraries };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} VersionSummary
 * @property {number} instances                       - Total instances.
 * @property {Object<string, number>} byVersion       - version → count.
 * @property {Object<string, Object<string, number>>} byLibrary
 *   - library → { version → count }.
 * @property {Object<string, Object<string, number>>} byComponent
 *   - component → { version → count }.
 */

/**
 * Aggregate version entries into a summary.
 *
 * @param {VersionEntry[]} entries
 * @returns {VersionSummary}
 */
function aggregateVersions(entries) {
  /** @type {Object<string, number>} */
  const byVersion = {};
  /** @type {Object<string, Object<string, number>>} */
  const byLibrary = {};
  /** @type {Object<string, Object<string, number>>} */
  const byComponent = {};

  for (const e of entries) {
    // By version
    byVersion[e.version] = (byVersion[e.version] || 0) + 1;

    // By library → version
    if (!byLibrary[e.library]) byLibrary[e.library] = {};
    byLibrary[e.library][e.version] =
      (byLibrary[e.library][e.version] || 0) + 1;

    // By component → version
    if (!byComponent[e.component]) byComponent[e.component] = {};
    byComponent[e.component][e.version] =
      (byComponent[e.component][e.version] || 0) + 1;
  }

  return {
    instances: entries.length,
    byVersion,
    byLibrary,
    byComponent,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT GENERATION — Markdown
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a Markdown version usage report.
 *
 * @param {VersionSummary} summary
 * @param {string}         [title="Version Usage Report"]
 * @param {string[]}       [codebaseNames] - When provided, adds a
 *   per-codebase breakdown section.  Pass null for a single-codebase report.
 * @param {Object<string, VersionSummary>} [perCodebase] - Keyed by codebase name.
 * @returns {string}
 */
function generateMarkdown(summary, title, codebaseNames, perCodebase) {
  const lines = [];

  lines.push(`# ${title || "Version Usage Report"}`);
  lines.push("");
  lines.push(`Total tracked component instances: **${summary.instances.toLocaleString()}**`);
  lines.push("");

  // ── Overall version breakdown ─────────────────────────────────────────
  lines.push("## Version Breakdown");
  lines.push("");
  lines.push("| Version | Instances | % |");
  lines.push("| --- | ---: | ---: |");

  const sortedVersions = sortByCount(summary.byVersion);
  for (const [version, count] of sortedVersions) {
    const pct =
      summary.instances > 0
        ? ((count / summary.instances) * 100).toFixed(1)
        : "0.0";
    lines.push(`| ${version} | ${count.toLocaleString()} | ${pct}% |`);
  }
  lines.push("");

  // ── Per-library version breakdown ─────────────────────────────────────
  const libNames = Object.keys(summary.byLibrary).sort();
  if (libNames.length > 0) {
    lines.push("## By Library");
    lines.push("");

    for (const lib of libNames) {
      lines.push(`### ${lib}`);
      lines.push("");
      lines.push("| Version | Instances | % of Library |");
      lines.push("| --- | ---: | ---: |");

      const libTotal = Object.values(summary.byLibrary[lib]).reduce(
        (s, c) => s + c,
        0,
      );
      const sorted = sortByCount(summary.byLibrary[lib]);
      for (const [version, count] of sorted) {
        const pct =
          libTotal > 0
            ? ((count / libTotal) * 100).toFixed(1)
            : "0.0";
        lines.push(
          `| ${version} | ${count.toLocaleString()} | ${pct}% |`,
        );
      }
      lines.push("");
    }
  }

  // ── Per-codebase version breakdown ────────────────────────────────────
  if (codebaseNames && perCodebase) {
    lines.push("## By Codebase");
    lines.push("");

    // Summary table
    const allVersions = sortedVersions.map(([v]) => v);
    lines.push(
      `| Codebase | Instances | ${allVersions.join(" | ")} |`,
    );
    lines.push(
      `| --- | ---: | ${allVersions.map(() => "---:").join(" | ")} |`,
    );

    for (const cb of codebaseNames) {
      const cbSummary = perCodebase[cb];
      if (!cbSummary) continue;
      const counts = allVersions
        .map((v) => cbSummary.byVersion[v] || 0)
        .join(" | ");
      lines.push(
        `| ${cb} | ${cbSummary.instances.toLocaleString()} | ${counts} |`,
      );
    }
    lines.push("");

    // Detailed per-codebase library breakdown
    for (const cb of codebaseNames) {
      const cbSummary = perCodebase[cb];
      if (!cbSummary || cbSummary.instances === 0) continue;

      lines.push(`### ${cb}`);
      lines.push("");

      for (const lib of Object.keys(cbSummary.byLibrary).sort()) {
        const libVersions = sortByCount(cbSummary.byLibrary[lib]);
        const libTotal = libVersions.reduce((s, [, c]) => s + c, 0);

        lines.push(`**${lib}** (${libTotal.toLocaleString()} instances)`);
        lines.push("");
        lines.push("| Version | Instances | % |");
        lines.push("| --- | ---: | ---: |");

        for (const [version, count] of libVersions) {
          const pct =
            libTotal > 0
              ? ((count / libTotal) * 100).toFixed(1)
              : "0.0";
          lines.push(
            `| ${version} | ${count.toLocaleString()} | ${pct}% |`,
          );
        }
        lines.push("");
      }
    }
  }

  // ── Top components by version diversity ───────────────────────────────
  const multiVersion = Object.entries(summary.byComponent)
    .filter(([, versions]) => Object.keys(versions).length > 1)
    .sort(
      (a, b) =>
        Object.keys(b[1]).length - Object.keys(a[1]).length ||
        Object.values(b[1]).reduce((s, c) => s + c, 0) -
          Object.values(a[1]).reduce((s, c) => s + c, 0),
    )
    .slice(0, 20);

  if (multiVersion.length > 0) {
    lines.push("## Components Used Across Multiple Versions");
    lines.push("");
    lines.push(
      "Components imported from different versions of the same library",
    );
    lines.push("across the codebase(s).");
    lines.push("");
    lines.push("| Component | Versions | Total Instances |");
    lines.push("| --- | --- | ---: |");

    for (const [comp, versions] of multiVersion) {
      const total = Object.values(versions).reduce((s, c) => s + c, 0);
      const versionList = sortByCount(versions)
        .map(([v, c]) => `${v} (${c})`)
        .join(", ");
      lines.push(`| ${comp} | ${versionList} | ${total} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT GENERATION — JSON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a JSON version usage report.
 *
 * @param {VersionSummary} summary
 * @param {Object<string, VersionSummary>} [perCodebase]
 * @returns {string} Pretty-printed JSON.
 */
function generateJSON(summary, perCodebase) {
  const output = {
    generatedAt: new Date().toISOString(),
    totalInstances: summary.instances,
    versions: sortByCount(summary.byVersion).map(([version, count]) => ({
      version,
      instances: count,
      percent:
        summary.instances > 0
          ? parseFloat(((count / summary.instances) * 100).toFixed(1))
          : 0,
    })),
    byLibrary: {},
  };

  for (const [lib, versions] of Object.entries(summary.byLibrary)) {
    const libTotal = Object.values(versions).reduce((s, c) => s + c, 0);
    output.byLibrary[lib] = {
      totalInstances: libTotal,
      versions: sortByCount(versions).map(([version, count]) => ({
        version,
        instances: count,
        percent:
          libTotal > 0
            ? parseFloat(((count / libTotal) * 100).toFixed(1))
            : 0,
      })),
    };
  }

  if (perCodebase) {
    output.codebases = {};
    for (const [cb, cbSummary] of Object.entries(perCodebase)) {
      output.codebases[cb] = {
        totalInstances: cbSummary.instances,
        versions: sortByCount(cbSummary.byVersion).map(
          ([version, count]) => ({
            version,
            instances: count,
          }),
        ),
        byLibrary: {},
      };
      for (const [lib, versions] of Object.entries(cbSummary.byLibrary)) {
        output.codebases[cb].byLibrary[lib] = sortByCount(versions).map(
          ([version, count]) => ({ version, instances: count }),
        );
      }
    }
  }

  return JSON.stringify(output, null, 2);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PER-CODEBASE REPORT WRITING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Write a per-codebase version report to the codebases report directory.
 *
 * @param {string}         codebase  - Codebase display name.
 * @param {VersionSummary} summary   - Aggregated data for this codebase.
 */
function writeCodebaseReport(codebase, summary) {
  const dir = reportDir(`codebases/${codebase}`);
  ensureDir(dir);

  const md = generateMarkdown(
    summary,
    `${codebase} — Version Usage`,
  );
  fs.writeFileSync(path.join(dir, "versions.md"), md);

  const json = generateJSON(summary);
  fs.writeFileSync(path.join(dir, "versions.json"), json);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

function main() {
  console.log("═".repeat(60));
  console.log("  VERSION USAGE ANALYSIS");
  console.log("═".repeat(60));

  // ── Collect ───────────────────────────────────────────────────────────
  const { entries, libraries } = collectVersionData();
  console.log(
    `\n  ${entries.length.toLocaleString()} instance references loaded`,
  );
  console.log(`  ${libraries.size} tracked libraries`);

  // ── Aggregate overall ─────────────────────────────────────────────────
  const overallSummary = aggregateVersions(entries);

  // ── Aggregate per codebase ────────────────────────────────────────────
  /** @type {Object<string, VersionSummary>} */
  const perCodebase = {};
  const codebaseNames = [...new Set(entries.map((e) => e.codebase))].sort();

  for (const cb of codebaseNames) {
    const cbEntries = entries.filter((e) => e.codebase === cb);
    perCodebase[cb] = aggregateVersions(cbEntries);
  }

  // ── Write cross-codebase summary to reports/sources/ ──────────────────
  const sourcesDir = reportDir("sources");
  ensureDir(sourcesDir);

  const summaryMd = generateMarkdown(
    overallSummary,
    "Version Usage — All Codebases",
    codebaseNames,
    perCodebase,
  );
  fs.writeFileSync(path.join(sourcesDir, "versions.md"), summaryMd);
  console.log(`  ✅ ${path.join(sourcesDir, "versions.md")}`);

  const summaryJson = generateJSON(overallSummary, perCodebase);
  fs.writeFileSync(path.join(sourcesDir, "versions.json"), summaryJson);
  console.log(`  ✅ ${path.join(sourcesDir, "versions.json")}`);

  // ── Write per-codebase reports ────────────────────────────────────────
  for (const cb of codebaseNames) {
    writeCodebaseReport(cb, perCodebase[cb]);
    console.log(
      `  ✅ reports/codebases/${cb}/versions.md + versions.json`,
    );
  }

  // ── Console summary ───────────────────────────────────────────────────
  console.log("\n" + "─".repeat(60));
  console.log("  VERSION SUMMARY");
  console.log("─".repeat(60));

  const sortedVersions = sortByCount(overallSummary.byVersion);
  for (const [version, count] of sortedVersions) {
    const pct = ((count / overallSummary.instances) * 100).toFixed(1);
    console.log(
      `  ${version.padEnd(30)} ${String(count).padStart(6)} instances  (${pct}%)`,
    );
  }

  console.log("\n  By codebase:");
  for (const cb of codebaseNames) {
    const cbVersions = sortByCount(perCodebase[cb].byVersion);
    const top = cbVersions
      .slice(0, 3)
      .map(([v, c]) => `${v}(${c})`)
      .join(", ");
    console.log(
      `    ${cb.padEnd(20)} ${String(perCodebase[cb].instances).padStart(6)} instances  [${top}]`,
    );
  }
  console.log("");
}

// ─── Module boundary ──────────────────────────────────────────────────────────

if (require.main === module) {
  main();
}

module.exports = {
  collectVersionData,
  aggregateVersions,
  generateMarkdown,
  generateJSON,
};
