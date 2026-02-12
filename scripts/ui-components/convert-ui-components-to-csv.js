const fs = require("fs");
const path = require("path");

// List of codebases to analyze
const CODEBASES = ["sanity", "canvas", "huey"];

function convertToCSV(codebase) {
  const inputPath = `reports/${codebase}/ui-components/ui-components-report.json`;
  const outputPath = `reports/${codebase}/ui-components/ui-components-usage-detailed.csv`;

  // Check if input file exists
  if (!fs.existsSync(inputPath)) {
    console.log(`⚠️  Skipping ${codebase}: ${inputPath} not found`);
    return null;
  }

  // Read the JSON file
  const jsonData = JSON.parse(fs.readFileSync(inputPath, "utf8"));

  // Prepare CSV headers and rows
  const csvRows = [];
  csvRows.push("Component Name,Total Instances,Prop Name,Prop Usage Count");

  // Process each component
  for (const [componentName, componentData] of Object.entries(jsonData)) {
    const instances = componentData.instances;
    const props = componentData.props || {};
    const sortedProps = Object.entries(props).sort((a, b) => b[1] - a[1]);

    if (sortedProps.length === 0) {
      csvRows.push(`"${componentName}",${instances},"",0`);
    } else {
      sortedProps.forEach((propEntry, index) => {
        const [propName, propCount] = propEntry;
        if (index === 0) {
          csvRows.push(
            `"${componentName}",${instances},"${propName}",${propCount}`,
          );
        } else {
          csvRows.push(`"","","${propName}",${propCount}`);
        }
      });
    }
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write to CSV file
  fs.writeFileSync(outputPath, csvRows.join("\n"));

  console.log(`✅ ${codebase}: UI Components CSV created successfully`);
  console.log(`   Total components: ${Object.keys(jsonData).length}`);
  console.log(`   Total rows: ${csvRows.length - 1}`);
  console.log(`   Output: ${outputPath}`);

  return {
    codebase,
    componentCount: Object.keys(jsonData).length,
    rowCount: csvRows.length - 1,
    outputPath,
  };
}

function main() {
  console.log(
    "╔════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║      CONVERTING UI COMPONENT REPORTS TO CSV FORMAT            ║",
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════╝\n",
  );

  const results = [];

  // Process each codebase
  CODEBASES.forEach((codebase) => {
    console.log(`\n📊 Processing ${codebase}...`);
    const result = convertToCSV(codebase);
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
    const totalRows = results.reduce((sum, r) => sum + r.rowCount, 0);

    console.log(`Total codebases processed: ${results.length}`);
    console.log(`Total UI components across all codebases: ${totalComponents}`);
    console.log(`Total CSV rows: ${totalRows}\n`);
  } else {
    console.log(
      "\n⚠️  No UI component reports found. Run 'npm run scan:ui' first.\n",
    );
  }
}

main();
