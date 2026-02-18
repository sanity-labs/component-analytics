#!/usr/bin/env node

/**
 * @module run
 *
 * Unified analysis runner.
 *
 * Replaces the long chains of hardcoded shell commands that were
 * previously in package.json.  Reads codebases and scan types from
 * the central configuration file and runs every analysis step in
 * the correct order.
 *
 * Usage:
 *   node scripts/run.js              # run everything
 *   node scripts/run.js --step scan  # run only the React Scanner step
 *
 * Available steps (run in this order by default):
 *   scan           React Scanner (components + ui-wrappers for every codebase)
 *   sources        UI component source classification
 *   html-tags      Native HTML/SVG tag usage
 *   customizations Inline style= and styled() detection
 *   per-component  Per-component props, values, references, defaults
 *   prop-surface   Character footprint of UI props
 *   line-ownership Line-of-code footprint of UI library
 */

const { execSync } = require("child_process");
const path = require("path");

const { CODEBASES } = require("./lib/constants");

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..");
const CONFIG = path.join(ROOT, "config", "react-scanner.config.js");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Run a shell command, inheriting stdio so the user sees output in
 * real time.  Throws on non-zero exit code.
 *
 * @param {string} cmd
 * @param {Object<string, string>} [env] - Extra environment variables.
 */
function run(cmd, env = {}) {
  execSync(cmd, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

/**
 * Run a Node script relative to the scripts/ directory.
 *
 * @param {string} scriptPath - Path relative to scripts/ (e.g. "sources/analyze-ui-component-sources.js").
 */
function runScript(scriptPath) {
  run(`node scripts/${scriptPath}`);
}

/**
 * Run React Scanner for every codebase with a given SCAN_TYPE.
 *
 * @param {string} scanType - One of: components, ui-wrappers, ui-library, icons, all.
 */
function runScannerForAll(scanType) {
  for (const codebase of CODEBASES) {
    run(`npx react-scanner -c ${CONFIG}`, {
      SCAN_TYPE: scanType,
      CODEBASE: codebase,
    });
  }
}

// ─── Steps ────────────────────────────────────────────────────────────────────

/**
 * Each step is a named function that runs one phase of the analysis.
 * They are executed in declaration order when no --step flag is given.
 */
const STEPS = {
  /**
   * React Scanner — run for each codebase × scan type, then post-process
   * the JSON output into CSV/TXT reports.
   */
  scan() {
    console.log("\n" + "═".repeat(60));
    console.log("  STEP: React Scanner");
    console.log("═".repeat(60));

    // 1. All components (scoped to codebase)
    console.log("\n── Scanning: components ──");
    runScannerForAll("components");
    runScript("components/convert-to-csv.js");
    runScript("components/create-summary-csv.js");
    runScript("components/generate-stats.js");

    // 2. UI wrapper layer
    console.log("\n── Scanning: ui-wrappers ──");
    runScannerForAll("ui-wrappers");
    runScript("ui-components/convert-ui-components-to-csv.js");
    runScript("ui-components/create-ui-components-summary.js");
  },

  /**
   * UI component source classification — classifies every JSX element
   * as tracked UI, internal, native HTML, or other.
   */
  sources() {
    console.log("\n" + "═".repeat(60));
    console.log("  STEP: Source Classification");
    console.log("═".repeat(60));
    runScript("sources/analyze-ui-component-sources.js");
  },

  /**
   * Native HTML/SVG tag usage.
   */
  "html-tags"() {
    console.log("\n" + "═".repeat(60));
    console.log("  STEP: HTML Tags");
    console.log("═".repeat(60));
    runScript("html-tags/analyze-html-tags.js");
  },

  /**
   * Inline style= and styled() detection on tracked UI components.
   */
  customizations() {
    console.log("\n" + "═".repeat(60));
    console.log("  STEP: Customizations");
    console.log("═".repeat(60));
    runScript("customizations/analyze-sanity-ui-customizations.js");
  },

  /**
   * Per-component analysis — imports, instances, props, values,
   * references, and automatic default-value detection.
   */
  "per-component"() {
    console.log("\n" + "═".repeat(60));
    console.log("  STEP: Per-Component Analysis");
    console.log("═".repeat(60));
    runScript("per-component/analyze-per-component.js");
    runScript("per-component/detect-prop-defaults.js");
  },

  /**
   * Character footprint of UI component props relative to UI files.
   */
  "prop-surface"() {
    console.log("\n" + "═".repeat(60));
    console.log("  STEP: Prop Surface Area");
    console.log("═".repeat(60));
    runScript("prop-surface/analyze-prop-surface.js");
  },

  /**
   * Line-of-code footprint of UI library relative to UI files.
   */
  "line-ownership"() {
    console.log("\n" + "═".repeat(60));
    console.log("  STEP: Line Ownership");
    console.log("═".repeat(60));
    runScript("line-ownership/analyze-line-ownership.js");
  },
};

// ─── CLI ──────────────────────────────────────────────────────────────────────

/**
 * Parse --step <name> from argv.  Returns null if no --step flag is
 * present (meaning "run all steps").
 *
 * @returns {string | null}
 */
function parseRequestedStep() {
  const idx = process.argv.indexOf("--step");
  if (idx === -1) return null;
  const step = process.argv[idx + 1];
  if (!step || step.startsWith("-")) {
    const valid = Object.keys(STEPS).join(", ");
    console.error(`Error: --step requires a step name.  Valid steps: ${valid}`);
    process.exit(1);
  }
  if (!STEPS[step]) {
    const valid = Object.keys(STEPS).join(", ");
    console.error(`Error: unknown step "${step}".  Valid steps: ${valid}`);
    process.exit(1);
  }
  return step;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const startTime = Date.now();

  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║           UI COMPONENT ANALYSIS RUNNER                ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  Codebases: ${CODEBASES.join(", ")}`);
  console.log(`  Config:    studio-analysis.config.js`);

  const requestedStep = parseRequestedStep();

  if (requestedStep) {
    console.log(`  Running:   ${requestedStep} (single step)`);
    console.log("");
    STEPS[requestedStep]();
  } else {
    const stepNames = Object.keys(STEPS);
    console.log(`  Running:   all ${stepNames.length} steps`);
    console.log(`  Steps:     ${stepNames.join(" → ")}`);
    console.log("");

    for (const [name, fn] of Object.entries(STEPS)) {
      try {
        fn();
      } catch (err) {
        console.error(`\n❌ Step "${name}" failed:`);
        console.error(err.message || err);
        process.exit(1);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n" + "═".repeat(60));
  console.log(`  ✅ Done in ${elapsed}s`);
  console.log("═".repeat(60));
  console.log("");
}

main();
