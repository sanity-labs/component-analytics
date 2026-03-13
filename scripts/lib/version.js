/**
 * @module lib/version
 *
 * Resolves the declared version of a package for a given source file.
 *
 * When analysing component usage, each instance reference needs to know
 * which version of the UI library it came from.  Since `node_modules`
 * may not be present in the codebases being analysed, this module
 * resolves versions from the **declared** dependency in the nearest
 * `package.json` up the directory tree.
 *
 * Handles common non-standard version formats:
 *   - pnpm catalogs (`"catalog:"`)
 *   - npm aliases (`"npm:@sanity/ui@4.0.0-static.43"`)
 *   - workspace protocol (`"workspace:^1.0.0"`)
 *   - standard semver ranges (`"^3.1.11"`, `"~2.0.0"`)
 *   - exact versions (`"4.0.0-static.46"`)
 */

const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════════════════════════════════
// CACHES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cache of parsed package.json contents keyed by absolute path.
 * Avoids re-reading the same file for every source file in a workspace.
 * @type {Map<string, object | null>}
 */
const _pkgJsonCache = new Map();

/**
 * Cache of parsed pnpm catalog data keyed by pnpm-workspace.yaml path.
 * @type {Map<string, Object<string, string>>}
 */
const _catalogCache = new Map();

/**
 * Cache of resolved versions keyed by `dir:packageName`.
 * Many files in the same directory share the same resolution.
 * @type {Map<string, string | null>}
 */
const _resolvedCache = new Map();

/**
 * Clear all internal caches.  Useful in tests or when analysing
 * multiple projects in the same process.
 */
function clearCaches() {
  _pkgJsonCache.clear();
  _catalogCache.clear();
  _resolvedCache.clear();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PACKAGE.JSON READING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Read and parse a package.json file, returning the parsed object or
 * `null` on any error.  Results are cached.
 *
 * @param {string} pkgJsonPath - Absolute path to a package.json file.
 * @returns {object | null}
 */
function readPackageJson(pkgJsonPath) {
  if (_pkgJsonCache.has(pkgJsonPath)) return _pkgJsonCache.get(pkgJsonPath);

  let result = null;
  try {
    if (fs.existsSync(pkgJsonPath)) {
      result = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    }
  } catch {
    // Malformed JSON or unreadable — treat as absent
  }

  _pkgJsonCache.set(pkgJsonPath, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PNPM CATALOG RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse the `catalog:` section from a pnpm-workspace.yaml file.
 *
 * This is a minimal YAML parser that handles the common flat format:
 *
 *   ```yaml
 *   catalog:
 *     '@sanity/ui': ^3.1.11
 *     '@sanity/icons': ^3.5.0
 *   ```
 *
 * Does NOT handle full YAML — only flat key-value pairs under the
 * `catalog:` key.
 *
 * @param {string} yamlPath - Absolute path to pnpm-workspace.yaml.
 * @returns {Object<string, string>} Package name → version map.
 */
function parseCatalog(yamlPath) {
  if (_catalogCache.has(yamlPath)) return _catalogCache.get(yamlPath);

  /** @type {Object<string, string>} */
  const catalog = {};

  try {
    const content = fs.readFileSync(yamlPath, "utf8");
    const lines = content.split("\n");

    let inCatalog = false;

    for (const line of lines) {
      if (/^catalog:\s*$/.test(line)) {
        inCatalog = true;
        continue;
      }

      // A non-indented, non-empty line ends the catalog section
      if (
        inCatalog &&
        line.length > 0 &&
        !line.startsWith(" ") &&
        !line.startsWith("\t")
      ) {
        inCatalog = false;
        continue;
      }

      if (!inCatalog) continue;

      // Parse:  '  '@sanity/ui': ^3.1.11'
      const match = line.match(
        /^\s+['"]?([^'":\s]+(?:\/[^'":\s]+)?)['"]?\s*:\s*['"]?([^'"\s#]+)['"]?/,
      );
      if (match) {
        catalog[match[1]] = match[2];
      }
    }
  } catch {
    // Can't read the file — return empty catalog
  }

  _catalogCache.set(yamlPath, catalog);
  return catalog;
}

/**
 * Walk up from `startDir` looking for `pnpm-workspace.yaml` and
 * resolve a package name from its catalog section.
 *
 * @param {string} startDir    - Directory to start searching from.
 * @param {string} packageName - Package name to look up.
 * @returns {string | null}
 */
function resolveCatalog(startDir, packageName) {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const yamlPath = path.join(dir, "pnpm-workspace.yaml");
    if (fs.existsSync(yamlPath)) {
      const catalog = parseCatalog(yamlPath);
      if (catalog[packageName]) return catalog[packageName];
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERSION STRING CLEANING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Clean a raw version string from `package.json` into a usable form.
 *
 * @param {string} raw - The raw version string.
 * @param {string} dir - Directory of the package.json (for catalog resolution).
 * @param {string} packageName - Package name (for catalog resolution).
 * @returns {string | null} Cleaned version, or `null` if unresolvable.
 */
function cleanVersion(raw, dir, packageName) {
  if (!raw || typeof raw !== "string") return null;

  const trimmed = raw.trim();

  // pnpm catalog
  if (trimmed === "catalog:" || trimmed.startsWith("catalog:")) {
    const catalogVersion = resolveCatalog(dir, packageName);
    return catalogVersion ? cleanVersion(catalogVersion, dir, packageName) : null;
  }

  // file: or link: protocols
  if (trimmed.startsWith("file:") || trimmed.startsWith("link:")) return null;

  // workspace: protocol — strip prefix
  if (trimmed.startsWith("workspace:")) {
    const inner = trimmed.slice("workspace:".length);
    if (inner === "*" || inner === "^" || inner === "~") return null;
    return inner;
  }

  // npm alias: "npm:@scope/pkg@version" or "npm:pkg@version"
  if (trimmed.startsWith("npm:")) {
    const withoutPrefix = trimmed.slice("npm:".length);
    const lastAt = withoutPrefix.lastIndexOf("@");
    if (lastAt > 0) return withoutPrefix.slice(lastAt + 1);
    return null;
  }

  return trimmed;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve the declared version of a package for a given source file.
 *
 * Walks up from the file's directory, checking each `package.json` for
 * the package in `dependencies`, `devDependencies`, or `peerDependencies`.
 * When found, cleans the version string (handling catalogs, aliases, etc.)
 * and returns it.
 *
 * Results are cached by directory + package name since all files in the
 * same directory share the same resolution.
 *
 * @param {string} filePath    - Absolute path to the source file.
 * @param {string} packageName - Package name (e.g. "@sanity/ui").
 * @returns {string | null} The declared version string, or `null`.
 */
function resolveVersion(filePath, packageName) {
  const fileDir = path.dirname(filePath);
  const cacheKey = fileDir + ":" + packageName;

  if (_resolvedCache.has(cacheKey)) return _resolvedCache.get(cacheKey);

  let dir = fileDir;
  let result = null;

  for (let i = 0; i < 15; i++) {
    const pkgJsonPath = path.join(dir, "package.json");
    const pkg = readPackageJson(pkgJsonPath);

    if (pkg) {
      for (const group of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
      ]) {
        if (pkg[group] && pkg[group][packageName] != null) {
          result = cleanVersion(
            String(pkg[group][packageName]),
            dir,
            packageName,
          );
          if (result !== null) {
            _resolvedCache.set(cacheKey, result);
            return result;
          }
        }
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }

  _resolvedCache.set(cacheKey, null);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  resolveVersion,
  cleanVersion,
  parseCatalog,
  resolveCatalog,
  clearCaches,
};
