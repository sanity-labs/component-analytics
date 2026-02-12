#!/usr/bin/env node

/**
 * Custom Icon Props Analyzer
 *
 * This script performs deep analysis of icon component usage in the Sanity Studio codebase,
 * specifically tracking icons passed as props (e.g., icon={IconName}, prefix={SomeIcon}).
 *
 * Unlike React Scanner which only detects JSX usage (<Icon />), this analyzer:
 * - Tracks icon imports from @sanity/icons
 * - Finds icon references in prop assignments
 * - Maps icons to the components that use them
 * - Generates comprehensive statistics and reports
 */

const fs = require("fs");
const path = require("path");
const glob = require("glob");

// Configuration
const CONFIG = {
  sourceDir: "./sanity",
  outputDir: "./reports/icons",
  filePattern: "**/*.{ts,tsx}",
  iconPackage: "@sanity/icons",
  excludePatterns: [
    "**/node_modules/**",
    "**/__tests__/**",
    "**/*.test.{ts,tsx}",
    "**/*.spec.{ts,tsx}",
    "**/dist/**",
    "**/build/**",
    "**/lib/**",
    "**/es/**",
    "**/.cache/**",
  ],
};

// Icon usage data structures
const iconUsage = new Map(); // iconName -> { files: [], propUsages: [], jsxUsages: [], total: number }
const fileAnalysis = new Map(); // filePath -> { icons: [], components: [] }
const propPatterns = new Map(); // propName -> count
const componentIconMap = new Map(); // componentName -> Set(iconNames)

/**
 * Extract icon imports from a file
 */
function extractIconImports(content, filePath) {
  const imports = [];

  // Match: import { Icon1, Icon2, ... } from '@sanity/icons'
  const importRegex =
    /import\s*{\s*([^}]+)\s*}\s*from\s*['"]@sanity\/icons['"]/g;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const importList = match[1];
    // Split by comma and clean up
    const icons = importList
      .split(",")
      .map((i) => i.trim())
      .filter((i) => i && !i.startsWith("type ")) // Exclude type imports
      .map((i) => {
        // Handle: IconName as AliasName
        const parts = i.split(/\s+as\s+/);
        return {
          original: parts[0].trim(),
          alias: parts[1] ? parts[1].trim() : parts[0].trim(),
        };
      });

    imports.push(...icons);
  }

  // Also handle default imports (rare but possible)
  const defaultImportRegex = /import\s+(\w+)\s+from\s*['"]@sanity\/icons['"]/g;
  while ((match = defaultImportRegex.exec(content)) !== null) {
    imports.push({
      original: match[1],
      alias: match[1],
    });
  }

  return imports;
}

/**
 * Find icon usage in props (e.g., icon={IconName}, prefix={SomeIcon})
 */
function findIconPropUsage(content, icons, filePath) {
  const usages = [];

  if (icons.length === 0) return usages;

  // Create a set of icon names (both original and alias)
  const iconNames = new Set();
  icons.forEach((icon) => {
    iconNames.add(icon.original);
    iconNames.add(icon.alias);
  });

  // Pattern 1: prop={IconName}
  const propRegex = /(\w+)=\{(\w+)\}/g;
  let match;

  while ((match = propRegex.exec(content)) !== null) {
    const propName = match[1];
    const value = match[2];

    if (iconNames.has(value)) {
      usages.push({
        type: "prop",
        propName,
        iconName: value,
        pattern: match[0],
      });

      // Track prop patterns
      propPatterns.set(propName, (propPatterns.get(propName) || 0) + 1);
    }
  }

  // Pattern 2: prop: IconName (in object literals)
  const objectPropRegex = /(\w+):\s*(\w+)/g;
  while ((match = objectPropRegex.exec(content)) !== null) {
    const propName = match[1];
    const value = match[2];

    if (iconNames.has(value)) {
      usages.push({
        type: "object-prop",
        propName,
        iconName: value,
        pattern: match[0],
      });

      propPatterns.set(propName, (propPatterns.get(propName) || 0) + 1);
    }
  }

  // Pattern 3: Array of icons [Icon1, Icon2]
  const arrayRegex = /\[([^\]]+)\]/g;
  while ((match = arrayRegex.exec(content)) !== null) {
    const arrayContent = match[1];
    const items = arrayContent.split(",").map((i) => i.trim());

    items.forEach((item) => {
      if (iconNames.has(item)) {
        usages.push({
          type: "array",
          iconName: item,
          pattern: `[...${item}...]`,
        });
      }
    });
  }

  return usages;
}

/**
 * Find JSX usage of icons (e.g., <Icon />)
 */
function findIconJSXUsage(content, icons) {
  const usages = [];

  if (icons.length === 0) return usages;

  const iconNames = new Set();
  icons.forEach((icon) => {
    iconNames.add(icon.original);
    iconNames.add(icon.alias);
  });

  // Pattern: <IconName ... />
  iconNames.forEach((iconName) => {
    const jsxRegex = new RegExp(`<${iconName}[\\s/>]`, "g");
    const matches = content.match(jsxRegex);

    if (matches) {
      usages.push({
        type: "jsx",
        iconName,
        count: matches.length,
      });
    }
  });

  return usages;
}

/**
 * Extract component definitions from file
 */
function extractComponents(content, filePath) {
  const components = [];

  // Pattern 1: export const ComponentName = ...
  const constRegex = /export\s+const\s+(\w+)\s*[:=]/g;
  let match;

  while ((match = constRegex.exec(content)) !== null) {
    const name = match[1];
    // Check if it's likely a component (starts with uppercase)
    if (/^[A-Z]/.test(name)) {
      components.push(name);
    }
  }

  // Pattern 2: export function ComponentName
  const functionRegex = /export\s+function\s+(\w+)/g;
  while ((match = functionRegex.exec(content)) !== null) {
    const name = match[1];
    if (/^[A-Z]/.test(name)) {
      components.push(name);
    }
  }

  // Pattern 3: export default ComponentName or export default function ComponentName
  const defaultRegex = /export\s+default\s+(?:function\s+)?(\w+)/g;
  while ((match = defaultRegex.exec(content)) !== null) {
    const name = match[1];
    if (/^[A-Z]/.test(name)) {
      components.push(name);
    }
  }

  return [...new Set(components)]; // Remove duplicates
}

/**
 * Analyze a single file
 */
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const relativePath = path.relative(CONFIG.sourceDir, filePath);

  // Extract icon imports
  const icons = extractIconImports(content, filePath);

  if (icons.length === 0) {
    return; // No icons in this file
  }

  // Find prop and JSX usages
  const propUsages = findIconPropUsage(content, icons, filePath);
  const jsxUsages = findIconJSXUsage(content, icons);

  // Extract components defined in this file
  const components = extractComponents(content, filePath);

  // Record usage data
  icons.forEach((icon) => {
    const iconName = icon.original;

    if (!iconUsage.has(iconName)) {
      iconUsage.set(iconName, {
        files: new Set(),
        propUsages: [],
        jsxUsages: [],
        total: 0,
      });
    }

    const data = iconUsage.get(iconName);
    data.files.add(relativePath);
  });

  // Record prop usages
  propUsages.forEach((usage) => {
    const iconName = usage.iconName;
    const data = iconUsage.get(iconName);
    if (data) {
      data.propUsages.push({
        file: relativePath,
        propName: usage.propName,
        type: usage.type,
      });
      data.total++;
    }

    // Map icons to components
    components.forEach((component) => {
      if (!componentIconMap.has(component)) {
        componentIconMap.set(component, new Set());
      }
      componentIconMap.get(component).add(iconName);
    });
  });

  // Record JSX usages
  jsxUsages.forEach((usage) => {
    const iconName = usage.iconName;
    const data = iconUsage.get(iconName);
    if (data) {
      data.jsxUsages.push({
        file: relativePath,
        count: usage.count,
      });
      data.total += usage.count;
    }
  });

  // Record file analysis
  fileAnalysis.set(relativePath, {
    icons: icons.map((i) => i.original),
    components,
    propUsageCount: propUsages.length,
    jsxUsageCount: jsxUsages.reduce((sum, u) => sum + u.count, 0),
  });
}

/**
 * Generate statistics
 */
function generateStats() {
  const stats = {
    totalUniqueIcons: iconUsage.size,
    totalIconInstances: 0,
    totalPropUsages: 0,
    totalJSXUsages: 0,
    filesWithIcons: fileAnalysis.size,
    componentsUsingIcons: componentIconMap.size,
    avgIconsPerFile: 0,
    avgIconsPerComponent: 0,
    topIcons: [],
    topPropNames: [],
    topComponents: [],
  };

  // Calculate totals
  iconUsage.forEach((data) => {
    stats.totalIconInstances += data.total;
    stats.totalPropUsages += data.propUsages.length;
    stats.totalJSXUsages += data.jsxUsages.reduce((sum, u) => sum + u.count, 0);
  });

  // Calculate averages
  if (fileAnalysis.size > 0) {
    const totalIconsInFiles = Array.from(fileAnalysis.values()).reduce(
      (sum, file) => sum + file.icons.length,
      0,
    );
    stats.avgIconsPerFile = (totalIconsInFiles / fileAnalysis.size).toFixed(2);
  }

  if (componentIconMap.size > 0) {
    const totalIconsInComponents = Array.from(componentIconMap.values()).reduce(
      (sum, icons) => sum + icons.size,
      0,
    );
    stats.avgIconsPerComponent = (
      totalIconsInComponents / componentIconMap.size
    ).toFixed(2);
  }

  // Top icons by usage
  stats.topIcons = Array.from(iconUsage.entries())
    .map(([name, data]) => ({
      name,
      total: data.total,
      files: data.files.size,
      propUsages: data.propUsages.length,
      jsxUsages: data.jsxUsages.length,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 50);

  // Top prop names
  stats.topPropNames = Array.from(propPatterns.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Top components by icon usage
  stats.topComponents = Array.from(componentIconMap.entries())
    .map(([name, icons]) => ({
      name,
      iconCount: icons.size,
      icons: Array.from(icons),
    }))
    .sort((a, b) => b.iconCount - a.iconCount)
    .slice(0, 30);

  return stats;
}

/**
 * Generate detailed report
 */
function generateDetailedReport() {
  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceDirectory: CONFIG.sourceDir,
      filesAnalyzed: fileAnalysis.size,
      analysisMethod: "Custom AST-like pattern matching",
    },
    statistics: generateStats(),
    iconDetails: {},
    fileDetails: {},
    componentDetails: {},
  };

  // Icon details
  iconUsage.forEach((data, iconName) => {
    report.iconDetails[iconName] = {
      totalUsages: data.total,
      filesUsedIn: Array.from(data.files),
      propUsages: data.propUsages,
      jsxUsages: data.jsxUsages,
      propUsageCount: data.propUsages.length,
      jsxUsageCount: data.jsxUsages.reduce((sum, u) => sum + u.count, 0),
    };
  });

  // File details
  fileAnalysis.forEach((data, filePath) => {
    report.fileDetails[filePath] = data;
  });

  // Component details
  componentIconMap.forEach((icons, componentName) => {
    report.componentDetails[componentName] = {
      icons: Array.from(icons),
      iconCount: icons.size,
    };
  });

  return report;
}

/**
 * Save reports
 */
function saveReports(report) {
  // Ensure output directory exists
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  // 1. Full detailed JSON report
  const fullReportPath = path.join(
    CONFIG.outputDir,
    "icon-props-analysis-full.json",
  );
  fs.writeFileSync(fullReportPath, JSON.stringify(report, null, 2));
  console.log(`✓ Full report saved to: ${fullReportPath}`);

  // 2. Statistics summary JSON
  const statsPath = path.join(CONFIG.outputDir, "icon-props-statistics.json");
  fs.writeFileSync(statsPath, JSON.stringify(report.statistics, null, 2));
  console.log(`✓ Statistics saved to: ${statsPath}`);

  // 3. Human-readable summary
  const summaryPath = path.join(CONFIG.outputDir, "icon-props-summary.txt");
  const summary = generateTextSummary(report);
  fs.writeFileSync(summaryPath, summary);
  console.log(`✓ Summary saved to: ${summaryPath}`);

  // 4. CSV report for spreadsheet analysis
  const csvPath = path.join(CONFIG.outputDir, "icon-props-analysis.csv");
  const csv = generateCSV(report);
  fs.writeFileSync(csvPath, csv);
  console.log(`✓ CSV report saved to: ${csvPath}`);

  // 5. Component-Icon mapping
  const mappingPath = path.join(
    CONFIG.outputDir,
    "component-icon-mapping.json",
  );
  const mapping = Object.fromEntries(componentIconMap);
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
  console.log(`✓ Component mapping saved to: ${mappingPath}`);
}

/**
 * Generate human-readable text summary
 */
function generateTextSummary(report) {
  const { statistics } = report;
  const lines = [];

  lines.push("=".repeat(80));
  lines.push("ICON PROPS ANALYSIS SUMMARY");
  lines.push("=".repeat(80));
  lines.push("");
  lines.push(`Generated: ${report.metadata.generatedAt}`);
  lines.push(`Files Analyzed: ${report.metadata.filesAnalyzed}`);
  lines.push("");

  lines.push("OVERALL STATISTICS");
  lines.push("-".repeat(80));
  lines.push(`Total Unique Icons: ${statistics.totalUniqueIcons}`);
  lines.push(`Total Icon Instances: ${statistics.totalIconInstances}`);
  lines.push(
    `  - As Props: ${statistics.totalPropUsages} (${((statistics.totalPropUsages / statistics.totalIconInstances) * 100).toFixed(1)}%)`,
  );
  lines.push(
    `  - As JSX: ${statistics.totalJSXUsages} (${((statistics.totalJSXUsages / statistics.totalIconInstances) * 100).toFixed(1)}%)`,
  );
  lines.push(`Files with Icons: ${statistics.filesWithIcons}`);
  lines.push(`Components Using Icons: ${statistics.componentsUsingIcons}`);
  lines.push(`Average Icons per File: ${statistics.avgIconsPerFile}`);
  lines.push(`Average Icons per Component: ${statistics.avgIconsPerComponent}`);
  lines.push("");

  lines.push("TOP 20 MOST USED ICONS");
  lines.push("-".repeat(80));
  lines.push(
    sprintf(
      "%-4s %-40s %8s %8s %8s %8s",
      "Rank",
      "Icon Name",
      "Total",
      "Files",
      "Props",
      "JSX",
    ),
  );
  lines.push("-".repeat(80));
  statistics.topIcons.slice(0, 20).forEach((icon, index) => {
    lines.push(
      sprintf(
        "%-4s %-40s %8d %8d %8d %8d",
        `${index + 1}.`,
        icon.name,
        icon.total,
        icon.files,
        icon.propUsages,
        icon.jsxUsages,
      ),
    );
  });
  lines.push("");

  lines.push("TOP 20 PROP NAMES FOR ICON USAGE");
  lines.push("-".repeat(80));
  lines.push(sprintf("%-4s %-50s %10s", "Rank", "Prop Name", "Count"));
  lines.push("-".repeat(80));
  statistics.topPropNames.forEach((prop, index) => {
    lines.push(
      sprintf("%-4s %-50s %10d", `${index + 1}.`, prop.name, prop.count),
    );
  });
  lines.push("");

  lines.push("TOP 20 COMPONENTS BY ICON COUNT");
  lines.push("-".repeat(80));
  lines.push(sprintf("%-4s %-50s %10s", "Rank", "Component Name", "Icons"));
  lines.push("-".repeat(80));
  statistics.topComponents.slice(0, 20).forEach((comp, index) => {
    lines.push(
      sprintf("%-4s %-50s %10d", `${index + 1}.`, comp.name, comp.iconCount),
    );
  });
  lines.push("");

  lines.push("KEY INSIGHTS");
  lines.push("-".repeat(80));
  const propPercentage = (
    (statistics.totalPropUsages / statistics.totalIconInstances) *
    100
  ).toFixed(1);
  lines.push(`• ${propPercentage}% of icon usage is through props (not JSX)`);
  lines.push(
    `• This explains why React Scanner only detected ~47% of icon usage`,
  );
  lines.push(
    `• Top prop name: "${statistics.topPropNames[0]?.name}" used ${statistics.topPropNames[0]?.count} times`,
  );
  lines.push(
    `• Most icon-heavy component: "${statistics.topComponents[0]?.name}" with ${statistics.topComponents[0]?.iconCount} different icons`,
  );
  lines.push("");

  lines.push("=".repeat(80));

  return lines.join("\n");
}

/**
 * Simple sprintf-like function for formatting
 */
function sprintf(format, ...args) {
  let i = 0;
  return format.replace(/%-?(\d+)s|%(\d+)d/g, (match, strWidth, numWidth) => {
    const arg = String(args[i++] || "");
    const width = parseInt(strWidth || numWidth);
    const isLeftAlign = match.startsWith("%-");

    if (match.includes("d")) {
      return arg.padStart(width, " ");
    }

    if (isLeftAlign) {
      return arg.padEnd(width, " ");
    }
    return arg.padStart(width, " ");
  });
}

/**
 * Generate CSV report
 */
function generateCSV(report) {
  const lines = [];

  // Header
  lines.push(
    "Icon Name,Total Usages,Files,Prop Usages,JSX Usages,Prop %,JSX %",
  );

  // Data rows
  report.statistics.topIcons.forEach((icon) => {
    const propPercent = ((icon.propUsages / icon.total) * 100).toFixed(1);
    const jsxPercent = ((icon.jsxUsages / icon.total) * 100).toFixed(1);

    lines.push(
      [
        icon.name,
        icon.total,
        icon.files,
        icon.propUsages,
        icon.jsxUsages,
        propPercent,
        jsxPercent,
      ].join(","),
    );
  });

  return lines.join("\n");
}

/**
 * Main execution
 */
function main() {
  console.log("Starting Icon Props Analysis...\n");

  // Find all TypeScript/TSX files
  const pattern = path.join(CONFIG.sourceDir, CONFIG.filePattern);
  const files = glob.sync(pattern, {
    ignore: CONFIG.excludePatterns,
    nodir: true,
  });

  console.log(`Found ${files.length} files to analyze\n`);

  // Analyze each file
  let analyzed = 0;
  files.forEach((file, index) => {
    try {
      analyzeFile(file);
      analyzed++;

      // Progress indicator
      if ((index + 1) % 100 === 0) {
        console.log(`Progress: ${index + 1}/${files.length} files analyzed...`);
      }
    } catch (error) {
      console.error(`Error analyzing ${file}:`, error.message);
    }
  });

  console.log(`\nAnalyzed ${analyzed} files\n`);

  // Generate and save reports
  const report = generateDetailedReport();
  saveReports(report);

  console.log("\n✓ Analysis complete!");
  console.log("\nQuick Summary:");
  console.log(`  • Unique Icons: ${report.statistics.totalUniqueIcons}`);
  console.log(`  • Total Instances: ${report.statistics.totalIconInstances}`);
  console.log(
    `  • Prop Usage: ${report.statistics.totalPropUsages} (${((report.statistics.totalPropUsages / report.statistics.totalIconInstances) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  • JSX Usage: ${report.statistics.totalJSXUsages} (${((report.statistics.totalJSXUsages / report.statistics.totalIconInstances) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  • Components with Icons: ${report.statistics.componentsUsingIcons}`,
  );
}

// Run the analysis
main();
