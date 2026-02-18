/**
 * @module lib/constants
 *
 * Shared constants used across all analysis scripts.
 *
 * Everything in this module is derived from the project-level
 * configuration file `studio-analysis.config.js`.  Scripts should
 * import values from here rather than reading the config directly —
 * this keeps a single point of derivation and ensures every script
 * sees the same resolved values.
 *
 * The module is UI-library-agnostic — the tracked library, its
 * components, and import patterns are all driven by the config file.
 *
 * If the config file cannot be found, the module falls back to
 * sensible defaults so that tests (which don't have a config file
 * on disk) continue to work.
 */

const path = require("path");
const fs = require("fs");

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG LOADING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve the absolute path to the project-root config file.
 *
 * Walks up from `__dirname` (which is `scripts/lib/`) looking for
 * `studio-analysis.config.js`.  Returns `null` if not found.
 *
 * @returns {string | null}
 */
function findConfigPath() {
  let dir = path.resolve(__dirname, "../..");
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, "studio-analysis.config.js");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Load and return the user configuration object.
 *
 * Returns a minimal default config if the file doesn't exist (e.g.
 * during unit tests).
 *
 * @returns {import("./config-schema").StudioAnalysisConfig}
 */
function loadConfig() {
  const configPath = findConfigPath();
  if (configPath) {
    return require(configPath);
  }

  // Fallback for environments where the config file is absent (tests, CI)
  return {
    codebases: [
      { name: "sanity", path: "./codebases/sanity" },
      { name: "canvas", path: "./codebases/canvas" },
      { name: "huey", path: "./codebases/huey" },
    ],
    uiLibraries: [
      {
        name: "Sanity UI",
        importSources: ["@sanity/ui"],
        excludeSources: ["@sanity/ui/theme"],
        components: [],
        propDefaults: {},
      },
    ],
    files: {
      pattern: "**/*.{tsx,jsx}",
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/*.test.*",
        "**/*.spec.*",
        "**/__tests__/**",
        "**/*.stories.*",
      ],
    },
    otherUIPatterns: [
      "@radix-ui",
      "styled-components",
      "motion/react",
      "framer-motion",
    ],
  };
}

/** @type {import("./config-schema").StudioAnalysisConfig} */
const CONFIG = loadConfig();

// ═══════════════════════════════════════════════════════════════════════════════
// DERIVED: CODEBASES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Codebase directory names.
 *
 * Every analysis script iterates this list.  Derived from
 * `config.codebases[].name`.
 *
 * @type {string[]}
 */
const CODEBASES = CONFIG.codebases.map((cb) => cb.name);

/**
 * Map of codebase name → absolute directory path.
 *
 * Used by `lib/files.js` to resolve codebase directories.  Paths in
 * the config are relative to the project root (where
 * `studio-analysis.config.js` lives).
 *
 * @type {Object<string, string>}
 */
const CODEBASE_PATHS = {};
const projectRoot = findConfigPath()
  ? path.dirname(findConfigPath())
  : path.resolve(__dirname, "../..");

for (const cb of CONFIG.codebases) {
  CODEBASE_PATHS[cb.name] = path.resolve(projectRoot, cb.path);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DERIVED: UI LIBRARY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * All configured UI library entries.
 *
 * Scripts that need to iterate over every tracked library (e.g. the
 * per-component analyser) should use this array.
 *
 * @type {import("./config-schema").UILibrary[]}
 */
const ALL_UI_LIBRARIES = (CONFIG.uiLibraries || []).map((lib) => ({
  name: lib.name || "UI Library",
  importSources: lib.importSources || [],
  excludeSources: lib.excludeSources || [],
  components: lib.components || [],
  propDefaults: lib.propDefaults || {},
}));

/**
 * The primary UI library configuration (first entry).
 *
 * Most report labels and summary statistics use this as the "main"
 * tracked library.  Individual scripts may iterate over
 * {@link ALL_UI_LIBRARIES} to cover all entries.
 *
 * @type {import("./config-schema").UILibrary}
 */
const PRIMARY_UI_LIBRARY = ALL_UI_LIBRARIES[0] || {
  name: "UI Library",
  importSources: [],
  excludeSources: [],
  components: [],
  propDefaults: {},
};

/**
 * Human-readable name of the primary tracked UI library.
 *
 * @type {string}
 */
const UI_LIBRARY_NAME = PRIMARY_UI_LIBRARY.name;

/**
 * Canonical list of component names merged from ALL configured UI
 * libraries.
 *
 * Used by the customisation analyser to detect `style={}` props and
 * `styled()` wrappers, and by the per-component analyser to classify
 * imports.
 *
 * @type {string[]}
 */
const TRACKED_COMPONENTS = [
  ...new Set(ALL_UI_LIBRARIES.flatMap((lib) => lib.components)),
];

/**
 * @deprecated Use {@link TRACKED_COMPONENTS} instead.  This alias
 * exists solely for backward compatibility with scripts and tests
 * that were written when the tool was Sanity-UI-specific.
 */
const SANITY_UI_COMPONENTS = TRACKED_COMPONENTS;

/**
 * Known default prop values for the tracked UI library's components.
 *
 * This is now an empty object by default.  Prop defaults are detected
 * automatically from usage data by the `detect-prop-defaults.js` script
 * and applied at analysis time by `analyze-per-component.js`.
 *
 * If the config file still contains a `propDefaults` key (for backward
 * compatibility), those values will be used.  Otherwise the object is
 * empty and the per-component analyser relies entirely on auto-detection.
 *
 * @type {Object<string, Object<string, string>>}
 */
const PROP_DEFAULTS = PRIMARY_UI_LIBRARY.propDefaults || {};

/**
 * Import-source substrings that identify any tracked UI library,
 * merged from ALL configured libraries.
 *
 * An import like `import { Button } from '@sanity/ui'` matches if
 * the source string contains any of these substrings.
 *
 * @type {string[]}
 */
const UI_IMPORT_SOURCES = [
  ...new Set(ALL_UI_LIBRARIES.flatMap((lib) => lib.importSources)),
];

/**
 * Import-source substrings to exclude from UI-library matching,
 * merged from ALL configured libraries.
 *
 * Even if a source matches `UI_IMPORT_SOURCES`, it is excluded if it
 * also matches any of these substrings.  For example,
 * `@sanity/ui/theme` is excluded so that theme-only imports aren't
 * counted as component usage.
 *
 * @type {string[]}
 */
const UI_EXCLUDE_SOURCES = [
  ...new Set(ALL_UI_LIBRARIES.flatMap((lib) => lib.excludeSources)),
];

/**
 * Test whether an import source path belongs to ANY tracked UI library.
 *
 * Returns `true` if the source matches any `UI_IMPORT_SOURCES` entry
 * AND does not match any `UI_EXCLUDE_SOURCES` entry.
 *
 * This function replaces the many duplicated `isSanityUISource()`
 * functions that were previously hardcoded in individual scripts.
 *
 * @param {string} source - The import path (e.g. `"@sanity/ui"`).
 * @returns {boolean}
 */
function isTrackedUISource(source) {
  const matches = UI_IMPORT_SOURCES.some((s) => source.includes(s));
  if (!matches) return false;
  const excluded = UI_EXCLUDE_SOURCES.some((s) => source.includes(s));
  return !excluded;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DERIVED: OTHER UI PATTERNS (for the sources report)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Import-source substrings that identify third-party UI libraries
 * (neither the tracked library nor internal code).
 *
 * Used by the sources report to classify imports into the "other UI"
 * category.
 *
 * @type {string[]}
 */
const OTHER_UI_PATTERNS = CONFIG.otherUIPatterns || [];

/**
 * Test whether an import source path belongs to a third-party UI
 * library (not the tracked one, not internal).
 *
 * @param {string} source - The import path.
 * @returns {boolean}
 */
function isOtherUISource(source) {
  return OTHER_UI_PATTERNS.some((p) => source.includes(p));
}

// ═══════════════════════════════════════════════════════════════════════════════
// DERIVED: FILE SCANNING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Glob pattern for component files.
 *
 * @type {string}
 */
const FILE_PATTERN = (CONFIG.files && CONFIG.files.pattern) || "**/*.{tsx,jsx}";

/**
 * Glob ignore patterns shared by every analyser when scanning codebases.
 *
 * @type {string[]}
 */
const DEFAULT_GLOB_IGNORE = (CONFIG.files && CONFIG.files.ignore) || [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
  "**/*.stories.*",
];

// ═══════════════════════════════════════════════════════════════════════════════
// HTML TAG CATEGORIES (independent of UI library config)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Standard HTML tags grouped by semantic category.
 *
 * The HTML-tag analyser uses this to classify each tag it encounters.
 * Categories are intentionally broad so the report stays readable.
 *
 * @type {Object<string, string[]>}
 */
const HTML_TAG_CATEGORIES = {
  layout: [
    "article",
    "aside",
    "details",
    "dialog",
    "div",
    "figcaption",
    "figure",
    "footer",
    "header",
    "main",
    "nav",
    "section",
    "slot",
    "span",
    "summary",
    "template",
  ],

  text: [
    "abbr",
    "b",
    "bdi",
    "bdo",
    "blockquote",
    "br",
    "cite",
    "code",
    "data",
    "del",
    "dfn",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "ins",
    "kbd",
    "mark",
    "p",
    "pre",
    "q",
    "rp",
    "rt",
    "ruby",
    "s",
    "samp",
    "small",
    "strong",
    "sub",
    "sup",
    "time",
    "u",
    "var",
    "wbr",
  ],

  form: [
    "button",
    "datalist",
    "fieldset",
    "form",
    "input",
    "label",
    "legend",
    "meter",
    "optgroup",
    "option",
    "output",
    "progress",
    "select",
    "textarea",
  ],

  list: ["dd", "dl", "dt", "li", "menu", "ol", "ul"],

  table: [
    "caption",
    "col",
    "colgroup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
  ],

  media: [
    "animate",
    "animateTransform",
    "audio",
    "canvas",
    "circle",
    "clipPath",
    "defs",
    "desc",
    "ellipse",
    "feBlend",
    "feComposite",
    "feFlood",
    "feGaussianBlur",
    "feMerge",
    "feMergeNode",
    "feOffset",
    "filter",
    "foreignObject",
    "g",
    "image",
    "img",
    "line",
    "linearGradient",
    "marker",
    "mask",
    "metadata",
    "path",
    "pattern",
    "picture",
    "polygon",
    "polyline",
    "radialGradient",
    "rect",
    "set",
    "source",
    "stop",
    "svg",
    "symbol",
    "text",
    "title",
    "track",
    "tspan",
    "use",
    "video",
  ],

  link: ["a", "area", "link", "map"],

  embed: ["embed", "iframe", "object", "param", "portal"],

  scripting: ["noscript", "script"],

  semantic: ["address", "hgroup", "search"],

  document: ["html", "head", "body", "base", "meta", "style"],
};

/**
 * Flat set of every known HTML and SVG tag name, built from
 * {@link HTML_TAG_CATEGORIES}.
 *
 * Used as an allowlist — any tag the regex extracts that isn't in this
 * set is discarded as a false positive (e.g. TypeScript type keywords
 * like `string`, `boolean`, `typeof`, or library-specific JSX elements
 * like `motion`).
 *
 * @type {Set<string>}
 */
const KNOWN_TAGS = new Set(Object.values(HTML_TAG_CATEGORIES).flat());

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Raw config access (for advanced use cases)
  CONFIG,
  loadConfig,
  findConfigPath,

  // Codebases
  CODEBASES,
  CODEBASE_PATHS,

  // UI libraries
  ALL_UI_LIBRARIES,
  PRIMARY_UI_LIBRARY,
  UI_LIBRARY_NAME,
  TRACKED_COMPONENTS,
  SANITY_UI_COMPONENTS, // backward-compat alias for TRACKED_COMPONENTS
  PROP_DEFAULTS,
  UI_IMPORT_SOURCES,
  UI_EXCLUDE_SOURCES,
  isTrackedUISource,

  // Other UI classification
  OTHER_UI_PATTERNS,
  isOtherUISource,

  // File scanning
  FILE_PATTERN,
  DEFAULT_GLOB_IGNORE,

  // HTML tags (independent of UI library)
  HTML_TAG_CATEGORIES,
  KNOWN_TAGS,
};
