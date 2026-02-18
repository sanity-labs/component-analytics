const fs = require("fs");
const path = require("path");

// List of codebases to analyze
const CODEBASES = ["sanity", "canvas", "huey"];

function createSummary(codebase) {
  const inputPath = `reports/${codebase}/all-components/all-components.json`;
  const outputPath = `reports/${codebase}/all-components/summary.csv`;

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
    "Component Name,Total Instances,Unique Props Count,Most Used Prop,Most Used Prop Count",
  );

  // Process each component
  const components = [];
  for (const [componentName, componentData] of Object.entries(jsonData)) {
    const instances = componentData.instances;
    const props = componentData.props || {};
    const propsCount = Object.keys(props).length;

    // Find most used prop
    let mostUsedProp = "";
    let mostUsedPropCount = 0;

    if (propsCount > 0) {
      const sortedProps = Object.entries(props).sort((a, b) => b[1] - a[1]);
      mostUsedProp = sortedProps[0][0];
      mostUsedPropCount = sortedProps[0][1];
    }

    components.push({
      name: componentName,
      instances,
      propsCount,
      mostUsedProp,
      mostUsedPropCount,
    });
  }

  // Sort by instance count (descending)
  components.sort((a, b) => b.instances - a.instances);

  // Write rows
  components.forEach((comp) => {
    csvRows.push(
      `"${comp.name}",${comp.instances},${comp.propsCount},"${comp.mostUsedProp}",${comp.mostUsedPropCount}`,
    );
  });

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write to CSV file
  fs.writeFileSync(outputPath, csvRows.join("\n"));

  console.log(`✅ ${codebase}: Summary CSV created successfully`);
  console.log(`   Total components: ${components.length}`);
  console.log(`   Output: ${outputPath}`);

  // Show top 10
  if (components.length > 0) {
    console.log(`   Top 10 most used components:`);
    components.slice(0, 10).forEach((comp, index) => {
      console.log(
        `     ${index + 1}. ${comp.name}: ${comp.instances} instances`,
      );
    });
  }

  return {
    codebase,
    componentCount: components.length,
    outputPath,
    topComponents: components.slice(0, 10),
  };
}

function main() {
  console.log(
    "╔════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║         CREATING COMPONENT SUMMARY CSV FILES                  ║",
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════╝\n",
  );

  const results = [];

  // Process each codebase
  CODEBASES.forEach((codebase) => {
    console.log(`\n📊 Processing ${codebase}...`);
    const result = createSummary(codebase);
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

    console.log(`Total codebases processed: ${results.length}`);
    console.log(`Total components across all codebases: ${totalComponents}\n`);
  } else {
    console.log(
      "\n⚠️  No component reports found. Run 'npm run scan' first.\n",
    );
  }
}

main();
