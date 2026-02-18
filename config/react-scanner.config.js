const path = require("path");

const {
  CODEBASES,
  CODEBASE_PATHS,
  UI_IMPORT_SOURCES,
  UI_LIBRARY_NAME,
  DEFAULT_GLOB_IGNORE,
} = require("../scripts/lib/constants");

/**
 * Unified React Scanner configuration.
 *
 * This single file replaces the previous six config files. The scan
 * type is selected via the SCAN_TYPE environment variable:
 *
 *   SCAN_TYPE=components   All React components (no import filter)
 *   SCAN_TYPE=ui-library   Only the tracked UI library
 *   SCAN_TYPE=ui-wrappers  Only ui-components wrapper layer
 *   SCAN_TYPE=icons        Only icon imports
 *   SCAN_TYPE=all          Every component regardless of source
 *
 * The CODEBASE environment variable selects which codebase to scan.
 * Both are typically set by the npm scripts in package.json.
 *
 * Examples:
 *   SCAN_TYPE=components CODEBASE=sanity react-scanner -c config/react-scanner.config.js
 *   SCAN_TYPE=ui-library CODEBASE=canvas react-scanner -c config/react-scanner.config.js
 */

// ─── Scan type resolution ─────────────────────────────────────────────────────

const SCAN_TYPE = process.env.SCAN_TYPE || "components";

/**
 * Build a regex from the configured UI library import sources.
 * Returns a pattern that matches nothing if no sources are configured.
 */
function buildUIImportPattern() {
  if (UI_IMPORT_SOURCES.length === 0) return /(?!)/;
  return new RegExp(
    UI_IMPORT_SOURCES.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(
      "|",
    ),
  );
}

/** Filesystem-safe slug derived from the library name (e.g. "sanity-ui"). */
const libSlug = UI_LIBRARY_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/**
 * Map of scan type → { importedFrom, outputDir, outputFile }.
 *
 * `importedFrom` is the React Scanner filter regex.  When `null`, no
 * filter is applied (all components are captured).
 */
const SCAN_TYPES = {
  components: {
    importedFrom: null, // will be set per-codebase below
    outputDir: (cb) => `${cb}/components`,
    outputFile: "component-usage-report.json",
    useCodebaseFilter: true,
  },
  "ui-library": {
    importedFrom: buildUIImportPattern(),
    outputDir: (cb) => `${cb}/${libSlug}`,
    outputFile: `${libSlug}-report.json`,
    useCodebaseFilter: false,
  },
  "ui-wrappers": {
    importedFrom: /ui-components/,
    outputDir: (cb) => `${cb}/ui-components`,
    outputFile: "ui-components-report.json",
    useCodebaseFilter: false,
  },
  icons: {
    importedFrom: /@sanity\/icons/,
    outputDir: (cb) => `${cb}/icons`,
    outputFile: "icon-usage-report.json",
    useCodebaseFilter: false,
  },
  all: {
    importedFrom: null,
    outputDir: (cb) => `${cb}/all-components`,
    outputFile: "all-components-report.json",
    useCodebaseFilter: false,
  },
};

const scanDef = SCAN_TYPES[SCAN_TYPE];

if (!scanDef) {
  const valid = Object.keys(SCAN_TYPES).join(", ");
  throw new Error(`Unknown SCAN_TYPE="${SCAN_TYPE}".  Valid types: ${valid}`);
}

// ─── Config generation ────────────────────────────────────────────────────────

/**
 * Build a React Scanner config object for a single codebase + scan type.
 */
function buildConfig(codebase) {
  const config = {
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

  // Apply the import filter.  For `components` mode we scope to the
  // codebase name so React Scanner only captures components imported
  // from within that codebase.
  if (scanDef.useCodebaseFilter) {
    config.importedFrom = new RegExp(codebase);
  } else if (scanDef.importedFrom) {
    config.importedFrom = scanDef.importedFrom;
  }
  // When importedFrom is null/undefined React Scanner captures everything.

  return config;
}

const configs = CODEBASES.map(buildConfig);

// ─── Export ───────────────────────────────────────────────────────────────────

// When CODEBASE is set (single-codebase run), export that config.
// Otherwise export the first codebase as the default.
const selectedCodebase = process.env.CODEBASE;

module.exports = selectedCodebase
  ? configs.find(
      (c) => c.crawlFrom && c.crawlFrom.includes(selectedCodebase),
    ) || configs[0]
  : configs[0];

// Attach extras for scripts that need batch access.
module.exports.all = configs;
module.exports.CODEBASES = CODEBASES;
module.exports.SCAN_TYPE = SCAN_TYPE;
