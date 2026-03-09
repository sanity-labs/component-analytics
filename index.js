/**
 * @module component-analytics
 *
 * Public API for the component-analytics library.
 *
 * This entry point exposes the context factory and analysis functions
 * so that external code can use the library programmatically — without
 * a config file on disk and without any report generation side-effects.
 *
 * The library separates **data collection** (parsing, classifying,
 * aggregating) from **report generation** (formatting to CSV/MD/JSON
 * and writing to disk).  Everything exported here is the data
 * collection layer.  The CLI (`scripts/run.js`) is an implementation
 * on top of this layer that adds the report-writing step.
 *
 * @example
 * const { createContext, perComponent } = require("ui-component-analysis");
 *
 * // 1. Build a context from a plain object (no config file needed)
 * const ctx = createContext({
 *   codebases: [{ name: "my-app", path: "./src" }],
 *   uiLibraries: [{
 *     name: "My UI",
 *     importSources: ["@my-org/ui"],
 *     excludeSources: [],
 *     components: ["Button", "Card", "Text"],
 *   }],
 *   files: { pattern: "**\/*.tsx", ignore: ["**\/node_modules\/**"] },
 * });
 *
 * // 2. Analyze a single file (data collection only — no disk I/O)
 * const fs = require("fs");
 * const source = fs.readFileSync("src/MyPage.tsx", "utf8");
 * const result = perComponent.analyzeFileContent(source, ctx);
 * console.log(result.instances);
 *
 * // 3. Use pure utilities (no context needed)
 * const props = perComponent.parseProps('mode="ghost" tone="primary"');
 * const classified = perComponent.classifyValue("{color: 'red'}");
 */

// ─── Context factory ──────────────────────────────────────────────────────────

const {
  createContext,
  HTML_TAG_CATEGORIES,
  KNOWN_TAGS,
} = require("./scripts/lib/context");

// ─── Per-component analysis ───────────────────────────────────────────────────

const _perComponent = require("./scripts/per-component/analyze-per-component");

/**
 * Per-component analysis functions.
 *
 * **Pure utilities (no context needed):**
 * - `lineNumberAt(content, offset)` — 1-based line number for a character offset.
 * - `extractImports(content)` — extract ES import statements from file content.
 * - `parseNamedImports(str)` — parse `{ A, B as C }` into `[{ original, local }]`.
 * - `findTagEnd(content, startIdx)` — find the closing `>` of a JSX opening tag.
 * - `parseProps(tagBody)` — parse props from a JSX opening-tag body string.
 * - `classifyValue(raw)` — classify a raw prop value (boolean, number, string, array, object, etc.).
 * - `normalizeValue(classified)` — normalize a classified value for aggregation.
 * - `recordProp(report, propName, rawValue)` — record a prop occurrence into a report.
 * - `mergeFileResult(reports, fileResult, codebase, filePath)` — merge a file's analysis into reports.
 * - `extractSourceSnippet(content, startOffset, endOffset)` — extract and collapse a JSX tag's source.
 * - `buildComponentJson(report)` — build the final JSON structure for a component report.
 * - `generateSummaryJSON(reports)` — generate machine-readable summary JSON string.
 *
 * **Context-aware (pass `ctx` as the last argument):**
 * - `buildTrackedUIImportMap(content, ctx)` — build a map of tracked UI imports in a file.
 * - `analyzeFileContent(content, ctx)` — analyze a file and return every tracked component instance.
 * - `createEmptyReport(component, ctx)` — create an empty report skeleton for a component.
 * - `generateSummaryCSV(reports, ctx)` — generate a summary CSV string.
 * - `generateSummaryMarkdown(reports, ctx)` — generate a Markdown summary report.
 *
 * **Post-aggregation:**
 * - `applyAutoDetectedDefaults(reports)` — run automatic default-value detection across reports.
 */
const perComponent = {
  // Pure utilities (no context needed)
  lineNumberAt: _perComponent.lineNumberAt,
  extractImports: _perComponent.extractImports,
  parseNamedImports: _perComponent.parseNamedImports,
  findTagEnd: _perComponent.findTagEnd,
  parseProps: _perComponent.parseProps,
  classifyValue: _perComponent.classifyValue,
  normalizeValue: _perComponent.normalizeValue,
  recordProp: _perComponent.recordProp,
  mergeFileResult: _perComponent.mergeFileResult,
  extractSourceSnippet: _perComponent.extractSourceSnippet,
  buildComponentJson: _perComponent.buildComponentJson,
  generateSummaryJSON: _perComponent.generateSummaryJSON,

  // Context-aware (pass ctx as last argument)
  isTrackedUISource: _perComponent.isTrackedUISource,
  buildTrackedUIImportMap: _perComponent.buildTrackedUIImportMap,
  analyzeFileContent: _perComponent.analyzeFileContent,
  createEmptyReport: _perComponent.createEmptyReport,
  generateSummaryCSV: _perComponent.generateSummaryCSV,
  generateSummaryMarkdown: _perComponent.generateSummaryMarkdown,

  // Post-aggregation
  applyAutoDetectedDefaults: _perComponent.applyAutoDetectedDefaults,
};

// ─── Source classification ────────────────────────────────────────────────────

const _sources = require("./scripts/sources/analyze-ui-component-sources");

/**
 * UI component source classification functions.
 *
 * Classifies every JSX element as tracked UI library, internal code,
 * native HTML, or third-party UI.
 */
const sources = {
  parseNamedImports: _sources.parseNamedImports,
  categorizeImportSource: _sources.categorizeImportSource,
  extractImports: _sources.extractImports,
  countJSXInstances: _sources.countJSXInstances,
  buildImportMap: _sources.buildImportMap,
  analyzeContent: _sources.analyzeContent,
  analyzeFile: _sources.analyzeFile,
  aggregateResults: _sources.aggregateResults,
  countPropReferences: _sources.countPropReferences,
  generateMarkdown: _sources.generateMarkdown,
  generateCSV: _sources.generateCSV,
  generateJSON: _sources.generateJSON,
};

// ─── HTML tag analysis ────────────────────────────────────────────────────────

const _htmlTags = require("./scripts/html-tags/analyze-html-tags");

/**
 * Native HTML/SVG tag usage analysis functions.
 */
const htmlTags = {
  extractHTMLTags: _htmlTags.extractHTMLTags,
  extractHTMLTagInstances: _htmlTags.extractHTMLTagInstances,
  stripStringLiterals: _htmlTags.stripStringLiterals,
  matchFullTags: _htmlTags.matchFullTags,
  matchSimpleTags: _htmlTags.matchSimpleTags,
  lineNumberAt: _htmlTags.lineNumberAt,
  analyzeContent: _htmlTags.analyzeContent,
  aggregateResults: _htmlTags.aggregateResults,
  generateMarkdown: _htmlTags.generateMarkdown,
  generateCSV: _htmlTags.generateCSV,
  generateJSON: _htmlTags.generateJSON,
};

// ─── Customization analysis ───────────────────────────────────────────────────

const _customizations = require("./scripts/customizations/analyze-customizations");

/**
 * Inline style and styled() override analysis functions.
 */
const customizations = {
  extractInlineStyles: _customizations.extractInlineStyles,
  extractStyleFromProps: _customizations.extractStyleFromProps,
  extractMultiLineInlineStyles: _customizations.extractMultiLineInlineStyles,
  findTagEnd: _customizations.findTagEnd,
  extractStyledUsages: _customizations.extractStyledUsages,
  matchStyledTemplateLiterals: _customizations.matchStyledTemplateLiterals,
  matchStyledFunctionCalls: _customizations.matchStyledFunctionCalls,
  parseStyleProperties: _customizations.parseStyleProperties,
  parseStyledProperties: _customizations.parseStyledProperties,
  analyzeContent: _customizations.analyzeContent,
  aggregateResults: _customizations.aggregateResults,
  sortByCount: _customizations.sortByCount,
  generateMarkdown: _customizations.generateMarkdown,
  generateCSV: _customizations.generateCSV,
  generateJSON: _customizations.generateJSON,
};

// ─── Prop combinations ────────────────────────────────────────────────────────

const _propCombos = require("./scripts/prop-combos/analyze-prop-combos");

/**
 * Prop value combination cross-tabulation functions.
 */
const propCombos = {
  analyzeCodebaseForCombo: _propCombos.analyzeCodebaseForCombo,
  analyzeCombo: _propCombos.analyzeCombo,
  generateMarkdown: _propCombos.generateMarkdown,
  generateCSV: _propCombos.generateCSV,
  generateJSON: _propCombos.generateJSON,
  comboReportPath: _propCombos.comboReportPath,
  comboKey: _propCombos.comboKey,
  normalize: _propCombos.normalize,
  UNSET: _propCombos.UNSET,
};

// ─── Shared utilities ─────────────────────────────────────────────────────────

const utils = require("./scripts/lib/utils");

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Context factory — the main entry point for library consumers
  createContext,

  // Static data (not config-dependent)
  HTML_TAG_CATEGORIES,
  KNOWN_TAGS,

  // Analysis modules — data collection layer
  perComponent,
  sources,
  htmlTags,
  customizations,
  propCombos,

  // Shared utilities
  utils,
};
