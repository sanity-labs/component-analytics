#!/usr/bin/env node

/**
 * Aggregate Icon Reports
 *
 * Combines icon-analysis-comprehensive.csv files from all codebases
 * into a single aggregated report with totals and cross-codebase insights.
 */

const fs = require("fs");
const path = require("path");

// List of codebases to aggregate
const CODEBASES = ["sanity", "canvas", "huey"];

// Configuration
const CONFIG = {
  outputDir: "./reports",
  outputFile: "icon-analysis-aggregate.csv",
  statsFile: "icon-analysis-aggregate-stats.txt",
};

/**
 * Parse a CSV file and return icon data
 */
function parseIconCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim());

  // Skip header
  const dataLines = lines.slice(1);

  const icons = new Map();

  dataLines.forEach((line) => {
    // Parse CSV line (handle quoted fields)
    const matches = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
    if (!matches || matches.length < 8) return;

    const [
      name,
      totalInstances,
      filesUsingIcon,
      propUsageCount,
      jsxUsageCount,
      propUsagePercent,
      jsxUsagePercent,
      primaryUsage,
    ] = matches.map((field) => field.replace(/^"|"$/g, "").trim());

    icons.set(name, {
      name,
      totalInstances: parseInt(totalInstances) || 0,
      filesUsingIcon: parseInt(filesUsingIcon) || 0,
      propUsageCount: parseInt(propUsageCount) || 0,
      jsxUsageCount: parseInt(jsxUsageCount) || 0,
      propUsagePercent: parseFloat(propUsagePercent) || 0,
      jsxUsagePercent: parseFloat(jsxUsagePercent) || 0,
      primaryUsage,
    });
  });

  return icons;
}

/**
 * Aggregate icon data from all codebases
 */
function aggregateIconData() {
  const aggregatedIcons = new Map();
  const codebaseData = {};
  let totalCodebasesProcessed = 0;

  console.log(
    "\n╔════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║           AGGREGATING ICON REPORTS FROM ALL CODEBASES         ║",
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════╝\n",
  );

  CODEBASES.forEach((codebase) => {
    const csvPath = `reports/${codebase}/icons/icon-analysis-comprehensive.csv`;

    console.log(`📂 Reading ${codebase}...`);

    const icons = parseIconCSV(csvPath);

    if (!icons) {
      console.log(`   ⚠️  No report found at ${csvPath}\n`);
      return;
    }

    totalCodebasesProcessed++;
    codebaseData[codebase] = {
      iconCount: icons.size,
      totalInstances: 0,
      totalFiles: 0,
      totalPropUsage: 0,
      totalJSXUsage: 0,
    };

    console.log(`   ✓ Found ${icons.size} icons\n`);

    // Aggregate data
    icons.forEach((icon) => {
      // Update codebase stats
      codebaseData[codebase].totalInstances += icon.totalInstances;
      codebaseData[codebase].totalFiles += icon.filesUsingIcon;
      codebaseData[codebase].totalPropUsage += icon.propUsageCount;
      codebaseData[codebase].totalJSXUsage += icon.jsxUsageCount;

      // Aggregate across codebases
      if (aggregatedIcons.has(icon.name)) {
        const existing = aggregatedIcons.get(icon.name);
        existing.totalInstances += icon.totalInstances;
        existing.filesUsingIcon += icon.filesUsingIcon;
        existing.propUsageCount += icon.propUsageCount;
        existing.jsxUsageCount += icon.jsxUsageCount;
        existing.codebases.push(codebase);
        existing.codebaseCount++;
      } else {
        aggregatedIcons.set(icon.name, {
          name: icon.name,
          totalInstances: icon.totalInstances,
          filesUsingIcon: icon.filesUsingIcon,
          propUsageCount: icon.propUsageCount,
          jsxUsageCount: icon.jsxUsageCount,
          codebases: [codebase],
          codebaseCount: 1,
        });
      }
    });
  });

  return { aggregatedIcons, codebaseData, totalCodebasesProcessed };
}

/**
 * Generate aggregated CSV report
 */
function generateAggregatedCSV(aggregatedIcons) {
  const lines = [];

  // Header with comprehensive columns
  lines.push(
    [
      "Icon Name",
      "Total Instances",
      "Files Using Icon",
      "Prop Usage Count",
      "JSX Usage Count",
      "Prop Usage %",
      "JSX Usage %",
      "Primary Usage",
      "Used in Codebases",
      "Codebase Count",
    ].join(","),
  );

  // Convert to array and calculate percentages
  const iconArray = Array.from(aggregatedIcons.values()).map((icon) => {
    const total = icon.totalInstances;
    const propPercent =
      total > 0 ? ((icon.propUsageCount / total) * 100).toFixed(1) : "0.0";
    const jsxPercent =
      total > 0 ? ((icon.jsxUsageCount / total) * 100).toFixed(1) : "0.0";
    const primaryUsage =
      icon.propUsageCount > icon.jsxUsageCount
        ? "Props"
        : icon.jsxUsageCount > icon.propUsageCount
          ? "JSX"
          : "Equal";

    return {
      ...icon,
      propPercent,
      jsxPercent,
      primaryUsage,
    };
  });

  // Sort by total instances (descending)
  iconArray.sort((a, b) => b.totalInstances - a.totalInstances);

  // Data rows
  iconArray.forEach((icon) => {
    lines.push(
      [
        icon.name,
        icon.totalInstances,
        icon.filesUsingIcon,
        icon.propUsageCount,
        icon.jsxUsageCount,
        icon.propPercent,
        icon.jsxPercent,
        icon.primaryUsage,
        `"${icon.codebases.join(", ")}"`,
        icon.codebaseCount,
      ].join(","),
    );
  });

  return { csv: lines.join("\n"), iconArray };
}

/**
 * Generate statistics report
 */
function generateStatsReport(
  iconArray,
  codebaseData,
  totalCodebasesProcessed,
) {
  const lines = [];

  lines.push("=".repeat(70));
  lines.push("AGGREGATED ICON ANALYSIS - ALL CODEBASES");
  lines.push("=".repeat(70));
  lines.push("");

  // Overall Statistics
  const totalUniqueIcons = iconArray.length;
  const totalInstances = iconArray.reduce(
    (sum, icon) => sum + icon.totalInstances,
    0,
  );
  const totalPropUsage = iconArray.reduce(
    (sum, icon) => sum + icon.propUsageCount,
    0,
  );
  const totalJSXUsage = iconArray.reduce(
    (sum, icon) => sum + icon.jsxUsageCount,
    0,
  );
  const totalFiles = iconArray.reduce(
    (sum, icon) => sum + icon.filesUsingIcon,
    0,
  );

  lines.push("OVERALL STATISTICS");
  lines.push("-".repeat(70));
  lines.push(`Codebases Analyzed:          ${totalCodebasesProcessed}`);
  lines.push(`Total Unique Icons:          ${totalUniqueIcons}`);
  lines.push(`Total Icon Instances:        ${totalInstances}`);
  lines.push(`Total Files with Icons:      ${totalFiles}`);
  lines.push(
    `Total Prop Usage:            ${totalPropUsage} (${((totalPropUsage / totalInstances) * 100).toFixed(1)}%)`,
  );
  lines.push(
    `Total JSX Usage:             ${totalJSXUsage} (${((totalJSXUsage / totalInstances) * 100).toFixed(1)}%)`,
  );
  lines.push(
    `Avg Instances per Icon:      ${(totalInstances / totalUniqueIcons).toFixed(1)}`,
  );
  lines.push("");

  // Per-Codebase Breakdown
  lines.push("PER-CODEBASE BREAKDOWN");
  lines.push("-".repeat(70));
  lines.push(
    "Codebase     | Icons | Instances | Files | Prop Usage | JSX Usage",
  );
  lines.push("-".repeat(70));
  Object.entries(codebaseData).forEach(([codebase, data]) => {
    const name = codebase.padEnd(12);
    const icons = data.iconCount.toString().padStart(5);
    const instances = data.totalInstances.toString().padStart(9);
    const files = data.totalFiles.toString().padStart(5);
    const propUsage = data.totalPropUsage.toString().padStart(10);
    const jsxUsage = data.totalJSXUsage.toString().padStart(9);
    lines.push(
      `${name} | ${icons} | ${instances} | ${files} | ${propUsage} | ${jsxUsage}`,
    );
  });
  lines.push("");

  // Top 20 Most Used Icons (Across All Codebases)
  lines.push("TOP 20 MOST USED ICONS (ACROSS ALL CODEBASES)");
  lines.push("-".repeat(70));
  lines.push(
    "Rank | Icon Name                           | Instances | Codebases",
  );
  lines.push("-".repeat(70));
  iconArray.slice(0, 20).forEach((icon, index) => {
    const rank = (index + 1).toString().padStart(4);
    const name = icon.name.padEnd(35);
    const instances = icon.totalInstances.toString().padStart(9);
    const codebases = icon.codebaseCount.toString().padStart(9);
    lines.push(`${rank} | ${name} | ${instances} | ${codebases}`);
  });
  lines.push("");

  // Icons Used in Multiple Codebases
  const sharedIcons = iconArray.filter((icon) => icon.codebaseCount > 1);
  lines.push(
    `ICONS USED IN MULTIPLE CODEBASES (${sharedIcons.length} icons)`,
  );
  lines.push("-".repeat(70));
  lines.push(
    "Icon Name                           | Instances | Used In",
  );
  lines.push("-".repeat(70));
  sharedIcons.slice(0, 20).forEach((icon) => {
    const name = icon.name.padEnd(35);
    const instances = icon.totalInstances.toString().padStart(9);
    const usedIn = icon.codebases.join(", ");
    lines.push(`${name} | ${instances} | ${usedIn}`);
  });
  lines.push("");

  // Icons Unique to Single Codebase
  const uniqueIcons = iconArray.filter((icon) => icon.codebaseCount === 1);
  lines.push(`ICONS UNIQUE TO SINGLE CODEBASE (${uniqueIcons.length} icons)`);
  lines.push("-".repeat(70));
  CODEBASES.forEach((codebase) => {
    const codebaseUnique = uniqueIcons.filter((icon) =>
      icon.codebases.includes(codebase),
    );
    if (codebaseUnique.length > 0) {
      lines.push(`${codebase}: ${codebaseUnique.length} unique icons`);
    }
  });
  lines.push("");

  // Usage Pattern Analysis
  const propDominant = iconArray.filter(
    (icon) => icon.propUsageCount > icon.jsxUsageCount,
  );
  const jsxDominant = iconArray.filter(
    (icon) => icon.jsxUsageCount > icon.propUsageCount,
  );
  const equalUsage = iconArray.filter(
    (icon) => icon.propUsageCount === icon.jsxUsageCount,
  );

  lines.push("USAGE PATTERN ANALYSIS");
  lines.push("-".repeat(70));
  lines.push(
    `Prop-Dominant Icons:         ${propDominant.length} (${((propDominant.length / totalUniqueIcons) * 100).toFixed(1)}%)`,
  );
  lines.push(
    `JSX-Dominant Icons:          ${jsxDominant.length} (${((jsxDominant.length / totalUniqueIcons) * 100).toFixed(1)}%)`,
  );
  lines.push(
    `Equal Usage Icons:           ${equalUsage.length} (${((equalUsage.length / totalUniqueIcons) * 100).toFixed(1)}%)`,
  );
  lines.push("");

  // Key Insights
  lines.push("KEY INSIGHTS");
  lines.push("-".repeat(70));
  lines.push(
    `1. ${sharedIcons.length} icons (${((sharedIcons.length / totalUniqueIcons) * 100).toFixed(1)}%) are used across multiple codebases`,
  );
  lines.push(
    `2. ${uniqueIcons.length} icons (${((uniqueIcons.length / totalUniqueIcons) * 100).toFixed(1)}%) are unique to a single codebase`,
  );
  lines.push(
    `3. Prop usage accounts for ${((totalPropUsage / totalInstances) * 100).toFixed(1)}% of all icon usage`,
  );
  lines.push(
    `4. Top 10 icons account for ${((iconArray.slice(0, 10).reduce((sum, icon) => sum + icon.totalInstances, 0) / totalInstances) * 100).toFixed(1)}% of total usage`,
  );
  lines.push(
    `5. Average icon appears in ${(iconArray.reduce((sum, icon) => sum + icon.codebaseCount, 0) / totalUniqueIcons).toFixed(2)} codebases`,
  );
  lines.push("");

  lines.push("=".repeat(70));
  lines.push("Aggregated report generated successfully!");
  lines.push("=".repeat(70));

  return lines.join("\n");
}

/**
 * Main execution
 */
function main() {
  // Aggregate data
  const { aggregatedIcons, codebaseData, totalCodebasesProcessed } =
    aggregateIconData();

  if (totalCodebasesProcessed === 0) {
    console.log(
      "\n⚠️  No icon reports found. Run 'npm run analyze:icons' first.\n",
    );
    return;
  }

  console.log("📊 Generating aggregated reports...\n");

  // Ensure output directory exists
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  // Generate CSV
  const { csv, iconArray } = generateAggregatedCSV(aggregatedIcons);
  const csvPath = path.join(CONFIG.outputDir, CONFIG.outputFile);
  fs.writeFileSync(csvPath, csv);

  // Generate stats
  const stats = generateStatsReport(
    iconArray,
    codebaseData,
    totalCodebasesProcessed,
  );
  const statsPath = path.join(CONFIG.outputDir, CONFIG.statsFile);
  fs.writeFileSync(statsPath, stats);

  // Summary
  console.log("═".repeat(70));
  console.log("AGGREGATION COMPLETE");
  console.log("═".repeat(70));
  console.log();
  console.log(`✅ Aggregated ${totalCodebasesProcessed} codebases`);
  console.log(`✅ Total unique icons: ${iconArray.length}`);
  console.log(
    `✅ Total instances: ${iconArray.reduce((sum, icon) => sum + icon.totalInstances, 0)}`,
  );
  console.log();
  console.log("📂 Output files:");
  console.log(`   CSV:   ${csvPath}`);
  console.log(`   Stats: ${statsPath}`);
  console.log();
  console.log("💡 Open the CSV in a spreadsheet for detailed analysis:");
  console.log(`   open ${csvPath}`);
  console.log();
}

// Run the aggregator
main();
