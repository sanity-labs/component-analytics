const fs = require("fs");
const path = require("path");

// List of codebases to analyze
const CODEBASES = ["sanity", "canvas", "huey"];

function convertToCSV(codebase) {
  const inputPath = `reports/${codebase}/icons/icon-usage-report.json`;
  const outputPath = `reports/${codebase}/icons/icon-usage-detailed.csv`;

  // Check if input file exists
  if (!fs.existsSync(inputPath)) {
    console.log(`⚠️  Skipping ${codebase}: ${inputPath} not found`);
    return null;
  }

  // Read the JSON file
  const jsonData = JSON.parse(fs.readFileSync(inputPath, "utf8"));

  // Prepare CSV headers and rows
  const csvRows = [];
  csvRows.push("Icon Name,Total Instances,Prop Name,Prop Usage Count");

  // Process each icon
  for (const [iconName, iconData] of Object.entries(jsonData)) {
    const instances = iconData.instances;
    const props = iconData.props || {};
    const sortedProps = Object.entries(props).sort((a, b) => b[1] - a[1]);

    if (sortedProps.length === 0) {
      csvRows.push(`"${iconName}",${instances},"",0`);
    } else {
      sortedProps.forEach((propEntry, index) => {
        const [propName, propCount] = propEntry;
        if (index === 0) {
          csvRows.push(`"${iconName}",${instances},"${propName}",${propCount}`);
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

  console.log(`✅ ${codebase}: Icon CSV created successfully`);
  console.log(`   Total icons: ${Object.keys(jsonData).length}`);
  console.log(`   Total rows: ${csvRows.length - 1}`);
  console.log(`   Output: ${outputPath}`);

  return {
    codebase,
    iconCount: Object.keys(jsonData).length,
    rowCount: csvRows.length - 1,
    outputPath,
  };
}

function main() {
  console.log(
    "╔════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║          CONVERTING ICON REPORTS TO CSV FORMAT                ║",
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

    const totalIcons = results.reduce((sum, r) => sum + r.iconCount, 0);
    const totalRows = results.reduce((sum, r) => sum + r.rowCount, 0);

    console.log(`Total codebases processed: ${results.length}`);
    console.log(`Total icons across all codebases: ${totalIcons}`);
    console.log(`Total CSV rows: ${totalRows}\n`);
  } else {
    console.log(
      "\n⚠️  No icon reports found. Run 'npm run scan:icons' first.\n",
    );
  }
}

main();
