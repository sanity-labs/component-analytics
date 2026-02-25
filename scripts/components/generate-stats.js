const fs = require("fs");
const path = require("path");

// List of codebases to analyze
const CODEBASES = ["sanity", "canvas", "huey"];

function generateStats(codebase) {
  const inputPath = `reports/${codebase}/all-components/all-components.json`;
  const outputPath = `reports/${codebase}/all-components/stats.md`;

  // Check if input file exists
  if (!fs.existsSync(inputPath)) {
    console.log(`⚠️  Skipping ${codebase}: ${inputPath} not found`);
    return null;
  }

  // Read the JSON file
  const jsonData = JSON.parse(fs.readFileSync(inputPath, "utf8"));

  const lines = [];
  lines.push(`# ${codebase} — Component Analysis — Detailed Statistics`);
  lines.push("");

  // Calculate statistics
  const components = [];
  let totalInstances = 0;
  let totalProps = 0;
  let totalPropUsages = 0;

  for (const [componentName, componentData] of Object.entries(jsonData)) {
    const instances = componentData.instances;
    const props = componentData.props || {};
    const propsCount = Object.keys(props).length;
    const propUsages = Object.values(props).reduce(
      (sum, count) => sum + count,
      0,
    );

    totalInstances += instances;
    totalProps += propsCount;
    totalPropUsages += propUsages;

    components.push({
      name: componentName,
      instances,
      propsCount,
      propUsages,
      avgPropsPerInstance:
        propsCount > 0 ? (propUsages / instances).toFixed(2) : 0,
    });
  }

  // Sort by instance count
  components.sort((a, b) => b.instances - a.instances);

  // General Statistics
  lines.push("## General Statistics");
  lines.push("");
  lines.push(`- **Total Unique Components:** ${components.length}`);
  lines.push(`- **Total Component Instances:** ${totalInstances}`);
  lines.push(`- **Total Unique Props Used:** ${totalProps}`);
  lines.push(`- **Total Prop Usages:** ${totalPropUsages}`);
  lines.push(
    `- **Avg Props per Component Type:** ${(totalProps / components.length).toFixed(2)}`,
  );
  lines.push(
    `- **Avg Props per Instance:** ${(totalPropUsages / totalInstances).toFixed(2)}`,
  );
  lines.push("");

  // Top 20 Most Used Components
  lines.push("## Top 20 Most Used Components");
  lines.push("");
  lines.push(
    "| Rank | Component Name | Instances | Unique Props | Avg Props/Use |",
  );
  lines.push("| ---: | --- | ---: | ---: | ---: |");
  components.slice(0, 20).forEach((comp, index) => {
    lines.push(
      `| ${index + 1} | ${comp.name} | ${comp.instances} | ${comp.propsCount} | ${comp.avgPropsPerInstance} |`,
    );
  });
  lines.push("");

  // Components with most props
  const componentsByProps = [...components].sort(
    (a, b) => b.propsCount - a.propsCount,
  );
  lines.push("## Top 10 Components with Most Unique Props");
  lines.push("");
  lines.push("| Rank | Component Name | Unique Props | Instances |");
  lines.push("| ---: | --- | ---: | ---: |");
  componentsByProps.slice(0, 10).forEach((comp, index) => {
    lines.push(
      `| ${index + 1} | ${comp.name} | ${comp.propsCount} | ${comp.instances} |`,
    );
  });
  lines.push("");

  // Components with highest prop usage per instance
  const componentsByAvgProps = [...components]
    .filter((c) => c.instances > 5) // Filter out rarely used components
    .sort((a, b) => b.avgPropsPerInstance - a.avgPropsPerInstance);
  lines.push(
    "## Top 10 Components with Highest Avg Props per Use (min 5 instances)",
  );
  lines.push("");
  lines.push("| Rank | Component Name | Avg Props/Use | Instances |");
  lines.push("| ---: | --- | ---: | ---: |");
  componentsByAvgProps.slice(0, 10).forEach((comp, index) => {
    lines.push(
      `| ${index + 1} | ${comp.name} | ${comp.avgPropsPerInstance} | ${comp.instances} |`,
    );
  });
  lines.push("");

  // Distribution analysis
  const distributionRanges = [
    { label: "1 instance", min: 1, max: 1, count: 0 },
    { label: "2-5 instances", min: 2, max: 5, count: 0 },
    { label: "6-10 instances", min: 6, max: 10, count: 0 },
    { label: "11-20 instances", min: 11, max: 20, count: 0 },
    { label: "21-50 instances", min: 21, max: 50, count: 0 },
    { label: "51-100 instances", min: 51, max: 100, count: 0 },
    { label: "100+ instances", min: 101, max: Infinity, count: 0 },
  ];

  components.forEach((comp) => {
    for (const range of distributionRanges) {
      if (comp.instances >= range.min && comp.instances <= range.max) {
        range.count++;
        break;
      }
    }
  });

  lines.push("## Component Usage Distribution");
  lines.push("");
  lines.push("| Range | Component Count | Percentage |");
  lines.push("| --- | ---: | ---: |");
  distributionRanges.forEach((range) => {
    const percentage = ((range.count / components.length) * 100).toFixed(1);
    lines.push(`| ${range.label} | ${range.count} | ${percentage}% |`);
  });
  lines.push("");

  // Most common props across all components
  const allProps = {};
  for (const [componentName, componentData] of Object.entries(jsonData)) {
    const props = componentData.props || {};
    for (const [propName, count] of Object.entries(props)) {
      if (!allProps[propName]) {
        allProps[propName] = { count: 0, components: 0 };
      }
      allProps[propName].count += count;
      allProps[propName].components += 1;
    }
  }

  const sortedProps = Object.entries(allProps)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count);

  lines.push("## Top 20 Most Used Props (Across All Components)");
  lines.push("");
  lines.push("| Rank | Prop Name | Total Uses | Used in Components |");
  lines.push("| ---: | --- | ---: | ---: |");
  sortedProps.slice(0, 20).forEach((prop, index) => {
    lines.push(
      `| ${index + 1} | ${prop.name} | ${prop.count} | ${prop.components} |`,
    );
  });
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("*Report generated successfully.*");

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write to file
  fs.writeFileSync(outputPath, lines.join("\n"));

  // Console output
  console.log(`✅ ${codebase}: Statistics generated successfully`);
  console.log(`   Total components: ${components.length}`);
  console.log(`   Total instances: ${totalInstances}`);
  console.log(`   Output: ${outputPath}`);

  // Show top 10
  if (components.length > 0) {
    console.log(`   Top 5 most used components:`);
    components.slice(0, 5).forEach((comp, index) => {
      console.log(
        `     ${index + 1}. ${comp.name}: ${comp.instances} instances`,
      );
    });
  }

  return {
    codebase,
    componentCount: components.length,
    totalInstances,
    outputPath,
  };
}

function main() {
  console.log(
    "╔════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║         GENERATING COMPONENT STATISTICS REPORTS               ║",
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════╝\n",
  );

  const results = [];

  // Process each codebase
  CODEBASES.forEach((codebase) => {
    console.log(`\n📊 Processing ${codebase}...`);
    const result = generateStats(codebase);
    if (result) {
      results.push(result);
    }
  });

  // Summary
  if (results.length > 0) {
    console.log("\n" + "═".repeat(70));
    console.log("SUMMARY");
    console.log("═".repeat(70));

    const totalComponents = results.reduce(
      (sum, r) => sum + r.componentCount,
      0,
    );
    const totalInstances = results.reduce(
      (sum, r) => sum + r.totalInstances,
      0,
    );

    console.log(`Total codebases processed: ${results.length}`);
    console.log(`Total components across all codebases: ${totalComponents}`);
    console.log(`Total component instances: ${totalInstances}\n`);
  } else {
    console.log(
      "\n⚠️  No component reports found. Run 'npm run scan' first.\n",
    );
  }
}

main();
