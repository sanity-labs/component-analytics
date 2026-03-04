const path = require("path");

const {
  CODEBASES,
  CODEBASE_PATHS,
  ALL_UI_LIBRARIES,
  DEFAULT_GLOB_IGNORE,
} = require("../scripts/lib/constants");

/**
 * Unified React Scanner configuration.
 *
 * All scan types are derived from the central configuration file
 * (`component-analytics.config.js`).  The SCAN_TYPE environment
 * variable selects which scan to run:
 *
 *   SCAN_TYPE=components                 All React components (no import filter)
 *   SCAN_TYPE=library:<library-name>     Only components from a specific UI library
 *   SCAN_TYPE=wrappers:<library-name>    Only components from a library's wrapper layer
 *
 * The CODEBASE environment variable selects which codebase to scan.
 * Both are typically set by the npm scripts in package.json or by
 * `scripts/run.js`.
 *
 * Examples:
 *   SCAN_TYPE=components CODEBASE=Studio react-scanner -c config/react-scanner.config.js
 *   SCAN_TYPE=library:Sanity%20UI CODEBASE=Studio react-scanner -c config/react-scanner.config.js
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Turn a human-readable name into a filesystem-safe slug.
 *
 *   "Sanity UI"    → "sanity-ui"
 *   "Sanity Icons" → "sanity-icons"
 *
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Build a single regex that matches any of the given substrings.
 * Returns a pattern that matches nothing if the list is empty.
 *
 * @param {string[]} sources
 * @returns {RegExp}
 */
function buildImportPattern(sources) {
  if (sources.length === 0) return /(?!)/;
  return new RegExp(
    sources.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  );
}

// ─── Scan type resolution ─────────────────────────────────────────────────────

/**
 * @typedef {object} ScanDefinition
 * @property {RegExp|null} importedFrom - React Scanner import filter.
 *   When `null`, all components are captured.
 * @property {(cb: string) => string} outputDir - Output directory per codebase.
 * @property {string} outputFile - Output filename.
 */

/**
 * Build the full map of available scan types from the central config.
 *
 * - `components` — always present, captures every component (no filter).
 * - `library:<name>` — one entry per configured UI library, filtered by
 *   its `importSources`.
 * - `wrappers:<name>` — one entry per configured UI library that has
 *   `wrapperSources`, filtered by those wrapper import patterns.
 *
 * @returns {Object<string, ScanDefinition>}
 */
function buildScanTypes() {
  /** @type {Object<string, ScanDefinition>} */
  const types = {
    components: {
      importedFrom: null,
      outputDir: (cb) => `codebases/${cb}/all-components`,
      outputFile: "all-components.json",
    },
  };

  for (const lib of ALL_UI_LIBRARIES) {
    const slug = slugify(lib.name);

    // Per-library scan (e.g. "library:Sanity UI")
    if (lib.importSources.length > 0) {
      types[`library:${lib.name}`] = {
        importedFrom: buildImportPattern(lib.importSources),
        outputDir: (cb) => `codebases/${cb}/${slug}`,
        outputFile: `${slug}-report.json`,
      };
    }

    // Wrapper-layer scan (e.g. "wrappers:Sanity UI")
    if (lib.wrapperSources && lib.wrapperSources.length > 0) {
      types[`wrappers:${lib.name}`] = {
        importedFrom: buildImportPattern(lib.wrapperSources),
        outputDir: (cb) => `codebases/${cb}/wrappers`,
        outputFile: "wrappers.json",
      };
    }
  }

  return types;
}

const SCAN_TYPES = buildScanTypes();
const SCAN_TYPE = process.env.SCAN_TYPE || "components";
const scanDef = SCAN_TYPES[SCAN_TYPE];

if (!scanDef) {
  const valid = Object.keys(SCAN_TYPES).join("\n  ");
  throw new Error(
    `Unknown SCAN_TYPE="${SCAN_TYPE}".\n\nAvailable scan types:\n  ${valid}\n\n` +
      "These are derived from component-analytics.config.js — add UI\n" +
      "libraries with importSources / wrapperSources to register more.",
  );
}

// ─── Config generation ────────────────────────────────────────────────────────

/**
 * Build a React Scanner config object for a single codebase.
 *
 * @param {string} codebase - Codebase name from the central config.
 * @returns {object} React Scanner config.
 */
function buildConfig(codebase) {
  const config = {
    _codebaseName: codebase,
    crawlFrom: CODEBASE_PATHS[codebase],
    includeSubComponents: true,
    exclude: DEFAULT_GLOB_IGNORE,
    processors: [
      [
        "count-components-and-props",
        {
          outputTo: path.resolve(
            __dirname,
            `../reports/${scanDef.outputDir(codebase)}/${scanDef.outputFile}`,
          ),
        },
      ],
    ],
  };

  // Apply the import filter when the scan type specifies one.
  if (scanDef.importedFrom) {
    config.importedFrom = scanDef.importedFrom;
  }
  // When importedFrom is null/undefined React Scanner captures all
  // components found under crawlFrom — the directory already scopes
  // results to the current codebase.

  return config;
}

const configs = CODEBASES.map(buildConfig);

// ─── Export ───────────────────────────────────────────────────────────────────

// When CODEBASE is set (single-codebase run), export that config.
// Otherwise export the first codebase as the default.
const selectedCodebase = process.env.CODEBASE;

module.exports = selectedCodebase
  ? configs.find((c) => c._codebaseName === selectedCodebase) || configs[0]
  : configs[0];

// Attach extras for scripts that need batch access.
module.exports.all = configs;
module.exports.CODEBASES = CODEBASES;
module.exports.SCAN_TYPE = SCAN_TYPE;
module.exports.SCAN_TYPES = SCAN_TYPES;
