/**
 * @module lib/files
 *
 * Shared file-system helpers used by every analysis script.
 *
 * Centralises the glob configuration, safe file reading, and the
 * three-format report-writing pattern so that each analyser can focus
 * on its own domain logic.
 */

const fs = require("fs");
const path = require("path");
const { glob } = require("glob");

const {
  DEFAULT_GLOB_IGNORE,
  CODEBASE_PATHS,
  FILE_PATTERN,
} = require("./constants");

// ─── Finding files ────────────────────────────────────────────────────────────

/**
 * Resolve the absolute path to a codebase directory.
 *
 * Looks up the path in `CODEBASE_PATHS` (derived from the project
 * config file).  Falls back to `codebases/<name>` relative to the
 * project root if no config entry exists.
 *
 * @param {string} codebase - Codebase name (as defined in the config).
 * @returns {string} Absolute path.
 */
function codebasePath(codebase) {
  if (CODEBASE_PATHS[codebase]) {
    return CODEBASE_PATHS[codebase];
  }
  // Fallback for codebases not in the config
  return path.resolve(__dirname, `../../codebases/${codebase}`);
}

/**
 * Check whether a codebase directory exists on disk.
 *
 * @param {string} codebase - Directory name under `codebases/`.
 * @returns {boolean}
 */
function codebaseExists(codebase) {
  return fs.existsSync(codebasePath(codebase));
}

/**
 * Find all component files (`.tsx` / `.jsx`) in a codebase, applying
 * the standard ignore list.
 *
 * Returns absolute paths so callers can read files without further
 * path manipulation.
 *
 * @param {string} codebase - Directory name under `codebases/`.
 * @param {object}  [options]
 * @param {string}  [options.pattern="**\/*.{tsx,jsx}"] - Glob pattern.
 * @param {string[]} [options.ignore] - Extra ignore patterns (merged
 *   with {@link DEFAULT_GLOB_IGNORE}).
 * @returns {Promise<string[]>} Absolute file paths.
 */
async function findFiles(codebase, options = {}) {
  const { pattern = FILE_PATTERN, ignore = [] } = options;

  const cwd = codebasePath(codebase);
  return glob(pattern, {
    cwd,
    ignore: [...DEFAULT_GLOB_IGNORE, ...ignore],
    absolute: true,
  });
}

// ─── Reading files ────────────────────────────────────────────────────────────

/**
 * Read a file as UTF-8 text, returning `null` on any error.
 *
 * This is intentionally lenient — analysis scripts should skip
 * unreadable files rather than abort the whole run.
 *
 * @param {string} filePath - Absolute path to the file.
 * @returns {string | null} File content, or `null` on failure.
 */
function readSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

// ─── Writing reports ──────────────────────────────────────────────────────────

/**
 * Ensure a directory exists, creating it (and parents) if necessary.
 *
 * @param {string} dirPath - Absolute or relative directory path.
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Resolve a report output directory under `reports/`.
 *
 * @param {string} subdir - Subdirectory name, e.g. `"html-tags"`.
 * @returns {string} Absolute path.
 */
function reportDir(subdir) {
  return path.resolve(__dirname, `../../reports/${subdir}`);
}

/**
 * @typedef {object} ReportBundle
 * @property {string} text - Markdown report content.
 * @property {string} csv  - CSV report content.
 * @property {string} json - JSON report content.
 */

/**
 * Write a markdown / CSV / JSON triple to a report directory.
 *
 * Creates the directory if it does not already exist.  File names are
 * derived from `baseName`:
 *
 * - `<baseName>.md`
 * - `<baseName>.csv`
 * - `<baseName>.json`
 *
 * @param {string}       subdir   - Subdirectory under `reports/`.
 * @param {string}       baseName - Stem used for the three file names.
 * @param {ReportBundle} reports  - The three report strings.
 * @returns {{ mdPath: string, csvPath: string, jsonPath: string }}
 *   Absolute paths of the written files.
 */
function writeReports(subdir, baseName, reports) {
  const dir = reportDir(subdir);
  ensureDir(dir);

  const mdPath = path.join(dir, `${baseName}.md`);
  const csvPath = path.join(dir, `${baseName}.csv`);
  const jsonPath = path.join(dir, `${baseName}.json`);

  fs.writeFileSync(mdPath, reports.text);
  fs.writeFileSync(csvPath, reports.csv);
  fs.writeFileSync(jsonPath, reports.json);

  return { mdPath, csvPath, jsonPath };
}

module.exports = {
  codebasePath,
  codebaseExists,
  findFiles,
  readSafe,
  ensureDir,
  reportDir,
  writeReports,
};
