/**
 * @module lib/context
 *
 * Config-to-context factory.
 *
 * Converts a raw configuration object (the same shape as
 * `component-analytics.config.js`) into a frozen context object that
 * holds every derived value the analysis scripts need.
 *
 * **Why this exists:**
 *
 * Previously, every derived value (CODEBASES, TRACKED_COMPONENTS,
 * isTrackedUISource, etc.) was computed at module-load time inside
 * `constants.js` and stored in module-scoped variables.  This made it
 * impossible to use the analysis functions from external code without
 * having a `component-analytics.config.js` file on disk.
 *
 * `createContext(config)` decouples the derivation from the file
 * system.  The CLI path (`constants.js`) still loads the config file
 * and calls `createContext` internally, but library consumers can
 * call it directly with a plain object — no file needed.
 *
 * @example
 * // Library usage (no config file on disk)
 * const { createContext } = require("./scripts/lib/context");
 *
 * const ctx = createContext({
 *   codebases: [{ name: "my-app", path: "./src" }],
 *   uiLibraries: [{
 *     name: "My UI",
 *     importSources: ["@my-org/ui"],
 *     excludeSources: [],
 *     components: ["Button", "Card"],
 *   }],
 *   files: { pattern: "**\/*.tsx", ignore: ["**\/node_modules\/**"] },
 * });
 *
 * ctx.trackedComponents;               // ["Button", "Card"]
 * ctx.isTrackedUISource("@my-org/ui"); // true
 */

const path = require("path");

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT TYPEDEF
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} NormalizedUILibrary
 * @property {string}   name           - Human-readable library name.
 * @property {string[]} importSources  - Package-name substrings for matching imports.
 * @property {string[]} excludeSources - Import paths to exclude even if they match.
 * @property {string[]} components     - PascalCase component names to track.
 * @property {Object<string, Object<string, string>>} propDefaults - Known prop defaults.
 * @property {string[]} wrapperSources - Import-path substrings for the wrapper layer.
 */

/**
 * @typedef {object} AnalysisContext
 *
 * Frozen object holding every value derived from a configuration.
 * Analysis functions accept an optional context parameter; the CLI
 * path provides one built from the config file on disk, while library
 * consumers build their own via {@link createContext}.
 *
 * @property {string[]}              codebases              - Codebase display names.
 * @property {Object<string,string>} codebasePaths          - name → absolute directory path.
 * @property {NormalizedUILibrary[]} allUILibraries         - Normalized library entries.
 * @property {NormalizedUILibrary}   primaryUILibrary       - First library entry (or empty default).
 * @property {string}                uiLibraryName          - Primary library's display name.
 * @property {string}                uiLibraryNames         - All library names joined with " & ".
 * @property {string[]}              trackedComponents      - De-duped component names across all libraries.
 * @property {Object<string, Object<string, string>>} propDefaults - Primary library's prop defaults.
 * @property {string[]}              uiImportSources        - Merged import-source substrings.
 * @property {string[]}              uiExcludeSources       - Merged exclude-source substrings.
 * @property {Map<string, Set<string>>} libraryComponentMap - library name → Set of component names.
 * @property {string[]}              otherUIPatterns        - Third-party UI import substrings.
 * @property {Array<{component:string, props:string[]}>} propCombos - Prop combination entries.
 * @property {string}                filePattern            - Glob pattern for component files.
 * @property {string[]}              defaultGlobIgnore      - Glob patterns to exclude.
 * @property {Object<string, string[]>} htmlTagCategories   - Tag categories (static, config-independent).
 * @property {Set<string>}           knownTags              - Flat set of every known HTML/SVG tag.
 *
 * @property {(source: string) => boolean}      isTrackedUISource        - Test if an import is from a tracked library.
 * @property {(source: string) => string|null}  identifyLibrary          - Return which library an import belongs to.
 * @property {(component: string) => string|null} identifyComponentLibrary - Return which library a component belongs to.
 * @property {(source: string) => boolean}      isOtherUISource          - Test if an import is from a third-party UI lib.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// HTML TAG CATEGORIES (static — independent of user config)
// ═══════════════════════════════════════════════════════════════════════════════

/** @type {Object<string, string[]>} */
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

/** @type {Set<string>} */
const KNOWN_TAGS = new Set(Object.values(HTML_TAG_CATEGORIES).flat());

// ═══════════════════════════════════════════════════════════════════════════════
// EMPTY UI LIBRARY (used when no libraries are configured)
// ═══════════════════════════════════════════════════════════════════════════════

/** @type {NormalizedUILibrary} */
const EMPTY_LIBRARY = Object.freeze({
  name: "UI Library",
  importSources: [],
  excludeSources: [],
  components: [],
  propDefaults: {},
  wrapperSources: [],
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build codebase name → absolute path map.
 *
 * When `projectRoot` is provided, relative paths in the config are
 * resolved against it.  When omitted (library usage), paths are
 * returned as-is.
 *
 * @param {import("./config-schema").CodebaseEntry[]} codebases
 * @param {string} [projectRoot]
 * @returns {Object<string, string>}
 */
function buildCodebasePaths(codebases, projectRoot) {
  /** @type {Object<string, string>} */
  const map = {};
  for (const cb of codebases) {
    map[cb.name] = projectRoot
      ? path.resolve(projectRoot, cb.path)
      : cb.path;
  }
  return map;
}

/**
 * Normalize a raw UI library config entry into a consistent shape.
 *
 * @param {object} lib - Raw library entry from the config.
 * @returns {NormalizedUILibrary}
 */
function normalizeLibrary(lib) {
  return {
    name: lib.name || "UI Library",
    importSources: lib.importSources || [],
    excludeSources: lib.excludeSources || [],
    components: lib.components || [],
    propDefaults: lib.propDefaults || {},
    wrapperSources: lib.wrapperSources || [],
  };
}

/**
 * Create an analysis context from a raw configuration object.
 *
 * The returned context is frozen — its properties cannot be reassigned.
 * Functions on the context (like `isTrackedUISource`) close over the
 * context's own data, so each context is fully self-contained.
 *
 * @param {import("./config-schema").StudioAnalysisConfig} config
 *   The raw configuration object — same shape as the file.
 * @param {object} [options]
 * @param {string} [options.projectRoot] - Absolute path to the project
 *   root.  When provided, codebase paths in the config are resolved
 *   relative to this directory.  When omitted, paths are kept as-is.
 * @returns {AnalysisContext}
 */
function createContext(config, options = {}) {
  const { projectRoot } = options;

  // ── Codebases ─────────────────────────────────────────────────────────
  const codebases = (config.codebases || []).map((cb) => cb.name);
  const codebasePaths = buildCodebasePaths(config.codebases || [], projectRoot);

  // ── UI Libraries ──────────────────────────────────────────────────────
  const allUILibraries = (config.uiLibraries || []).map(normalizeLibrary);

  const primaryUILibrary = allUILibraries[0] || EMPTY_LIBRARY;

  const uiLibraryName = primaryUILibrary.name;

  const uiLibraryNames =
    allUILibraries.length <= 1
      ? uiLibraryName
      : allUILibraries.map((lib) => lib.name).join(" & ");

  const trackedComponents = [
    ...new Set(allUILibraries.flatMap((lib) => lib.components)),
  ];

  const propDefaults = primaryUILibrary.propDefaults || {};

  const uiImportSources = [
    ...new Set(allUILibraries.flatMap((lib) => lib.importSources)),
  ];

  const uiExcludeSources = [
    ...new Set(allUILibraries.flatMap((lib) => lib.excludeSources)),
  ];

  /** @type {Map<string, Set<string>>} */
  const libraryComponentMap = new Map();
  for (const lib of allUILibraries) {
    libraryComponentMap.set(lib.name, new Set(lib.components));
  }

  // ── Functions (closures over this context's data) ─────────────────────

  /**
   * Test whether an import source path belongs to ANY tracked UI library.
   *
   * @param {string} source - The import path (e.g. `"@my-org/ui"`).
   * @returns {boolean}
   */
  function isTrackedUISource(source) {
    const matches = uiImportSources.some((s) => source.includes(s));
    if (!matches) return false;
    const excluded = uiExcludeSources.some((s) => source.includes(s));
    return !excluded;
  }

  /**
   * Identify which specific tracked UI library an import source belongs to.
   *
   * @param {string} source - The import path (e.g. `"@sanity/ui"`).
   * @returns {string | null} The library name, or `null`.
   */
  function identifyLibrary(source) {
    for (const lib of allUILibraries) {
      const excluded = lib.excludeSources.some((s) => source.includes(s));
      if (excluded) continue;
      const matches = lib.importSources.some((s) => source.includes(s));
      if (matches) return lib.name;
    }
    return null;
  }

  /**
   * Identify which tracked UI library a component name belongs to.
   *
   * @param {string} componentName - PascalCase component name (e.g. `"Button"`).
   * @returns {string | null} The library name, or `null`.
   */
  function identifyComponentLibrary(componentName) {
    for (const [libName, comps] of libraryComponentMap) {
      if (comps.has(componentName)) return libName;
    }
    return null;
  }

  // ── Other UI classification ───────────────────────────────────────────
  const otherUIPatterns = config.otherUIPatterns || [];

  /**
   * Test whether an import source path belongs to a third-party UI
   * library (not the tracked one, not internal).
   *
   * @param {string} source - The import path.
   * @returns {boolean}
   */
  function isOtherUISource(source) {
    return otherUIPatterns.some((p) => source.includes(p));
  }

  // ── Prop combinations ─────────────────────────────────────────────────
  const propCombos = (config.propCombos || []).map((entry) => ({
    component: entry.component,
    props: entry.props || [],
  }));

  // ── File scanning ─────────────────────────────────────────────────────
  const filePattern =
    (config.files && config.files.pattern) || "**/*.{tsx,jsx}";

  const defaultGlobIgnore = (config.files && config.files.ignore) || [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/*.test.*",
    "**/*.spec.*",
    "**/__tests__/**",
    "**/*.stories.*",
  ];

  // ── Assemble & freeze ─────────────────────────────────────────────────
  return Object.freeze({
    // Codebases
    codebases,
    codebasePaths,

    // UI libraries
    allUILibraries,
    primaryUILibrary,
    uiLibraryName,
    uiLibraryNames,
    trackedComponents,
    propDefaults,
    uiImportSources,
    uiExcludeSources,
    libraryComponentMap,

    // UI library functions
    isTrackedUISource,
    identifyLibrary,
    identifyComponentLibrary,

    // Other UI classification
    otherUIPatterns,
    isOtherUISource,

    // Prop combinations
    propCombos,

    // File scanning
    filePattern,
    defaultGlobIgnore,

    // HTML tags (static — not derived from config)
    htmlTagCategories: HTML_TAG_CATEGORIES,
    knownTags: KNOWN_TAGS,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  createContext,

  // Exported for direct access when no context is needed
  HTML_TAG_CATEGORIES,
  KNOWN_TAGS,
};
