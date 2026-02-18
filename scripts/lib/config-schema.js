/**
 * @module lib/config-schema
 *
 * JSDoc type definitions for the studio-analysis configuration file.
 *
 * These types are not enforced at runtime — they exist solely to
 * provide IntelliSense and documentation for `studio-analysis.config.js`.
 */

/**
 * @typedef {object} CodebaseEntry
 * @property {string} name - Display name used in report headers and filenames.
 * @property {string} path - Directory path relative to the project root.
 */

/**
 * @typedef {object} UILibrary
 * @property {string}   name           - Human-readable library name (e.g. "Sanity UI").
 * @property {string[]} importSources  - Package names that identify this library
 *   in import statements.  Matched as substrings against the import path, so
 *   `"@sanity/ui"` matches `import { Button } from '@sanity/ui'`.
 * @property {string[]} excludeSources - Import paths to ignore even if they
 *   match an `importSource`.  For example, `"@sanity/ui/theme"` excludes
 *   theme-only imports from being counted as component usage.
 * @property {string[]} components     - PascalCase component export names to
 *   track (e.g. `"Button"`, `"Card"`, `"Flex"`).
 *
 * Note: Prop defaults are detected automatically from usage data by
 * `detect-prop-defaults.js` and applied at analysis time by
 * `analyze-per-component.js`.  No manual configuration is needed.
 */

/**
 * @typedef {object} FileConfig
 * @property {string}   pattern - Glob pattern for component files
 *   (e.g. `"**\/*.{tsx,jsx}"`).
 * @property {string[]} ignore  - Glob patterns to exclude from scanning
 *   (applied in every codebase).
 */

/**
 * @typedef {object} StudioAnalysisConfig
 * @property {CodebaseEntry[]} codebases      - Codebases to analyse.
 * @property {UILibrary[]}     uiLibraries    - UI component libraries to measure.
 * @property {FileConfig}      files          - File-scanning settings.
 * @property {string[]}        otherUIPatterns - Import-source substrings that
 *   identify third-party UI libraries (for the sources report's "other UI"
 *   category).  These are libraries that are neither the tracked library nor
 *   internal/relative code.
 */

module.exports = {};
