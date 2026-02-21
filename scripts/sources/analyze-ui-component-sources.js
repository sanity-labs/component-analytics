const fs = require("fs");
const path = require("path");
const { glob } = require("glob");

const { extractHTMLTags } = require("../html-tags/analyze-html-tags");
const { sumValues } = require("../lib/utils");
const {
  CODEBASES,
  CODEBASE_PATHS,
  TRACKED_COMPONENTS,
  ALL_UI_LIBRARIES,
  UI_LIBRARY_NAMES,
  isTrackedUISource,
  identifyLibrary,
  isOtherUISource,
  DEFAULT_GLOB_IGNORE,
} = require("../lib/constants");

/**
 * Ordered list of library display names, derived from the config.
 * Used to initialise per-library buckets in a deterministic order.
 *
 * @type {string[]}
 */
const LIBRARY_NAMES = ALL_UI_LIBRARIES.map((l) => l.name);

/**
 * Parse named imports from an import statement, returning the LOCAL
 * names that will appear in JSX (i.e. the alias when present).
 *
 * Only PascalCase names are returned — hooks and utilities are excluded
 * because they aren't JSX elements.
 *
 * @param {string} namedImportsStr - The string inside { } in an import statement
 * @returns {string[]} - Array of local component names (PascalCase only)
 */
function parseNamedImports(namedImportsStr) {
  if (!namedImportsStr) return [];

  const imports = [];
  namedImportsStr.split(",").forEach((imp) => {
    const trimmed = imp.trim();
    if (trimmed) {
      // Handle "X as Y" syntax — the LOCAL name (Y) is what appears in JSX.
      // If there's no alias, the original name is the local name.
      const parts = trimmed.split(/\s+as\s+/);
      const localName = (parts[1] || parts[0]).trim();
      if (localName && /^[A-Z]/.test(localName)) {
        // Only count PascalCase (components)
        imports.push(localName);
      }
    }
  });
  return imports;
}

/**
 * Categorize an import source into one of: a specific tracked library
 * name, `"otherUI"`, `"internal"`, or `null` (uncategorized).
 *
 * When the source belongs to a tracked UI library the **library name**
 * is returned (e.g. `"Sanity UI"`, `"Sanity Icons"`) rather than a
 * generic `"trackedUI"` string.  This allows downstream code to
 * attribute usage to individual libraries.
 *
 * @param {string} source - The import source path
 * @returns {string | null} - Library name, `"otherUI"`, `"internal"`, or `null`
 */
function categorizeImportSource(source) {
  // Tracked UI library — return the specific library name
  const libName = identifyLibrary(source);
  if (libName) {
    return libName;
  }

  // Other UI libraries (configured in component-analytics.config.js)
  if (isOtherUISource(source)) {
    return "otherUI";
  }

  // Internal/relative imports
  if (
    /^[.\/]/.test(source) ||
    /ui-components|primitives|components/.test(source)
  ) {
    return "internal";
  }

  return null;
}

/**
 * Extract all import statements from file content
 * @param {string} content - File content
 * @returns {Array<{namedImports: string|null, defaultImport: string|null, source: string}>}
 */
function extractImports(content) {
  const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
  const imports = [];
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    imports.push({
      namedImports: match[1] || null,
      defaultImport: match[2] || null,
      source: match[3],
    });
  }

  return imports;
}

/**
 * Count every PascalCase JSX element instance in the file content.
 *
 * Unlike the old `extractJSXUsages` (which returned unique names),
 * this returns a count for every occurrence so that `<Button>…<Button>`
 * registers as 2 instances of `Button`.
 *
 * @param {string} content - File content
 * @returns {Object<string, number>} - Component name → instance count
 */
function countJSXInstances(content) {
  const jsxRegex = /<([A-Z][a-zA-Z0-9]*)/g;
  const counts = {};
  let match;

  while ((match = jsxRegex.exec(content)) !== null) {
    const name = match[1];
    counts[name] = (counts[name] || 0) + 1;
  }

  return counts;
}

/**
 * Strip import statements from file content so that import
 * destructuring (`import { Button, Card } from '...'`) doesn't
 * produce false positives when scanning for prop-value references.
 *
 * Replaces every `import … from '…'` statement (including multi-line
 * destructured imports) with whitespace of the same length to
 * preserve character offsets.
 *
 * @param {string} content - Raw file content.
 * @returns {string} Content with import statements blanked out.
 */
function stripImportStatements(content) {
  return content.replace(
    /import\s+(?:\{[^}]*\}|\w+)(?:\s*,\s*(?:\{[^}]*\}|\w+))?\s+from\s+['"][^'"]+['"]\s*;?/gs,
    (match) => " ".repeat(match.length),
  );
}

/**
 * Count references to imported component names that appear as prop
 * values rather than as JSX opening tags.
 *
 * This catches the common pattern where icons or components are passed
 * as props:
 *
 *     <Button icon={CloseIcon} />
 *     <MenuItem icon={TrashIcon} text="Delete" />
 *     {icon: EditIcon, label: "Edit"}
 *
 * Without this, icons from a separate icon package (or any component library
 * whose exports are used as prop values rather than rendered directly)
 * would be invisible to the sources report.
 *
 * Import statements are stripped before scanning to avoid false
 * positives from import destructuring (e.g. `import { CloseIcon }`).
 *
 * Only names that exist in `importedNames` are counted — this avoids
 * false positives from local variables that happen to be PascalCase.
 *
 * @param {string}   content       - File content.
 * @param {string[]} importedNames - Local names imported from tracked / categorised sources.
 * @returns {Object<string, number>} - Component name → prop-reference count.
 */
function countPropReferences(content, importedNames) {
  if (importedNames.length === 0) return {};

  // Remove import statements so that `import { CloseIcon }` doesn't
  // get counted as a prop reference.
  const stripped = stripImportStatements(content);

  const counts = {};

  for (const name of importedNames) {
    // Match patterns where the name appears as a prop value:
    //   ={Name}       — JSX expression prop:  icon={CloseIcon}
    //   ={Name,       — inside an object/array: {icon: CloseIcon, ...}
    //   : Name,       — object literal value:  {icon: CloseIcon}
    //   : Name}       — last key in object
    //   [Name,        — array element:         [CloseIcon, EditIcon]
    //
    // We use word-boundary matching to avoid partial matches
    // (e.g. "CloseIcon" should not match "CloseIconWrapper").
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(?:[=:{,\\[]\\s*)\\b${escaped}\\b(?=[\\s,}\\])])`,
      "g",
    );

    let m;
    let refCount = 0;
    while ((m = pattern.exec(stripped)) !== null) {
      refCount++;
    }

    if (refCount > 0) {
      counts[name] = refCount;
    }
  }

  return counts;
}

/**
 * Build a mapping from local JSX component names to their source
 * category, using the import statements in the file.
 *
 * For `import { Button, Card as UICard } from '<tracked-ui-library>'`:
 *   - Button   → "trackedUI"
 *   - UICard   → "trackedUI"
 *
 * For `import MyWidget from './MyWidget'`:
 *   - MyWidget → "internal"
 *
 * Components whose source doesn't match any known category (e.g.
 * `react`, `next/link`) are omitted from the map.
 *
 * @param {string} content - File content
 * @returns {{ componentToCategory: Object<string, string>, categoriesPresent: Set<string> }}
 */
function buildImportMap(content) {
  const imports = extractImports(content);
  const componentToCategory = {};
  const categoriesPresent = new Set();

  for (const imp of imports) {
    const category = categorizeImportSource(imp.source);
    if (!category) continue;

    const localNames = [];

    if (imp.namedImports) {
      localNames.push(...parseNamedImports(imp.namedImports));
    }
    if (imp.defaultImport && /^[A-Z]/.test(imp.defaultImport)) {
      localNames.push(imp.defaultImport);
    }

    for (const name of localNames) {
      componentToCategory[name] = category;
      categoriesPresent.add(category);
    }
  }

  return { componentToCategory, categoriesPresent };
}

/**
 * Analyze content string for component usage.
 *
 * Counts **JSX instances** (not imports).  Import statements are used
 * only to classify each component name into a category; the actual
 * numbers come from counting every `<Component>` occurrence in the
 * file.  Native HTML/SVG tags are counted the same way via
 * {@link extractHTMLTags}.
 *
 * @param {string} content - File content to analyze
 * @returns {object} - Analysis results
 */
function analyzeContent(content) {
  const instances = {
    libraries: {},
    otherUI: { components: [], count: 0 },
    internal: { components: [], count: 0 },
    nativeHTML: { components: [], count: 0 },
    total: { components: [], count: 0 },
  };

  // Initialize per-library buckets
  for (const libName of LIBRARY_NAMES) {
    instances.libraries[libName] = { components: [], count: 0 };
  }

  /**
   * Resolve the instance bucket for a given category string.
   * Library names resolve to `instances.libraries[cat]`; fixed
   * categories (`otherUI`, `internal`, …) resolve to `instances[cat]`.
   */
  function getBucket(cat) {
    return instances.libraries[cat] || instances[cat] || null;
  }

  // Step 1: Build a lookup from local component name → category using
  // import statements.  This tells us WHERE each name comes from.
  // Categories are now either a library name (e.g. "Sanity UI") or one
  // of the fixed strings "otherUI" / "internal".
  const { componentToCategory, categoriesPresent } = buildImportMap(content);

  // Step 2: Count every PascalCase JSX element in the file.  For each
  // instance, look up the category via the import map and credit it.
  const jsxCounts = countJSXInstances(content);

  for (const [name, count] of Object.entries(jsxCounts)) {
    const category = componentToCategory[name];
    if (category) {
      const bucket = getBucket(category);
      if (bucket) {
        for (let i = 0; i < count; i++) {
          bucket.components.push(name);
          bucket.count++;
          instances.total.components.push(name);
          instances.total.count++;
        }
      }
    }
  }

  // Step 2b: Count prop-value references to imported components.
  // This catches icons and components passed as props (e.g.
  // `icon={CloseIcon}`) that don't appear as JSX opening tags.
  // Only count references for names that were NOT already counted
  // as JSX instances — avoids double-counting components that are
  // both rendered as JSX and passed as props.
  const importedNames = Object.keys(componentToCategory);
  const propRefs = countPropReferences(content, importedNames);

  for (const [name, count] of Object.entries(propRefs)) {
    // Subtract any JSX instances already counted for this name
    const alreadyCounted = jsxCounts[name] || 0;
    const additionalRefs = Math.max(0, count - alreadyCounted);

    if (additionalRefs > 0) {
      const category = componentToCategory[name];
      if (category) {
        const bucket = getBucket(category);
        if (bucket) {
          for (let i = 0; i < additionalRefs; i++) {
            bucket.components.push(name);
            bucket.count++;
            instances.total.components.push(name);
            instances.total.count++;
          }
        }
      }
    }
  }

  // Step 3: Count native HTML/SVG tags.  Each tag instance counts
  // against the tracked UI library adoption — the more raw HTML, the
  // lower the effective percentage.
  const htmlTags = extractHTMLTags(content);
  for (const [tag, count] of Object.entries(htmlTags)) {
    for (let i = 0; i < count; i++) {
      instances.nativeHTML.components.push(tag);
      instances.nativeHTML.count++;
      instances.total.components.push(tag);
      instances.total.count++;
    }
  }
  if (instances.nativeHTML.count > 0) {
    categoriesPresent.add("nativeHTML");
  }

  // Determine which tracked libraries appear in this file
  const librariesPresent = new Set(
    [...categoriesPresent].filter((c) => LIBRARY_NAMES.includes(c)),
  );
  const hasAnyLibrary = librariesPresent.size > 0;

  return {
    imports: instances,
    jsxCounts,
    jsxCount: sumValues(jsxCounts),
    hasAnyLibrary,
    librariesPresent,
    hasInternal: categoriesPresent.has("internal"),
    usesLibraryWithInternal: hasAnyLibrary && categoriesPresent.has("internal"),
  };
}

/**
 * Analyze a single file for component imports
 * @param {string} filePath - Path to the file
 * @returns {object} - Analysis results
 */
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return analyzeContent(content);
}

/**
 * Aggregate results from multiple file analyses
 * @param {Array<object>} fileResults - Array of analyzeContent results
 * @returns {object} - Aggregated results
 */
function aggregateResults(fileResults) {
  const aggregated = {
    libraries: {},
    otherUI: { components: {}, totalInstances: 0 },
    internal: { components: {}, totalInstances: 0 },
    nativeHTML: { components: {}, totalInstances: 0 },
    total: { components: {}, totalInstances: 0 },
    jsxCounts: {},
    fileCount: fileResults.length,
    filesWithInternal: 0,
    filesWithInternalUsingAnyLibrary: 0,
    totalInternalComponents: 0,
    /** Per-library internal-adoption counters. */
    libraryAdoption: {},
  };

  for (const libName of LIBRARY_NAMES) {
    aggregated.libraries[libName] = { components: {}, totalInstances: 0 };
    aggregated.libraryAdoption[libName] = { filesUsingLibrary: 0 };
  }

  for (const result of fileResults) {
    // Aggregate per-library instances
    for (const [libName, libData] of Object.entries(result.imports.libraries)) {
      if (!aggregated.libraries[libName]) continue;
      for (const comp of libData.components) {
        aggregated.libraries[libName].components[comp] =
          (aggregated.libraries[libName].components[comp] || 0) + 1;
        aggregated.libraries[libName].totalInstances++;
      }
    }

    // Aggregate fixed categories (otherUI, internal, nativeHTML, total)
    for (const category of ["otherUI", "internal", "nativeHTML", "total"]) {
      for (const comp of result.imports[category].components) {
        aggregated[category].components[comp] =
          (aggregated[category].components[comp] || 0) + 1;
        aggregated[category].totalInstances++;
      }
    }

    // Aggregate raw JSX counts (all PascalCase components)
    for (const [comp, count] of Object.entries(result.jsxCounts || {})) {
      aggregated.jsxCounts[comp] = (aggregated.jsxCounts[comp] || 0) + count;
    }

    // Track internal component usage with tracked libraries
    if (result.hasInternal) {
      aggregated.filesWithInternal++;
      aggregated.totalInternalComponents += result.imports.internal.count;

      if (result.usesLibraryWithInternal) {
        aggregated.filesWithInternalUsingAnyLibrary++;
      }

      // Per-library adoption
      for (const libName of LIBRARY_NAMES) {
        if (result.librariesPresent.has(libName)) {
          aggregated.libraryAdoption[libName].filesUsingLibrary++;
        }
      }
    }
  }

  // ── Backward-compatible combined "trackedUI" field ──────────────────
  // The text report, CSV, and main() summary still use a single
  // combined tracked-UI bucket.  Compute it from the per-library data
  // so those code paths continue to work without changes.
  aggregated.trackedUI = { components: {}, totalInstances: 0 };
  for (const libData of Object.values(aggregated.libraries)) {
    for (const [comp, count] of Object.entries(libData.components)) {
      aggregated.trackedUI.components[comp] =
        (aggregated.trackedUI.components[comp] || 0) + count;
    }
    aggregated.trackedUI.totalInstances += libData.totalInstances;
  }
  aggregated.filesWithInternalUsingTrackedUI =
    aggregated.filesWithInternalUsingAnyLibrary;
  aggregated.internalComponentsUsingTrackedUI =
    aggregated.totalInternalComponents > 0
      ? aggregated.filesWithInternalUsingAnyLibrary
      : 0;

  return aggregated;
}

/**
 * Analyze a codebase for UI component usage
 * @param {string} codebase - Name of the codebase
 * @returns {Promise<object|null>} - Aggregated analysis results
 */
async function analyzeCodebase(codebase) {
  const cbPath =
    CODEBASE_PATHS[codebase] ||
    path.resolve(__dirname, `../../codebases/${codebase}`);

  if (!fs.existsSync(cbPath)) {
    console.log(`⚠️  Skipping ${codebase}: path not found`);
    return null;
  }

  console.log(`\n📊 Analyzing ${codebase}...`);

  // Find all component files using the configured patterns
  const files = await glob("**/*.{tsx,jsx}", {
    cwd: cbPath,
    ignore: DEFAULT_GLOB_IGNORE,
    absolute: true,
  });

  console.log(`   Found ${files.length} component files`);

  const fileResults = [];

  // Analyze each file
  for (const file of files) {
    try {
      const result = analyzeFile(file);
      fileResults.push(result);
    } catch (error) {
      // Skip files that can't be parsed
    }
  }

  return aggregateResults(fileResults);
}

/**
 * Generate comparison report
 * @param {object} results - Results object keyed by codebase name
 * @returns {string} - Formatted text report
 */
function generateReport(results) {
  const reportLines = [];

  reportLines.push("═".repeat(80));
  reportLines.push(
    `       UI COMPONENT SOURCE ANALYSIS - ${UI_LIBRARY_NAMES.toUpperCase()} vs OTHER COMPONENTS`,
  );
  reportLines.push("═".repeat(80));
  reportLines.push("");
  reportLines.push(
    "NOTE: All numbers are JSX element instances, not import counts.",
  );
  reportLines.push(
    `      ${UI_LIBRARY_NAMES} is the tracked UI library (configured in component-analytics.config.js).`,
  );
  reportLines.push(
    `      Native HTML tag instances count against ${UI_LIBRARY_NAMES} adoption.`,
  );
  reportLines.push("");

  // Summary table
  reportLines.push("CODEBASE SUMMARY (JSX INSTANCES)");
  reportLines.push("-".repeat(100));
  const libLabel =
    UI_LIBRARY_NAMES.length <= 9
      ? UI_LIBRARY_NAMES.padEnd(9)
      : UI_LIBRARY_NAMES.slice(0, 9);
  reportLines.push(
    `Codebase    | Files    | ${libLabel} | Other UI  | Internal  | HTML Tags | Total     | % ${UI_LIBRARY_NAMES}`,
  );
  reportLines.push("-".repeat(100));

  let grandTotal = {
    files: 0,
    trackedUI: 0,
    otherUI: 0,
    internal: 0,
    nativeHTML: 0,
    total: 0,
    filesWithInternal: 0,
    filesWithInternalUsingTrackedUI: 0,
  };

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    const trackedUICount = data.trackedUI.totalInstances;
    const otherUICount = data.otherUI.totalInstances;
    const internalCount = data.internal.totalInstances;
    const nativeHTMLCount = data.nativeHTML.totalInstances;
    const totalCount = data.total.totalInstances;
    const trackedUIPercent =
      totalCount > 0 ? ((trackedUICount / totalCount) * 100).toFixed(1) : "0.0";

    reportLines.push(
      `${codebase.padEnd(11)} | ${data.fileCount.toString().padStart(8)} | ${trackedUICount.toString().padStart(9)} | ${otherUICount.toString().padStart(9)} | ${internalCount.toString().padStart(9)} | ${nativeHTMLCount.toString().padStart(9)} | ${totalCount.toString().padStart(9)} | ${trackedUIPercent.padStart(10)}%`,
    );

    grandTotal.files += data.fileCount;
    grandTotal.trackedUI += trackedUICount;
    grandTotal.otherUI += otherUICount;
    grandTotal.internal += internalCount;
    grandTotal.nativeHTML += nativeHTMLCount;
    grandTotal.total += totalCount;
    grandTotal.filesWithInternal += data.filesWithInternal;
    grandTotal.filesWithInternalUsingTrackedUI +=
      data.filesWithInternalUsingTrackedUI;
  }

  reportLines.push("-".repeat(100));
  const grandTrackedUIPercent =
    grandTotal.total > 0
      ? ((grandTotal.trackedUI / grandTotal.total) * 100).toFixed(1)
      : "0.0";
  reportLines.push(
    `${"TOTAL".padEnd(11)} | ${grandTotal.files.toString().padStart(8)} | ${grandTotal.trackedUI.toString().padStart(9)} | ${grandTotal.otherUI.toString().padStart(9)} | ${grandTotal.internal.toString().padStart(9)} | ${grandTotal.nativeHTML.toString().padStart(9)} | ${grandTotal.total.toString().padStart(9)} | ${grandTrackedUIPercent.padStart(10)}%`,
  );
  reportLines.push("");

  // Internal components using tracked UI library section
  reportLines.push("═".repeat(80));
  reportLines.push("INTERNAL COMPONENTS USING TRACKED UI LIBRARY");
  reportLines.push("═".repeat(80));
  reportLines.push("");
  reportLines.push(
    "This measures what percentage of files with internal/local component imports",
  );
  reportLines.push(
    "also use tracked UI library components (indicating tracked UI library adoption in custom components).",
  );
  reportLines.push("");
  reportLines.push("-".repeat(80));
  reportLines.push(
    "Codebase    | Files w/Internal | Using tracked UI library | % Using tracked UI library",
  );
  reportLines.push("-".repeat(80));

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    const filesWithInternal = data.filesWithInternal;
    const filesUsingTrackedUI = data.filesWithInternalUsingTrackedUI;
    const percent =
      filesWithInternal > 0
        ? ((filesUsingTrackedUI / filesWithInternal) * 100).toFixed(1)
        : "0.0";

    reportLines.push(
      `${codebase.padEnd(11)} | ${filesWithInternal.toString().padStart(16)} | ${filesUsingTrackedUI.toString().padStart(15)} | ${percent.padStart(16)}%`,
    );
  }

  reportLines.push("-".repeat(80));
  const grandInternalPercent =
    grandTotal.filesWithInternal > 0
      ? (
          (grandTotal.filesWithInternalUsingTrackedUI /
            grandTotal.filesWithInternal) *
          100
        ).toFixed(1)
      : "0.0";
  reportLines.push(
    `${"TOTAL".padEnd(11)} | ${grandTotal.filesWithInternal.toString().padStart(16)} | ${grandTotal.filesWithInternalUsingTrackedUI.toString().padStart(15)} | ${grandInternalPercent.padStart(16)}%`,
  );
  reportLines.push("");

  // Detailed breakdown per codebase
  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    reportLines.push("");
    reportLines.push("═".repeat(80));
    reportLines.push(`${codebase.toUpperCase()} - DETAILED BREAKDOWN`);
    reportLines.push("═".repeat(80));

    // Top tracked UI library components (now includes icons)
    reportLines.push("");
    reportLines.push(`TOP 20 ${UI_LIBRARY_NAMES.toUpperCase()} COMPONENTS`);
    reportLines.push("-".repeat(50));

    const trackedUISorted = Object.entries(data.trackedUI.components)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    if (trackedUISorted.length > 0) {
      reportLines.push("Rank | Component              | Instances");
      reportLines.push("-".repeat(50));
      trackedUISorted.forEach(([comp, count], index) => {
        reportLines.push(
          `${(index + 1).toString().padStart(4)} | ${comp.padEnd(22)} | ${count.toString().padStart(12)}`,
        );
      });
    } else {
      reportLines.push("No tracked UI library components found");
    }

    // Top Other UI components
    reportLines.push("");
    reportLines.push("TOP 20 OTHER UI LIBRARY COMPONENTS");
    reportLines.push("-".repeat(50));

    const otherUISorted = Object.entries(data.otherUI.components)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    if (otherUISorted.length > 0) {
      reportLines.push("Rank | Component              | Instances");
      reportLines.push("-".repeat(50));
      otherUISorted.forEach(([comp, count], index) => {
        reportLines.push(
          `${(index + 1).toString().padStart(4)} | ${comp.padEnd(22)} | ${count.toString().padStart(12)}`,
        );
      });
    } else {
      reportLines.push("No other UI library components found");
    }

    // Top Internal components
    reportLines.push("");
    reportLines.push("TOP 20 INTERNAL/LOCAL COMPONENTS");
    reportLines.push("-".repeat(50));

    const internalSorted = Object.entries(data.internal.components)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    if (internalSorted.length > 0) {
      reportLines.push("Rank | Component              | Instances");
      reportLines.push("-".repeat(50));
      internalSorted.forEach(([comp, count], index) => {
        reportLines.push(
          `${(index + 1).toString().padStart(4)} | ${comp.padEnd(22)} | ${count.toString().padStart(12)}`,
        );
      });
    } else {
      reportLines.push("No internal components found");
    }

    // Top native HTML tags
    reportLines.push("");
    reportLines.push("TOP 20 NATIVE HTML/SVG TAGS");
    reportLines.push("-".repeat(50));

    const htmlSorted = Object.entries(data.nativeHTML.components)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    if (htmlSorted.length > 0) {
      reportLines.push("Rank | Tag                    | JSX Count");
      reportLines.push("-".repeat(50));
      htmlSorted.forEach(([tag, count], index) => {
        reportLines.push(
          `${(index + 1).toString().padStart(4)} | ${tag.padEnd(22)} | ${count.toString().padStart(12)}`,
        );
      });
    } else {
      reportLines.push("No native HTML tags found");
    }

    // Component source distribution
    reportLines.push("");
    reportLines.push("COMPONENT SOURCE DISTRIBUTION");
    reportLines.push("-".repeat(60));

    const total = data.total.totalInstances || 1;
    const trackedUIPct = (
      (data.trackedUI.totalInstances / total) *
      100
    ).toFixed(1);
    const otherPct = ((data.otherUI.totalInstances / total) * 100).toFixed(1);
    const internalPct = ((data.internal.totalInstances / total) * 100).toFixed(
      1,
    );
    const htmlPct = ((data.nativeHTML.totalInstances / total) * 100).toFixed(1);

    const trackedUIBar = "█".repeat(Math.round(parseFloat(trackedUIPct) / 2));
    const otherBar = "█".repeat(Math.round(parseFloat(otherPct) / 2));
    const internalBar = "█".repeat(Math.round(parseFloat(internalPct) / 2));
    const htmlBar = "█".repeat(Math.round(parseFloat(htmlPct) / 2));

    reportLines.push(
      `${UI_LIBRARY_NAMES}:${" ".repeat(Math.max(1, 12 - UI_LIBRARY_NAMES.length))}${trackedUIBar.padEnd(50)} ${trackedUIPct}%`,
    );
    reportLines.push(`Other UI:   ${otherBar.padEnd(50)} ${otherPct}%`);
    reportLines.push(`Internal:   ${internalBar.padEnd(50)} ${internalPct}%`);
    reportLines.push(`HTML Tags:  ${htmlBar.padEnd(50)} ${htmlPct}%`);

    // Internal components tracked UI library adoption
    reportLines.push("");
    reportLines.push(
      `INTERNAL COMPONENT ${UI_LIBRARY_NAMES.toUpperCase()} ADOPTION`,
    );
    reportLines.push("-".repeat(50));
    const internalSanityPct =
      data.filesWithInternal > 0
        ? (
            (data.filesWithInternalUsingTrackedUI / data.filesWithInternal) *
            100
          ).toFixed(1)
        : "0.0";
    reportLines.push(`Files with internal imports: ${data.filesWithInternal}`);
    reportLines.push(
      `Files also using ${UI_LIBRARY_NAMES}:  ${data.filesWithInternalUsingTrackedUI} (${internalSanityPct}%)`,
    );
  }

  // Cross-codebase analysis
  reportLines.push("");
  reportLines.push("═".repeat(80));
  reportLines.push("CROSS-CODEBASE ANALYSIS");
  reportLines.push("═".repeat(80));

  // Aggregate all tracked UI library components across codebases
  const allTrackedUI = {};
  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;
    for (const [comp, count] of Object.entries(data.trackedUI.components)) {
      if (!allTrackedUI[comp]) {
        allTrackedUI[comp] = { total: 0, codebases: {} };
      }
      allTrackedUI[comp].total += count;
      allTrackedUI[comp].codebases[codebase] = count;
    }
  }

  reportLines.push("");
  reportLines.push(
    `MOST USED ${UI_LIBRARY_NAMES.toUpperCase()} COMPONENTS (ACROSS ALL CODEBASES)`,
  );
  reportLines.push("-".repeat(80));
  reportLines.push(
    "Rank | Component              | Total    | sanity   | canvas   | huey     (instances)",
  );
  reportLines.push("-".repeat(80));

  const allTrackedUISorted = Object.entries(allTrackedUI)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 30);

  allTrackedUISorted.forEach(([comp, data], index) => {
    const trackedUICount = (data.codebases.sanity || 0).toString().padStart(8);
    const canvasCount = (data.codebases.canvas || 0).toString().padStart(8);
    const hueyCount = (data.codebases.huey || 0).toString().padStart(8);
    reportLines.push(
      `${(index + 1).toString().padStart(4)} | ${comp.padEnd(22)} | ${data.total.toString().padStart(8)} | ${trackedUICount} | ${canvasCount} | ${hueyCount}`,
    );
  });

  // Key insights
  reportLines.push("");
  reportLines.push("═".repeat(80));
  reportLines.push("KEY INSIGHTS");
  reportLines.push("═".repeat(80));
  reportLines.push("");

  const grandHTMLPercent =
    grandTotal.total > 0
      ? ((grandTotal.nativeHTML / grandTotal.total) * 100).toFixed(1)
      : "0.0";

  reportLines.push(
    `1. Total JSX element instances across all codebases: ${grandTotal.total.toLocaleString()}`,
  );
  reportLines.push(
    `2. ${UI_LIBRARY_NAMES} instances: ${grandTotal.trackedUI.toLocaleString()} (${grandTrackedUIPercent}% of total)`,
  );
  reportLines.push(
    `3. Other UI library instances: ${grandTotal.otherUI.toLocaleString()} (${((grandTotal.otherUI / grandTotal.total) * 100).toFixed(1)}% of total)`,
  );
  reportLines.push(
    `4. Internal component instances: ${grandTotal.internal.toLocaleString()} (${((grandTotal.internal / grandTotal.total) * 100).toFixed(1)}% of total)`,
  );
  reportLines.push(
    `5. Native HTML/SVG tag instances: ${grandTotal.nativeHTML.toLocaleString()} (${grandHTMLPercent}% of total)`,
  );

  if (allTrackedUISorted.length > 0) {
    reportLines.push(
      `6. Most used ${UI_LIBRARY_NAMES} component: ${allTrackedUISorted[0][0]} (${allTrackedUISorted[0][1].total.toLocaleString()} instances)`,
    );
  }

  const uniqueTrackedUICount = Object.keys(allTrackedUI).length;
  reportLines.push(
    `7. Unique ${UI_LIBRARY_NAMES} components used: ${uniqueTrackedUICount}`,
  );

  reportLines.push(
    `8. Internal components using ${UI_LIBRARY_NAMES}: ${grandTotal.filesWithInternalUsingTrackedUI} of ${grandTotal.filesWithInternal} files (${grandInternalPercent}%)`,
  );

  reportLines.push("");
  reportLines.push("═".repeat(80));

  return reportLines.join("\n");
}

/**
 * Generate CSV report
 * @param {object} results - Results object keyed by codebase name
 * @returns {string} - CSV formatted data
 */
function generateCSV(results) {
  const rows = [];
  rows.push(`Codebase,Category,Component,Instances`);

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    // Tracked UI library
    for (const [comp, count] of Object.entries(data.trackedUI.components)) {
      rows.push(`${codebase},${UI_LIBRARY_NAMES},${comp},${count}`);
    }

    // Other UI
    for (const [comp, count] of Object.entries(data.otherUI.components)) {
      rows.push(`${codebase},Other UI,${comp},${count}`);
    }

    // Internal
    for (const [comp, count] of Object.entries(data.internal.components)) {
      rows.push(`${codebase},Internal,${comp},${count}`);
    }

    // Native HTML tags
    for (const [tag, count] of Object.entries(data.nativeHTML.components)) {
      rows.push(`${codebase},Native HTML,${tag},${count}`);
    }
  }

  return rows.join("\n");
}

/**
 * Generate JSON summary
 * @param {object} results - Results object keyed by codebase name
 * @returns {string} - JSON formatted data
 */
function generateJSON(results) {
  const summary = {
    generatedAt: new Date().toISOString(),
    libraryNames: LIBRARY_NAMES,
    note: `All numbers are JSX element instances. Tracked libraries: ${UI_LIBRARY_NAMES}. Native HTML tag instances count against library adoption.`,
    codebases: {},
    totals: {
      files: 0,
      libraryInstances: {},
      totalLibraryInstances: 0,
      otherUIInstances: 0,
      internalInstances: 0,
      nativeHTMLInstances: 0,
      totalInstances: 0,
      filesWithInternal: 0,
      filesWithInternalUsingAnyLibrary: 0,
      internalAdoption: {},
    },
    topComponentsByLibrary: {},
  };

  // Initialize per-library totals
  for (const libName of LIBRARY_NAMES) {
    summary.totals.libraryInstances[libName] = 0;
    summary.totals.internalAdoption[libName] = {
      filesUsingLibrary: 0,
      adoptionPercent: 0,
    };
  }

  /** Per-library component counters across all codebases. */
  const allComponentsByLibrary = {};
  for (const libName of LIBRARY_NAMES) {
    allComponentsByLibrary[libName] = {};
  }

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    const cbEntry = {
      fileCount: data.fileCount,
      libraries: {},
      otherUI: {
        instances: data.otherUI.totalInstances,
        uniqueComponents: Object.keys(data.otherUI.components).length,
        components: data.otherUI.components,
      },
      internal: {
        instances: data.internal.totalInstances,
        uniqueComponents: Object.keys(data.internal.components).length,
        components: data.internal.components,
      },
      nativeHTML: {
        instances: data.nativeHTML.totalInstances,
        uniqueTags: Object.keys(data.nativeHTML.components).length,
        tags: data.nativeHTML.components,
      },
      total: {
        instances: data.total.totalInstances,
        uniqueComponents: Object.keys(data.total.components).length,
      },
      internalAdoption: {},
    };

    // Per-library data for this codebase
    for (const libName of LIBRARY_NAMES) {
      const libData = data.libraries[libName] || {
        components: {},
        totalInstances: 0,
      };
      cbEntry.libraries[libName] = {
        instances: libData.totalInstances,
        uniqueComponents: Object.keys(libData.components).length,
        components: libData.components,
      };

      const adoption = data.libraryAdoption[libName] || {};
      const filesUsing = adoption.filesUsingLibrary || 0;
      cbEntry.internalAdoption[libName] = {
        filesWithInternal: data.filesWithInternal,
        filesUsingLibrary: filesUsing,
        adoptionPercent:
          data.filesWithInternal > 0
            ? parseFloat(
                ((filesUsing / data.filesWithInternal) * 100).toFixed(1),
              )
            : 0,
      };

      // Accumulate per-library totals
      summary.totals.libraryInstances[libName] += libData.totalInstances;
      summary.totals.totalLibraryInstances += libData.totalInstances;

      // Accumulate per-library adoption
      summary.totals.internalAdoption[libName].filesUsingLibrary += filesUsing;

      // Accumulate component counters for top-N lists
      for (const [comp, count] of Object.entries(libData.components)) {
        allComponentsByLibrary[libName][comp] =
          (allComponentsByLibrary[libName][comp] || 0) + count;
      }
    }

    summary.codebases[codebase] = cbEntry;

    summary.totals.files += data.fileCount;
    summary.totals.otherUIInstances += data.otherUI.totalInstances;
    summary.totals.internalInstances += data.internal.totalInstances;
    summary.totals.nativeHTMLInstances += data.nativeHTML.totalInstances;
    summary.totals.totalInstances += data.total.totalInstances;
    summary.totals.filesWithInternal += data.filesWithInternal;
    summary.totals.filesWithInternalUsingAnyLibrary +=
      data.filesWithInternalUsingAnyLibrary || 0;
  }

  // Finalize per-library adoption percentages in totals
  for (const libName of LIBRARY_NAMES) {
    const adoption = summary.totals.internalAdoption[libName];
    adoption.adoptionPercent =
      summary.totals.filesWithInternal > 0
        ? parseFloat(
            (
              (adoption.filesUsingLibrary / summary.totals.filesWithInternal) *
              100
            ).toFixed(1),
          )
        : 0;
  }

  // Top components per library (up to 30 each)
  for (const libName of LIBRARY_NAMES) {
    summary.topComponentsByLibrary[libName] = Object.entries(
      allComponentsByLibrary[libName],
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([name, count]) => ({ name, instances: count }));
  }

  return JSON.stringify(summary, null, 2);
}

/**
 * Main function
 */
async function main() {
  console.log(
    "╔════════════════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    `║     UI COMPONENT SOURCE ANALYSIS - ${UI_LIBRARY_NAMES.toUpperCase()} vs OTHER SOURCES     ║`,
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════════════════╝",
  );
  console.log("");
  console.log(
    "NOTE: All numbers are JSX element instances (not import counts).",
  );
  console.log(
    `      ${UI_LIBRARY_NAMES} is the tracked UI library (from component-analytics.config.js).`,
  );
  console.log(
    `      Native HTML tag instances count against ${UI_LIBRARY_NAMES} adoption.`,
  );

  const results = {};

  // Analyze each codebase
  for (const codebase of CODEBASES) {
    results[codebase] = await analyzeCodebase(codebase);
  }

  // Generate reports
  const outputDir = path.resolve(__dirname, "../../reports/sources");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Text report
  const textReport = generateReport(results);
  const textPath = path.join(outputDir, "report.txt");
  fs.writeFileSync(textPath, textReport);
  console.log(`\n✅ Text report saved to: ${textPath}`);

  // CSV report
  const csvReport = generateCSV(results);
  const csvPath = path.join(outputDir, "report.csv");
  fs.writeFileSync(csvPath, csvReport);
  console.log(`✅ CSV report saved to: ${csvPath}`);

  // JSON report
  const jsonReport = generateJSON(results);
  const jsonPath = path.join(outputDir, "report.json");
  fs.writeFileSync(jsonPath, jsonReport);
  console.log(`✅ JSON report saved to: ${jsonPath}`);

  // Print summary to console
  console.log("\n" + "═".repeat(80));
  console.log("QUICK SUMMARY");
  console.log("═".repeat(80));

  let totalTrackedUI = 0;
  let totalOther = 0;
  let totalInternal = 0;
  let totalAll = 0;
  let totalFilesWithInternal = 0;
  let totalFilesWithInternalUsingTrackedUI = 0;

  for (const [codebase, data] of Object.entries(results)) {
    if (data) {
      totalTrackedUI += data.trackedUI.totalInstances;
      totalOther += data.otherUI.totalInstances;
      totalInternal += data.internal.totalInstances;
      totalAll += data.total.totalInstances;
      totalFilesWithInternal += data.filesWithInternal;
      totalFilesWithInternalUsingTrackedUI +=
        data.filesWithInternalUsingTrackedUI;

      const pct =
        data.total.totalInstances > 0
          ? (
              (data.trackedUI.totalInstances / data.total.totalInstances) *
              100
            ).toFixed(1)
          : "0.0";
      console.log(
        `${codebase.padEnd(10)}: ${data.trackedUI.totalInstances.toLocaleString().padStart(6)} ${UI_LIBRARY_NAMES} / ${data.nativeHTML.totalInstances.toLocaleString().padStart(6)} HTML / ${data.total.totalInstances.toLocaleString().padStart(6)} total (${pct}% ${UI_LIBRARY_NAMES})`,
      );
    }
  }

  console.log("-".repeat(50));
  const totalPct =
    totalAll > 0 ? ((totalTrackedUI / totalAll) * 100).toFixed(1) : "0.0";
  console.log(
    `${"TOTAL".padEnd(10)}: ${totalTrackedUI.toLocaleString().padStart(6)} ${UI_LIBRARY_NAMES} / ${totalAll.toLocaleString().padStart(6)} total (${totalPct}%)`,
  );

  console.log("");
  console.log(`INTERNAL COMPONENTS USING ${UI_LIBRARY_NAMES.toUpperCase()}:`);
  const internalPct =
    totalFilesWithInternal > 0
      ? (
          (totalFilesWithInternalUsingTrackedUI / totalFilesWithInternal) *
          100
        ).toFixed(1)
      : "0.0";
  console.log(
    `${totalFilesWithInternalUsingTrackedUI} of ${totalFilesWithInternal} files with internal components also use ${UI_LIBRARY_NAMES} (${internalPct}%)`,
  );
  console.log("");
}

// Export functions for testing
module.exports = {
  parseNamedImports,
  categorizeImportSource,
  extractImports,
  countJSXInstances,
  buildImportMap,
  analyzeContent,
  analyzeFile,
  aggregateResults,
  analyzeCodebase,
  countPropReferences,
  stripImportStatements,
  generateReport,
  generateCSV,
  generateJSON,
};

// Run main function if this is the entry point
if (require.main === module) {
  main().catch(console.error);
}
