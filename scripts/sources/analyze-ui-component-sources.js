const fs = require("fs");
const path = require("path");
const { glob } = require("glob");

const { extractHTMLTags } = require("../html-tags/analyze-html-tags");
const { sumValues } = require("../lib/utils");
const {
  CODEBASES,
  CODEBASE_PATHS,
  TRACKED_COMPONENTS,
  UI_LIBRARY_NAME,
  isTrackedUISource,
  isOtherUISource,
  DEFAULT_GLOB_IGNORE,
} = require("../lib/constants");

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
 * Categorize an import source into one of: tracked UI library,
 * other UI library, internal, or uncategorized.
 *
 * Uses the patterns defined in `studio-analysis.config.js` via the
 * shared constants module.
 *
 * @param {string} source - The import source path
 * @returns {'sanityUI' | 'otherUI' | 'internal' | null} - The category
 */
function categorizeImportSource(source) {
  // Tracked UI library (configured in studio-analysis.config.js)
  if (isTrackedUISource(source)) {
    return "sanityUI";
  }

  // Other UI libraries (configured in studio-analysis.config.js)
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
 * Build a mapping from local JSX component names to their source
 * category, using the import statements in the file.
 *
 * For `import { Button, Card as UICard } from '@sanity/ui'`:
 *   - Button   → "sanityUI"
 *   - UICard   → "sanityUI"
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
    sanityUI: { components: [], count: 0 },
    otherUI: { components: [], count: 0 },
    internal: { components: [], count: 0 },
    nativeHTML: { components: [], count: 0 },
    total: { components: [], count: 0 },
  };

  // Step 1: Build a lookup from local component name → category using
  // import statements.  This tells us WHERE each name comes from.
  const { componentToCategory, categoriesPresent } = buildImportMap(content);

  // Step 2: Count every PascalCase JSX element in the file.  For each
  // instance, look up the category via the import map and credit it.
  const jsxCounts = countJSXInstances(content);

  for (const [name, count] of Object.entries(jsxCounts)) {
    const category = componentToCategory[name];
    if (category) {
      for (let i = 0; i < count; i++) {
        instances[category].components.push(name);
        instances[category].count++;
        instances.total.components.push(name);
        instances.total.count++;
      }
    }
  }

  // Step 3: Count native HTML/SVG tags.  Each tag instance counts
  // against Sanity UI adoption — the more raw HTML, the lower the
  // effective percentage.
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

  return {
    imports: instances,
    jsxCounts,
    jsxCount: sumValues(jsxCounts),
    // Track if this file has both internal and sanityUI imports
    hasSanityUI: categoriesPresent.has("sanityUI"),
    hasInternal: categoriesPresent.has("internal"),
    usesSanityUIWithInternal:
      categoriesPresent.has("sanityUI") && categoriesPresent.has("internal"),
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
    sanityUI: { components: {}, totalInstances: 0 },
    otherUI: { components: {}, totalInstances: 0 },
    internal: { components: {}, totalInstances: 0 },
    nativeHTML: { components: {}, totalInstances: 0 },
    total: { components: {}, totalInstances: 0 },
    jsxCounts: {},
    fileCount: fileResults.length,
    // Metrics for internal component analysis
    filesWithInternal: 0,
    filesWithInternalUsingSanityUI: 0,
    internalComponentsUsingSanityUI: 0,
    totalInternalComponents: 0,
  };

  for (const result of fileResults) {
    // Aggregate instance counts (includes nativeHTML)
    ["sanityUI", "otherUI", "internal", "nativeHTML", "total"].forEach(
      (category) => {
        result.imports[category].components.forEach((comp) => {
          if (!aggregated[category].components[comp]) {
            aggregated[category].components[comp] = 0;
          }
          aggregated[category].components[comp]++;
          aggregated[category].totalInstances++;
        });
      },
    );

    // Aggregate raw JSX counts (all PascalCase components)
    for (const [comp, count] of Object.entries(result.jsxCounts || {})) {
      if (!aggregated.jsxCounts[comp]) {
        aggregated.jsxCounts[comp] = 0;
      }
      aggregated.jsxCounts[comp] += count;
    }

    // Track internal component usage with Sanity UI
    if (result.hasInternal) {
      aggregated.filesWithInternal++;
      aggregated.totalInternalComponents += result.imports.internal.count;

      if (result.usesSanityUIWithInternal) {
        aggregated.filesWithInternalUsingSanityUI++;
        aggregated.internalComponentsUsingSanityUI +=
          result.imports.internal.count;
      }
    }
  }

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
    `       UI COMPONENT SOURCE ANALYSIS - ${UI_LIBRARY_NAME.toUpperCase()} vs OTHER COMPONENTS`,
  );
  reportLines.push("═".repeat(80));
  reportLines.push("");
  reportLines.push(
    "NOTE: All numbers are JSX element instances, not import counts.",
  );
  reportLines.push(
    `      ${UI_LIBRARY_NAME} is the tracked UI library (configured in studio-analysis.config.js).`,
  );
  reportLines.push(
    `      Native HTML tag instances count against ${UI_LIBRARY_NAME} adoption.`,
  );
  reportLines.push("");

  // Summary table
  reportLines.push("CODEBASE SUMMARY (JSX INSTANCES)");
  reportLines.push("-".repeat(100));
  const libLabel =
    UI_LIBRARY_NAME.length <= 9
      ? UI_LIBRARY_NAME.padEnd(9)
      : UI_LIBRARY_NAME.slice(0, 9);
  reportLines.push(
    `Codebase    | Files    | ${libLabel} | Other UI  | Internal  | HTML Tags | Total     | % ${UI_LIBRARY_NAME}`,
  );
  reportLines.push("-".repeat(100));

  let grandTotal = {
    files: 0,
    sanityUI: 0,
    otherUI: 0,
    internal: 0,
    nativeHTML: 0,
    total: 0,
    filesWithInternal: 0,
    filesWithInternalUsingSanityUI: 0,
  };

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    const sanityUICount = data.sanityUI.totalInstances;
    const otherUICount = data.otherUI.totalInstances;
    const internalCount = data.internal.totalInstances;
    const nativeHTMLCount = data.nativeHTML.totalInstances;
    const totalCount = data.total.totalInstances;
    const sanityPercent =
      totalCount > 0 ? ((sanityUICount / totalCount) * 100).toFixed(1) : "0.0";

    reportLines.push(
      `${codebase.padEnd(11)} | ${data.fileCount.toString().padStart(8)} | ${sanityUICount.toString().padStart(9)} | ${otherUICount.toString().padStart(9)} | ${internalCount.toString().padStart(9)} | ${nativeHTMLCount.toString().padStart(9)} | ${totalCount.toString().padStart(9)} | ${sanityPercent.padStart(10)}%`,
    );

    grandTotal.files += data.fileCount;
    grandTotal.sanityUI += sanityUICount;
    grandTotal.otherUI += otherUICount;
    grandTotal.internal += internalCount;
    grandTotal.nativeHTML += nativeHTMLCount;
    grandTotal.total += totalCount;
    grandTotal.filesWithInternal += data.filesWithInternal;
    grandTotal.filesWithInternalUsingSanityUI +=
      data.filesWithInternalUsingSanityUI;
  }

  reportLines.push("-".repeat(100));
  const grandSanityPercent =
    grandTotal.total > 0
      ? ((grandTotal.sanityUI / grandTotal.total) * 100).toFixed(1)
      : "0.0";
  reportLines.push(
    `${"TOTAL".padEnd(11)} | ${grandTotal.files.toString().padStart(8)} | ${grandTotal.sanityUI.toString().padStart(9)} | ${grandTotal.otherUI.toString().padStart(9)} | ${grandTotal.internal.toString().padStart(9)} | ${grandTotal.nativeHTML.toString().padStart(9)} | ${grandTotal.total.toString().padStart(9)} | ${grandSanityPercent.padStart(10)}%`,
  );
  reportLines.push("");

  // Internal components using Sanity UI section
  reportLines.push("═".repeat(80));
  reportLines.push("INTERNAL COMPONENTS USING SANITY UI");
  reportLines.push("═".repeat(80));
  reportLines.push("");
  reportLines.push(
    "This measures what percentage of files with internal/local component imports",
  );
  reportLines.push(
    "also use Sanity UI components (indicating Sanity UI adoption in custom components).",
  );
  reportLines.push("");
  reportLines.push("-".repeat(80));
  reportLines.push(
    "Codebase    | Files w/Internal | Using Sanity UI | % Using Sanity UI",
  );
  reportLines.push("-".repeat(80));

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    const filesWithInternal = data.filesWithInternal;
    const filesUsingSanityUI = data.filesWithInternalUsingSanityUI;
    const percent =
      filesWithInternal > 0
        ? ((filesUsingSanityUI / filesWithInternal) * 100).toFixed(1)
        : "0.0";

    reportLines.push(
      `${codebase.padEnd(11)} | ${filesWithInternal.toString().padStart(16)} | ${filesUsingSanityUI.toString().padStart(15)} | ${percent.padStart(16)}%`,
    );
  }

  reportLines.push("-".repeat(80));
  const grandInternalPercent =
    grandTotal.filesWithInternal > 0
      ? (
          (grandTotal.filesWithInternalUsingSanityUI /
            grandTotal.filesWithInternal) *
          100
        ).toFixed(1)
      : "0.0";
  reportLines.push(
    `${"TOTAL".padEnd(11)} | ${grandTotal.filesWithInternal.toString().padStart(16)} | ${grandTotal.filesWithInternalUsingSanityUI.toString().padStart(15)} | ${grandInternalPercent.padStart(16)}%`,
  );
  reportLines.push("");

  // Detailed breakdown per codebase
  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    reportLines.push("");
    reportLines.push("═".repeat(80));
    reportLines.push(`${codebase.toUpperCase()} - DETAILED BREAKDOWN`);
    reportLines.push("═".repeat(80));

    // Top Sanity UI components (now includes icons)
    reportLines.push("");
    reportLines.push(`TOP 20 ${UI_LIBRARY_NAME.toUpperCase()} COMPONENTS`);
    reportLines.push("-".repeat(50));

    const sanityUISorted = Object.entries(data.sanityUI.components)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    if (sanityUISorted.length > 0) {
      reportLines.push("Rank | Component              | Instances");
      reportLines.push("-".repeat(50));
      sanityUISorted.forEach(([comp, count], index) => {
        reportLines.push(
          `${(index + 1).toString().padStart(4)} | ${comp.padEnd(22)} | ${count.toString().padStart(12)}`,
        );
      });
    } else {
      reportLines.push("No Sanity UI components found");
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
    const sanityPct = ((data.sanityUI.totalInstances / total) * 100).toFixed(1);
    const otherPct = ((data.otherUI.totalInstances / total) * 100).toFixed(1);
    const internalPct = ((data.internal.totalInstances / total) * 100).toFixed(
      1,
    );
    const htmlPct = ((data.nativeHTML.totalInstances / total) * 100).toFixed(1);

    const sanityBar = "█".repeat(Math.round(parseFloat(sanityPct) / 2));
    const otherBar = "█".repeat(Math.round(parseFloat(otherPct) / 2));
    const internalBar = "█".repeat(Math.round(parseFloat(internalPct) / 2));
    const htmlBar = "█".repeat(Math.round(parseFloat(htmlPct) / 2));

    reportLines.push(
      `${UI_LIBRARY_NAME}:${" ".repeat(Math.max(1, 12 - UI_LIBRARY_NAME.length))}${sanityBar.padEnd(50)} ${sanityPct}%`,
    );
    reportLines.push(`Other UI:   ${otherBar.padEnd(50)} ${otherPct}%`);
    reportLines.push(`Internal:   ${internalBar.padEnd(50)} ${internalPct}%`);
    reportLines.push(`HTML Tags:  ${htmlBar.padEnd(50)} ${htmlPct}%`);

    // Internal components Sanity UI adoption
    reportLines.push("");
    reportLines.push(
      `INTERNAL COMPONENT ${UI_LIBRARY_NAME.toUpperCase()} ADOPTION`,
    );
    reportLines.push("-".repeat(50));
    const internalSanityPct =
      data.filesWithInternal > 0
        ? (
            (data.filesWithInternalUsingSanityUI / data.filesWithInternal) *
            100
          ).toFixed(1)
        : "0.0";
    reportLines.push(`Files with internal imports: ${data.filesWithInternal}`);
    reportLines.push(
      `Files also using ${UI_LIBRARY_NAME}:  ${data.filesWithInternalUsingSanityUI} (${internalSanityPct}%)`,
    );
  }

  // Cross-codebase analysis
  reportLines.push("");
  reportLines.push("═".repeat(80));
  reportLines.push("CROSS-CODEBASE ANALYSIS");
  reportLines.push("═".repeat(80));

  // Aggregate all Sanity UI components across codebases
  const allSanityUI = {};
  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;
    for (const [comp, count] of Object.entries(data.sanityUI.components)) {
      if (!allSanityUI[comp]) {
        allSanityUI[comp] = { total: 0, codebases: {} };
      }
      allSanityUI[comp].total += count;
      allSanityUI[comp].codebases[codebase] = count;
    }
  }

  reportLines.push("");
  reportLines.push(
    `MOST USED ${UI_LIBRARY_NAME.toUpperCase()} COMPONENTS (ACROSS ALL CODEBASES)`,
  );
  reportLines.push("-".repeat(80));
  reportLines.push(
    "Rank | Component              | Total    | sanity   | canvas   | huey     (instances)",
  );
  reportLines.push("-".repeat(80));

  const allSanityUISorted = Object.entries(allSanityUI)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 30);

  allSanityUISorted.forEach(([comp, data], index) => {
    const sanityCount = (data.codebases.sanity || 0).toString().padStart(8);
    const canvasCount = (data.codebases.canvas || 0).toString().padStart(8);
    const hueyCount = (data.codebases.huey || 0).toString().padStart(8);
    reportLines.push(
      `${(index + 1).toString().padStart(4)} | ${comp.padEnd(22)} | ${data.total.toString().padStart(8)} | ${sanityCount} | ${canvasCount} | ${hueyCount}`,
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
    `2. ${UI_LIBRARY_NAME} instances: ${grandTotal.sanityUI.toLocaleString()} (${grandSanityPercent}% of total)`,
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

  if (allSanityUISorted.length > 0) {
    reportLines.push(
      `6. Most used ${UI_LIBRARY_NAME} component: ${allSanityUISorted[0][0]} (${allSanityUISorted[0][1].total.toLocaleString()} instances)`,
    );
  }

  const uniqueSanityUICount = Object.keys(allSanityUI).length;
  reportLines.push(
    `7. Unique ${UI_LIBRARY_NAME} components used: ${uniqueSanityUICount}`,
  );

  reportLines.push(
    `8. Internal components using ${UI_LIBRARY_NAME}: ${grandTotal.filesWithInternalUsingSanityUI} of ${grandTotal.filesWithInternal} files (${grandInternalPercent}%)`,
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
    for (const [comp, count] of Object.entries(data.sanityUI.components)) {
      rows.push(`${codebase},${UI_LIBRARY_NAME},${comp},${count}`);
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
    note: `All numbers are JSX element instances. ${UI_LIBRARY_NAME} is the tracked UI library. Native HTML tag instances count against ${UI_LIBRARY_NAME} adoption.`,
    codebases: {},
    totals: {
      files: 0,
      sanityUIInstances: 0,
      otherUIInstances: 0,
      internalInstances: 0,
      nativeHTMLInstances: 0,
      totalInstances: 0,
      filesWithInternal: 0,
      filesWithInternalUsingSanityUI: 0,
      internalSanityUIAdoptionPercent: 0,
    },
    topSanityUIComponents: [],
  };

  const allSanityUI = {};

  for (const [codebase, data] of Object.entries(results)) {
    if (!data) continue;

    const internalAdoptionPercent =
      data.filesWithInternal > 0
        ? parseFloat(
            (
              (data.filesWithInternalUsingSanityUI / data.filesWithInternal) *
              100
            ).toFixed(1),
          )
        : 0;

    summary.codebases[codebase] = {
      fileCount: data.fileCount,
      sanityUI: {
        instances: data.sanityUI.totalInstances,
        uniqueComponents: Object.keys(data.sanityUI.components).length,
        components: data.sanityUI.components,
      },
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
      internalSanityUIAdoption: {
        filesWithInternal: data.filesWithInternal,
        filesUsingSanityUI: data.filesWithInternalUsingSanityUI,
        adoptionPercent: internalAdoptionPercent,
      },
    };

    summary.totals.files += data.fileCount;
    summary.totals.sanityUIInstances += data.sanityUI.totalInstances;
    summary.totals.otherUIInstances += data.otherUI.totalInstances;
    summary.totals.internalInstances += data.internal.totalInstances;
    summary.totals.nativeHTMLInstances += data.nativeHTML.totalInstances;
    summary.totals.totalInstances += data.total.totalInstances;
    summary.totals.filesWithInternal += data.filesWithInternal;
    summary.totals.filesWithInternalUsingSanityUI +=
      data.filesWithInternalUsingSanityUI;

    // Aggregate Sanity UI
    for (const [comp, count] of Object.entries(data.sanityUI.components)) {
      if (!allSanityUI[comp]) {
        allSanityUI[comp] = 0;
      }
      allSanityUI[comp] += count;
    }
  }

  // Calculate total internal adoption percent
  summary.totals.internalSanityUIAdoptionPercent =
    summary.totals.filesWithInternal > 0
      ? parseFloat(
          (
            (summary.totals.filesWithInternalUsingSanityUI /
              summary.totals.filesWithInternal) *
            100
          ).toFixed(1),
        )
      : 0;

  // Top Sanity UI components
  summary.topSanityUIComponents = Object.entries(allSanityUI)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name, count]) => ({ name, instances: count }));

  summary.totals.sanityUIPercentage =
    summary.totals.totalInstances > 0
      ? parseFloat(
          (
            (summary.totals.sanityUIInstances / summary.totals.totalInstances) *
            100
          ).toFixed(1),
        )
      : 0;

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
    "║         UI COMPONENT SOURCE ANALYSIS - SANITY UI vs OTHER SOURCES         ║",
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════════════════╝",
  );
  console.log("");
  console.log(
    "NOTE: All numbers are JSX element instances (not import counts).",
  );
  console.log(
    `      ${UI_LIBRARY_NAME} is the tracked UI library (from studio-analysis.config.js).`,
  );
  console.log(
    `      Native HTML tag instances count against ${UI_LIBRARY_NAME} adoption.`,
  );

  const results = {};

  // Analyze each codebase
  for (const codebase of CODEBASES) {
    results[codebase] = await analyzeCodebase(codebase);
  }

  // Generate reports
  const outputDir = path.resolve(
    __dirname,
    "../../reports/ui-component-sources",
  );
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Text report
  const textReport = generateReport(results);
  const textPath = path.join(outputDir, "ui-component-sources-report.txt");
  fs.writeFileSync(textPath, textReport);
  console.log(`\n✅ Text report saved to: ${textPath}`);

  // CSV report
  const csvReport = generateCSV(results);
  const csvPath = path.join(outputDir, "ui-component-sources-report.csv");
  fs.writeFileSync(csvPath, csvReport);
  console.log(`✅ CSV report saved to: ${csvPath}`);

  // JSON report
  const jsonReport = generateJSON(results);
  const jsonPath = path.join(outputDir, "ui-component-sources-report.json");
  fs.writeFileSync(jsonPath, jsonReport);
  console.log(`✅ JSON report saved to: ${jsonPath}`);

  // Print summary to console
  console.log("\n" + "═".repeat(80));
  console.log("QUICK SUMMARY");
  console.log("═".repeat(80));

  let totalSanityUI = 0;
  let totalOther = 0;
  let totalInternal = 0;
  let totalAll = 0;
  let totalFilesWithInternal = 0;
  let totalFilesWithInternalUsingSanityUI = 0;

  for (const [codebase, data] of Object.entries(results)) {
    if (data) {
      totalSanityUI += data.sanityUI.totalInstances;
      totalOther += data.otherUI.totalInstances;
      totalInternal += data.internal.totalInstances;
      totalAll += data.total.totalInstances;
      totalFilesWithInternal += data.filesWithInternal;
      totalFilesWithInternalUsingSanityUI +=
        data.filesWithInternalUsingSanityUI;

      const pct =
        data.total.totalInstances > 0
          ? (
              (data.sanityUI.totalInstances / data.total.totalInstances) *
              100
            ).toFixed(1)
          : "0.0";
      console.log(
        `${codebase.padEnd(10)}: ${data.sanityUI.totalInstances.toLocaleString().padStart(6)} ${UI_LIBRARY_NAME} / ${data.nativeHTML.totalInstances.toLocaleString().padStart(6)} HTML / ${data.total.totalInstances.toLocaleString().padStart(6)} total (${pct}% ${UI_LIBRARY_NAME})`,
      );
    }
  }

  console.log("-".repeat(50));
  const totalPct =
    totalAll > 0 ? ((totalSanityUI / totalAll) * 100).toFixed(1) : "0.0";
  console.log(
    `${"TOTAL".padEnd(10)}: ${totalSanityUI.toLocaleString().padStart(6)} ${UI_LIBRARY_NAME} / ${totalAll.toLocaleString().padStart(6)} total (${totalPct}%)`,
  );

  console.log("");
  console.log(`INTERNAL COMPONENTS USING ${UI_LIBRARY_NAME.toUpperCase()}:`);
  const internalPct =
    totalFilesWithInternal > 0
      ? (
          (totalFilesWithInternalUsingSanityUI / totalFilesWithInternal) *
          100
        ).toFixed(1)
      : "0.0";
  console.log(
    `${totalFilesWithInternalUsingSanityUI} of ${totalFilesWithInternal} files with internal components also use ${UI_LIBRARY_NAME} (${internalPct}%)`,
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
  generateReport,
  generateCSV,
  generateJSON,
};

// Run main function if this is the entry point
if (require.main === module) {
  main().catch(console.error);
}
