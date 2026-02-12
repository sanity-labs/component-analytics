const fs = require("fs");
const path = require("path");

// List of codebases to analyze
const CODEBASES = ["sanity", "canvas", "huey"];

function createUISummary(codebase) {
  const inputPath = `reports/${codebase}/ui-components/ui-components-report.json`;
  const summaryPath = `reports/${codebase}/ui-components/ui-components-summary.csv`;
  const statsPath = `reports/${codebase}/ui-components/ui-components-stats.txt`;

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
      propUsages,
    });
  }

  // Sort by instance count (descending)
  components.sort((a, b) => b.instances - a.instances);

  // Write summary CSV
  components.forEach((comp) => {
    csvRows.push(
      `"${comp.name}",${comp.instances},${comp.propsCount},"${comp.mostUsedProp}",${comp.mostUsedPropCount}`,
    );
  });

  // Ensure output directory exists
  const outputDir = path.dirname(summaryPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(summaryPath, csvRows.join("\n"));

  // Generate detailed statistics report
  const statsLines = [];
  statsLines.push("=".repeat(70));
  statsLines.push(
    `${codebase.toUpperCase()} - UI-COMPONENTS ANALYSIS - DETAILED STATISTICS`,
  );
  statsLines.push("=".repeat(70));
  statsLines.push("");

  statsLines.push(
    `DIRECTORY: codebases/${codebase}/packages/sanity/src/ui-components`,
  );
  statsLines.push("");

  // General Statistics
  statsLines.push("GENERAL STATISTICS");
  statsLines.push("-".repeat(70));
  statsLines.push(`Total UI Components:            ${components.length}`);
  statsLines.push(`Total Component Instances:      ${totalInstances}`);
  statsLines.push(`Total Unique Props Used:        ${totalProps}`);
  statsLines.push(`Total Prop Usages:              ${totalPropUsages}`);
  statsLines.push(
    `Avg Props per Component Type:   ${components.length > 0 ? (totalProps / components.length).toFixed(2) : 0}`,
  );
  statsLines.push(
    `Avg Props per Instance:         ${totalInstances > 0 ? (totalPropUsages / totalInstances).toFixed(2) : 0}`,
  );
  statsLines.push("");

  // All components (sorted by usage)
  statsLines.push("ALL UI COMPONENTS (SORTED BY USAGE)");
  statsLines.push("-".repeat(70));
  statsLines.push(
    "Rank | Component Name              | Instances | Unique Props | Avg Props/Use",
  );
  statsLines.push("-".repeat(70));
  components.forEach((comp, index) => {
    const rank = (index + 1).toString().padStart(4);
    const name = comp.name.padEnd(27);
    const instances = comp.instances.toString().padStart(9);
    const props = comp.propsCount.toString().padStart(12);
    const avg = (comp.propUsages / comp.instances).toFixed(2).padStart(13);
    statsLines.push(`${rank} | ${name} | ${instances} | ${props} | ${avg}`);
  });
  statsLines.push("");

  // Components with most props
  const componentsByProps = [...components].sort(
    (a, b) => b.propsCount - a.propsCount,
  );
  statsLines.push("COMPONENTS WITH MOST UNIQUE PROPS");
  statsLines.push("-".repeat(70));
  statsLines.push(
    "Rank | Component Name              | Unique Props | Instances",
  );
  statsLines.push("-".repeat(70));
  componentsByProps.forEach((comp, index) => {
    const rank = (index + 1).toString().padStart(4);
    const name = comp.name.padEnd(27);
    const props = comp.propsCount.toString().padStart(12);
    const instances = comp.instances.toString().padStart(9);
    statsLines.push(`${rank} | ${name} | ${props} | ${instances}`);
  });
  statsLines.push("");

  // Components with highest prop usage per instance
  const componentsByAvgProps = [...components]
    .filter((c) => c.instances >= 1)
    .sort((a, b) => b.propUsages / b.instances - a.propUsages / a.instances);
  statsLines.push("COMPONENTS WITH HIGHEST AVG PROPS PER USE");
  statsLines.push("-".repeat(70));
  statsLines.push(
    "Rank | Component Name              | Avg Props/Use | Instances",
  );
  statsLines.push("-".repeat(70));
  componentsByAvgProps.forEach((comp, index) => {
    const rank = (index + 1).toString().padStart(4);
    const name = comp.name.padEnd(27);
    const avg = (comp.propUsages / comp.instances).toFixed(2).padStart(13);
    const instances = comp.instances.toString().padStart(9);
    statsLines.push(`${rank} | ${name} | ${avg} | ${instances}`);
  });
  statsLines.push("");

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

  statsLines.push("TOP 20 MOST USED PROPS (ACROSS ALL UI COMPONENTS)");
  statsLines.push("-".repeat(70));
  statsLines.push(
    "Rank | Prop Name                | Total Uses | Used in Components",
  );
  statsLines.push("-".repeat(70));
  sortedProps.slice(0, 20).forEach((prop, index) => {
    const rank = (index + 1).toString().padStart(4);
    const name = prop.name.padEnd(24);
    const count = prop.count.toString().padStart(10);
    const comps = prop.components.toString().padStart(18);
    statsLines.push(`${rank} | ${name} | ${count} | ${comps}`);
  });
  statsLines.push("");

  // Component categories by usage
  const highUsage = components.filter((c) => c.instances >= 100);
  const mediumUsage = components.filter(
    (c) => c.instances >= 20 && c.instances < 100,
  );
  const lowUsage = components.filter((c) => c.instances < 20);

  statsLines.push("COMPONENT USAGE CATEGORIES");
  statsLines.push("-".repeat(70));
  statsLines.push(
    "Category             | Component Count | Total Instances | Avg Instances",
  );
  statsLines.push("-".repeat(70));

  const addCategory = (name, comps) => {
    if (comps.length > 0) {
      const label = name.padEnd(20);
      const count = comps.length.toString().padStart(15);
      const total = comps
        .reduce((sum, c) => sum + c.instances, 0)
        .toString()
        .padStart(15);
      const avg = (
        comps.reduce((sum, c) => sum + c.instances, 0) / comps.length
      )
        .toFixed(1)
        .padStart(13);
      statsLines.push(`${label} | ${count} | ${total} | ${avg}`);
    }
  };

  addCategory("High Usage (100+)", highUsage);
  addCategory("Medium Usage (20-99)", mediumUsage);
  addCategory("Low Usage (<20)", lowUsage);
  statsLines.push("");

  // Component purposes (categorized by name patterns)
  statsLines.push("COMPONENT PURPOSES");
  statsLines.push("-".repeat(70));
  const purposes = {
    Interactive: ["Button", "MenuItem", "Tab"],
    Overlay: ["Tooltip", "Dialog", "Popover", "MenuButton", "ConfirmPopover"],
    Feedback: ["ErrorBoundary", "ProgressIcon", "ToneIcon"],
    "Layout/Utility": ["MenuGroup", "TooltipDelayGroupProvider"],
  };

  for (const [category, compNames] of Object.entries(purposes)) {
    const comps = components.filter((c) => compNames.includes(c.name));
    if (comps.length > 0) {
      const totalInstances = comps.reduce((sum, c) => sum + c.instances, 0);
      statsLines.push(
        `${category.padEnd(20)} | ${comps.length} components | ${totalInstances} instances`,
      );
      comps.forEach((c) => {
        statsLines.push(
          `  - ${c.name.padEnd(25)} ${c.instances.toString().padStart(4)} instances`,
        );
      });
    }
  }
  statsLines.push("");

  // Key insights
  if (components.length > 0) {
    statsLines.push("KEY INSIGHTS");
    statsLines.push("-".repeat(70));
    statsLines.push(
      "1. " +
        components[0].name +
        " component dominates with " +
        components[0].instances +
        " instances (" +
        ((components[0].instances / totalInstances) * 100).toFixed(1) +
        "% of all UI component usage)",
    );
    if (components.length >= 3) {
      statsLines.push(
        "2. Top 3 components account for " +
          (
            (components.slice(0, 3).reduce((sum, c) => sum + c.instances, 0) /
              totalInstances) *
            100
          ).toFixed(1) +
          "% of total usage",
      );
    }
    const interactiveComps = components.filter((c) =>
      ["Button", "MenuItem", "Tab"].includes(c.name),
    );
    if (interactiveComps.length > 0) {
      statsLines.push(
        "3. Interactive components (Button, MenuItem, Tab) = " +
          interactiveComps.reduce((sum, c) => sum + c.instances, 0) +
          " instances",
      );
    }
    const overlayComps = components.filter((c) =>
      ["Tooltip", "Dialog", "Popover", "MenuButton", "ConfirmPopover"].includes(
        c.name,
      ),
    );
    if (overlayComps.length > 0) {
      statsLines.push(
        "4. Overlay components (Tooltip, Dialog, Popover, etc) = " +
          overlayComps.reduce((sum, c) => sum + c.instances, 0) +
          " instances",
      );
    }
    statsLines.push(
      "5. Average props per instance: " +
        (totalPropUsages / totalInstances).toFixed(2) +
        " (UI components are highly configurable)",
    );
    statsLines.push("");
  }

  statsLines.push("=".repeat(70));
  statsLines.push("UI Components analysis report generated successfully!");
  statsLines.push("=".repeat(70));

  // Write stats to file
  fs.writeFileSync(statsPath, statsLines.join("\n"));

  // Console output
  console.log(`✅ ${codebase}: UI Components summary created successfully`);
  console.log(`   Total components: ${components.length}`);
  console.log(`   Total instances: ${totalInstances}`);
  console.log(`   CSV output: ${summaryPath}`);
  console.log(`   Stats output: ${statsPath}`);

  // Show top 5
  if (components.length > 0) {
    console.log(`   Top 5 UI components:`);
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
    summaryPath,
    statsPath,
  };
}

function main() {
  console.log(
    "╔════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║      CREATING UI COMPONENTS SUMMARY AND STATISTICS FILES      ║",
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════╝\n",
  );

  const results = [];

  // Process each codebase
  CODEBASES.forEach((codebase) => {
    console.log(`\n📊 Processing ${codebase}...`);
    const result = createUISummary(codebase);
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
    console.log(`Total UI components across all codebases: ${totalComponents}`);
    console.log(`Total UI component instances: ${totalInstances}\n`);
  } else {
    console.log(
      "\n⚠️  No UI component reports found. Run 'npm run scan:ui' first.\n",
    );
  }
}

main();
