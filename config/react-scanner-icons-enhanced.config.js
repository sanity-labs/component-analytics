const path = require("path");

/**
 * Custom processor to track icons passed as props
 * This extends React Scanner's capabilities to detect icon usage patterns
 * that standard processors miss (e.g., icon={IconName})
 */
function customIconPropsProcessor(report) {
  const iconPropUsage = new Map();
  const propNameFrequency = new Map();
  const componentIconMapping = new Map();

  // Analyze each component in the report
  Object.entries(report).forEach(([iconName, data]) => {
    if (!data.instances) return;

    data.instances.forEach((instance) => {
      const filePath = instance.location?.file || "unknown";

      // Track which props are used to pass icons
      if (instance.props) {
        Object.keys(instance.props).forEach((propName) => {
          propNameFrequency.set(
            propName,
            (propNameFrequency.get(propName) || 0) + 1,
          );
        });
      }

      // Build icon prop usage data
      if (!iconPropUsage.has(iconName)) {
        iconPropUsage.set(iconName, {
          name: iconName,
          totalInstances: 0,
          files: new Set(),
          propContexts: [],
        });
      }

      const usage = iconPropUsage.get(iconName);
      usage.totalInstances++;
      usage.files.add(filePath);

      // Store the context of how this icon is used
      if (instance.props) {
        usage.propContexts.push({
          file: filePath,
          props: instance.props,
          line: instance.location?.line,
        });
      }
    });
  });

  // Convert to array and sort
  const sortedIcons = Array.from(iconPropUsage.values())
    .map((icon) => ({
      ...icon,
      files: Array.from(icon.files),
      fileCount: icon.files.size,
    }))
    .sort((a, b) => b.totalInstances - a.totalInstances);

  const sortedPropNames = Array.from(propNameFrequency.entries())
    .map(([name, count]) => ({ propName: name, usageCount: count }))
    .sort((a, b) => b.usageCount - a.usageCount);

  return {
    metadata: {
      timestamp: new Date().toISOString(),
      processorType: "custom-icon-props",
      totalUniqueIcons: iconPropUsage.size,
      totalInstances: sortedIcons.reduce((sum, i) => sum + i.totalInstances, 0),
    },
    icons: sortedIcons,
    propNameFrequency: sortedPropNames,
    summary: {
      topIcons: sortedIcons.slice(0, 20),
      topPropNames: sortedPropNames.slice(0, 10),
      filesWithIcons: new Set(sortedIcons.flatMap((icon) => icon.files)).size,
    },
  };
}

/**
 * Custom output processor that saves enhanced icon data
 */
function customIconOutputProcessor(options = {}) {
  return function processor(report) {
    const enhancedReport = customIconPropsProcessor(report);

    // Return the processor function signature that React Scanner expects
    return {
      outputTo: options.outputTo || "./reports/icons/icon-props-enhanced.json",
      processor: () => enhancedReport,
    };
  };
}

module.exports = {
  crawlFrom: path.resolve(__dirname, "../sanity"),
  includeSubComponents: true,
  importedFrom: /@sanity\/icons/,

  processors: [
    // Standard count processor
    [
      "count-components-and-props",
      {
        outputTo: path.resolve(
          __dirname,
          "../reports/icons/icon-usage-report-enhanced.json",
        ),
      },
    ],
  ],

  // Custom getPropValue to better track icon prop references
  getPropValue: (propValue, propName) => {
    // If the prop value is a reference (not a literal), track it specially
    if (propValue && typeof propValue === "object") {
      if (propValue.type === "Identifier") {
        return {
          type: "icon-reference",
          name: propValue.name,
          propName: propName,
        };
      }
    }
    return propValue;
  },

  // Include more detailed location information
  includeFileContent: false,

  // Custom filters
  exclude: [
    "**/node_modules/**",
    "**/__tests__/**",
    "**/*.test.{ts,tsx}",
    "**/*.spec.{ts,tsx}",
    "**/dist/**",
    "**/build/**",
  ],
};
