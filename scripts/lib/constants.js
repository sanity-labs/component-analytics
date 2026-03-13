/**
 * @module lib/constants
 *
 * Shared constants used across all analysis scripts.
 *
 * Everything in this module is derived from the project-level
 * configuration file `component-analytics.config.js`.  Scripts should
 * import values from here rather than reading the config directly —
 * this keeps a single point of derivation and ensures every script
 * sees the same resolved values.
 *
 * Internally, this module loads the config file from disk and passes
 * it to {@link createContext} from `context.js`.  The context factory
 * does all the derivation work — this module simply re-exports the
 * results under the legacy constant names for backward compatibility.
 *
 * **Important:** Config loading is deferred until first access.  This
 * means `require("./constants")` succeeds even when no config file
 * exists on disk — the error only surfaces when a script actually
 * reads one of the exported values without passing an explicit context.
 * This allows library consumers to `require()` analysis modules (which
 * import this file at the top level) and use them with a programmatic
 * context, without needing a config file.
 */

const path = require("path");
const fs = require("fs");

const { createContext, HTML_TAG_CATEGORIES, KNOWN_TAGS } = require("./context");

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG LOADING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve the absolute path to the project-root config file.
 *
 * Walks up from `__dirname` (which is `scripts/lib/`) looking for
 * `component-analytics.config.js`.  Returns `null` if not found.
 *
 * When running inside Jest (detected via `JEST_WORKER_ID`), the test
 * config `component-analytics.config.test.js` is preferred if it
 * exists.  This ensures tests are deterministic regardless of the
 * user's real config.
 *
 * @returns {string | null}
 */
function findConfigPath() {
  const isTest = typeof process.env.JEST_WORKER_ID !== "undefined";
  let dir = path.resolve(__dirname, "../..");
  for (let i = 0; i < 5; i++) {
    // In test environments, prefer the test config
    if (isTest) {
      const testCandidate = path.join(
        dir,
        "component-analytics.config.test.js",
      );
      if (fs.existsSync(testCandidate)) return testCandidate;
    }
    const candidate = path.join(dir, "component-analytics.config.js");
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
 * When the config file is missing, an error is printed with
 * instructions for creating the config from the example file,
 * and the process exits.
 *
 * @returns {import("./config-schema").StudioAnalysisConfig}
 */
function loadConfig() {
  const configPath = findConfigPath();
  if (configPath) {
    return require(configPath);
  }

  const projectRoot = path.resolve(__dirname, "../..");
  const expected = path.join(projectRoot, "component-analytics.config.js");
  const example = path.join(
    projectRoot,
    "component-analytics.config.example.js",
  );

  const lines = ["", "❌ Configuration file not found:", `   ${expected}`, ""];

  if (fs.existsSync(example)) {
    lines.push(
      "   An example config exists. To get started, copy it:",
      "",
      "     cp component-analytics.config.example.js component-analytics.config.js",
    );
  } else {
    lines.push(
      "   Create a component-analytics.config.js in the project root.",
      "   See the README for configuration details.",
    );
  }

  lines.push(
    "",
    "   Then edit the file to define your codebases, UI libraries,",
    "   and tracked components before running the analysis again.",
    "",
  );

  const message = lines.join("\n");
  console.error(message);

  // Throw so the error is visible in both test and non-test contexts.
  // In a normal process this will also produce a non-zero exit code.
  throw new Error(
    `Configuration file not found: ${expected}\n` +
      "Copy component-analytics.config.example.js to component-analytics.config.js and edit it for your project.",
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAZY CONTEXT — deferred until first access
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @type {import("./context").AnalysisContext | null}
 * Populated on first access via {@link getContext}.
 */
let _ctx = null;

/**
 * @type {import("./config-schema").StudioAnalysisConfig | null}
 * Populated on first access via {@link getContext}.
 */
let _config = null;

/**
 * Lazily load the config file and build the context.
 *
 * The first call triggers `loadConfig()` + `createContext()`.
 * Subsequent calls return the cached context.  This deferral is what
 * allows `require("./constants")` to succeed even when no config file
 * exists — the error is only thrown when a CLI script (or a library
 * consumer who forgot to pass `ctx`) actually reads a value.
 *
 * @returns {import("./context").AnalysisContext}
 */
function getContext() {
  if (_ctx) return _ctx;

  _config = loadConfig();

  const projectRoot = findConfigPath()
    ? path.dirname(findConfigPath())
    : path.resolve(__dirname, "../..");

  _ctx = createContext(_config, { projectRoot });
  return _ctx;
}

/**
 * Return the raw config object (lazily loaded).
 *
 * @returns {import("./config-schema").StudioAnalysisConfig}
 */
function getConfig() {
  if (!_config) getContext();
  return _config;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAZY PROPERTY EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════
//
// Every property below is defined as a getter on the exports object so
// that the config file is only loaded when a script actually reads a
// value.  This is invisible to consumers — they use the same
// destructuring syntax they always have:
//
//   const { CODEBASES, TRACKED_COMPONENTS } = require("./constants");
//
// The getters fire on destructure, loading the config at that point.

const exp = (module.exports = {});

// Raw config access (for advanced use cases)
Object.defineProperty(exp, "CONFIG", { get: getConfig, enumerable: true });
exp.loadConfig = loadConfig;
exp.findConfigPath = findConfigPath;

// ── Codebases ────────────────────────────────────────────────────────────────

Object.defineProperty(exp, "CODEBASES", {
  get: () => getContext().codebases,
  enumerable: true,
});
Object.defineProperty(exp, "CODEBASE_PATHS", {
  get: () => getContext().codebasePaths,
  enumerable: true,
});

// ── UI libraries ─────────────────────────────────────────────────────────────

Object.defineProperty(exp, "ALL_UI_LIBRARIES", {
  get: () => getContext().allUILibraries,
  enumerable: true,
});
Object.defineProperty(exp, "PRIMARY_UI_LIBRARY", {
  get: () => getContext().primaryUILibrary,
  enumerable: true,
});
Object.defineProperty(exp, "UI_LIBRARY_NAME", {
  get: () => getContext().uiLibraryName,
  enumerable: true,
});
Object.defineProperty(exp, "UI_LIBRARY_NAMES", {
  get: () => getContext().uiLibraryNames,
  enumerable: true,
});
Object.defineProperty(exp, "TRACKED_COMPONENTS", {
  get: () => getContext().trackedComponents,
  enumerable: true,
});
Object.defineProperty(exp, "PROP_DEFAULTS", {
  get: () => getContext().propDefaults,
  enumerable: true,
});
Object.defineProperty(exp, "UI_IMPORT_SOURCES", {
  get: () => getContext().uiImportSources,
  enumerable: true,
});
Object.defineProperty(exp, "UI_EXCLUDE_SOURCES", {
  get: () => getContext().uiExcludeSources,
  enumerable: true,
});
Object.defineProperty(exp, "LIBRARY_COMPONENT_MAP", {
  get: () => getContext().libraryComponentMap,
  enumerable: true,
});

// ── UI library functions ─────────────────────────────────────────────────────
//
// These are defined as getters that return functions.  When destructured
// at the top of a script (`const { isTrackedUISource } = require(…)`)
// the getter fires immediately and returns the context's closure.  This
// is equivalent to the old direct-export approach but deferred.

Object.defineProperty(exp, "isTrackedUISource", {
  get: () => getContext().isTrackedUISource,
  enumerable: true,
});
Object.defineProperty(exp, "identifyLibrary", {
  get: () => getContext().identifyLibrary,
  enumerable: true,
});
Object.defineProperty(exp, "identifyComponentLibrary", {
  get: () => getContext().identifyComponentLibrary,
  enumerable: true,
});

// ── Other UI classification ──────────────────────────────────────────────────

Object.defineProperty(exp, "OTHER_UI_PATTERNS", {
  get: () => getContext().otherUIPatterns,
  enumerable: true,
});
Object.defineProperty(exp, "isOtherUISource", {
  get: () => getContext().isOtherUISource,
  enumerable: true,
});

// ── Prop combinations ────────────────────────────────────────────────────────

Object.defineProperty(exp, "PROP_COMBOS", {
  get: () => getContext().propCombos,
  enumerable: true,
});

// ── File scanning ────────────────────────────────────────────────────────────

Object.defineProperty(exp, "FILE_PATTERN", {
  get: () => getContext().filePattern,
  enumerable: true,
});
Object.defineProperty(exp, "DEFAULT_GLOB_IGNORE", {
  get: () => getContext().defaultGlobIgnore,
  enumerable: true,
});

// ── HTML tags (static — not config-dependent, no lazy loading needed) ────────

exp.HTML_TAG_CATEGORIES = HTML_TAG_CATEGORIES;
exp.KNOWN_TAGS = KNOWN_TAGS;
