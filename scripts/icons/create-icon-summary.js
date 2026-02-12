const fs = require("fs");
const path = require("path");

// List of codebases to analyze
const CODEBASES = ["sanity", "canvas", "huey"];

function createIconSummary(codebase) {
  const inputPath = `reports/${codebase}/icons/icon-usage-report.json`;
  const outputPath = `reports/${codebase}/icons/icon-summary.csv`;
  const statsPath = `reports/${codebase}/icons/icon-analysis-stats.txt`;

  // Check if input file exists
  if (!fs.existsSync(inputPath)) {
    console.log(`⚠️  Skipping ${codebase}: ${inputPath} not found`);
    return null;
  }

  // Read the JSON file
  const jsonData = JSON.parse(fs.readFileSync(inputPath, "utf8"));

  // Prepare CSV headers and rows
  const csvRows = [];
  csvRows.push(
    "Icon Name,Total Instances,Unique Props Count,Most Used Prop,Most Used Prop Count",
  );

  // Process each icon
  const icons = [];
  let totalInstances = 0;
  let totalProps = 0;
  let totalPropUsages = 0;

  for (const [iconName, iconData] of Object.entries(jsonData)) {
    const instances = iconData.instances;
    const props = iconData.props || {};
    const propsCount = Object.keys(props).length;
    const propUsages = Object.values(props).reduce(
      (sum, count) => sum + count,
      0,
    );

    totalInstances += instances;
    totalProps += propsCount;
    totalPropUsages += propUsages;

    // Find most used prop
    let mostUsedProp = "";
    let mostUsedPropCount = 0;

    if (propsCount > 0) {
      const sortedProps = Object.entries(props).sort((a, b) => b[1] - a[1]);
      mostUsedProp = sortedProps[0][0];
      mostUsedPropCount = sortedProps[0][1];
    }

    icons.push({
      name: iconName,
      instances,
      propsCount,
      mostUsedProp,
      mostUsedPropCount,
      propUsages,
    });
  }

  // Sort by instance count (descending)
  icons.sort((a, b) => b.instances - a.instances);

  // Write summary CSV
  icons.forEach((icon) => {
    csvRows.push(
      `"${icon.name}",${icon.instances},${icon.propsCount},"${icon.mostUsedProp}",${icon.mostUsedPropCount}`,
    );
  });

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write CSV file
  fs.writeFileSync(outputPath, csvRows.join("\n"));

  // Generate detailed statistics report
  const statsLines = [];
  statsLines.push("=".repeat(70));
  statsLines.push(
    `${codebase.toUpperCase()} - ICON COMPONENT ANALYSIS - DETAILED STATISTICS`,
  );
  statsLines.push("=".repeat(70));
  statsLines.push("");

  // General Statistics
  statsLines.push("GENERAL STATISTICS");
  statsLines.push("-".repeat(70));
  statsLines.push(`Total Unique Icons:             ${icons.length}`);
  statsLines.push(`Total Icon Instances:           ${totalInstances}`);
  statsLines.push(`Total Unique Props Used:        ${totalProps}`);
  statsLines.push(`Total Prop Usages:              ${totalPropUsages}`);
  statsLines.push(
    `Avg Props per Icon Type:        ${icons.length > 0 ? (totalProps / icons.length).toFixed(2) : 0}`,
  );
  statsLines.push(
    `Avg Props per Icon Instance:    ${totalInstances > 0 ? (totalPropUsages / totalInstances).toFixed(2) : 0}`,
  );
  statsLines.push("");

  // Top icons
  statsLines.push("TOP 20 MOST USED ICONS");
  statsLines.push("-".repeat(70));
  statsLines.push(
    "Rank | Icon Name                           | Instances | Unique Props",
  );
  statsLines.push("-".repeat(70));
  icons.slice(0, 20).forEach((icon, index) => {
    const rank = (index + 1).toString().padStart(4);
    const name = icon.name.padEnd(35);
    const instances = icon.instances.toString().padStart(9);
    const props = icon.propsCount.toString().padStart(12);
    statsLines.push(`${rank} | ${name} | ${instances} | ${props}`);
  });
  statsLines.push("");

  // Distribution analysis
  const distributionRanges = [
    { label: "1 instance", min: 1, max: 1, count: 0 },
    { label: "2-5 instances", min: 2, max: 5, count: 0 },
    { label: "6-10 instances", min: 6, max: 10, count: 0 },
    { label: "11-20 instances", min: 11, max: 20, count: 0 },
    { label: "20+ instances", min: 21, max: Infinity, count: 0 },
  ];

  icons.forEach((icon) => {
    for (const range of distributionRanges) {
      if (icon.instances >= range.min && icon.instances <= range.max) {
        range.count++;
        break;
      }
    }
  });

  statsLines.push("ICON USAGE DISTRIBUTION");
  statsLines.push("-".repeat(70));
  statsLines.push("Range                | Icon Count      | Percentage");
  statsLines.push("-".repeat(70));
  distributionRanges.forEach((range) => {
    const label = range.label.padEnd(20);
    const count = range.count.toString().padStart(15);
    const percentage = ((range.count / icons.length) * 100)
      .toFixed(1)
      .padStart(10);
    statsLines.push(`${label} | ${count} | ${percentage}%`);
  });
  statsLines.push("");

  // Most common props across all icons
  const allProps = {};
  for (const [iconName, iconData] of Object.entries(jsonData)) {
    const props = iconData.props || {};
    for (const [propName, count] of Object.entries(props)) {
      if (!allProps[propName]) {
        allProps[propName] = { count: 0, icons: 0 };
      }
      allProps[propName].count += count;
      allProps[propName].icons += 1;
    }
  }

  const sortedProps = Object.entries(allProps)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count);

  if (sortedProps.length > 0) {
    statsLines.push("TOP PROPS USED WITH ICONS");
    statsLines.push("-".repeat(70));
    statsLines.push(
      "Rank | Prop Name                | Total Uses | Used with Icons",
    );
    statsLines.push("-".repeat(70));
    sortedProps.slice(0, 10).forEach((prop, index) => {
      const rank = (index + 1).toString().padStart(4);
      const name = prop.name.padEnd(24);
      const count = prop.count.toString().padStart(10);
      const iconCount = prop.icons.toString().padStart(15);
      statsLines.push(`${rank} | ${name} | ${count} | ${iconCount}`);
    });
    statsLines.push("");
  }

  // Icons by category (simple heuristic based on name)
  const categories = {
    Outline: [],
    Filled: [],
    "Chevron/Arrow": [],
    Document: [],
    Other: [],
  };

  icons.forEach((icon) => {
    if (icon.name.includes("Outline")) {
      categories["Outline"].push(icon);
    } else if (icon.name.includes("Filled")) {
      categories["Filled"].push(icon);
    } else if (icon.name.includes("Chevron") || icon.name.includes("Arrow")) {
      categories["Chevron/Arrow"].push(icon);
    } else if (icon.name.includes("Document")) {
      categories["Document"].push(icon);
    } else {
      categories["Other"].push(icon);
    }
  });

  statsLines.push("ICON CATEGORIES (by naming convention)");
  statsLines.push("-".repeat(70));
  statsLines.push("Category             | Icon Count | Total Instances");
  statsLines.push("-".repeat(70));
  for (const [category, iconList] of Object.entries(categories)) {
    if (iconList.length > 0) {
      const label = category.padEnd(20);
      const count = iconList.length.toString().padStart(10);
      const instances = iconList
        .reduce((sum, icon) => sum + icon.instances, 0)
        .toString()
        .padStart(15);
      statsLines.push(`${label} | ${count} | ${instances}`);
    }
  }
  statsLines.push("");

  statsLines.push("=".repeat(70));
  statsLines.push("Icon analysis report generated successfully!");
  statsLines.push("=".repeat(70));

  // Write stats to file
  fs.writeFileSync(statsPath, statsLines.join("\n"));

  // Console output
  console.log(`✅ ${codebase}: Icon summary created successfully`);
  console.log(`   Total icons: ${icons.length}`);
  console.log(`   Total instances: ${totalInstances}`);
  console.log(`   CSV output: ${outputPath}`);
  console.log(`   Stats output: ${statsPath}`);

  // Show top 10
  if (icons.length > 0) {
    console.log(`   Top 10 most used icons:`);
    icons.slice(0, 10).forEach((icon, index) => {
      console.log(
        `     ${index + 1}. ${icon.name}: ${icon.instances} instances`,
      );
    });
  }

  return {
    codebase,
    iconCount: icons.length,
    totalInstances,
    outputPath,
    statsPath,
    topIcons: icons.slice(0, 10),
  };
}

function main() {
  console.log(
    "╔════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║         CREATING ICON SUMMARY AND STATISTICS FILES            ║",
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════╝\n",
  );

  const results = [];

  // Process each codebase
  CODEBASES.forEach((codebase) => {
    console.log(`\n📊 Processing ${codebase}...`);
    const result = createIconSummary(codebase);
    if (result) {
      results.push(result);
    }
  });

  // Summary
  if (results.length > 0) {
    console.log("\n" + "═".repeat(70));
    console.log("SUMMARY");
    console.log("═".repeat(70));

    const totalIcons = results.reduce((sum, r) => sum + r.iconCount, 0);
    const totalInstances = results.reduce(
      (sum, r) => sum + r.totalInstances,
      0,
    );

    console.log(`Total codebases processed: ${results.length}`);
    console.log(`Total unique icons across all codebases: ${totalIcons}`);
    console.log(`Total icon instances: ${totalInstances}\n`);
  } else {
    console.log(
      "\n⚠️  No icon reports found. Run 'npm run scan:icons' first.\n",
    );
  }
}

main();
