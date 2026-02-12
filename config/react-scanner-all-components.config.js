const path = require("path");

// List of codebases to analyze
const CODEBASES = ["sanity", "canvas", "huey"];

// Generate configurations for each codebase
// This config captures ALL React components regardless of import source
const configs = CODEBASES.map((codebase) => ({
  crawlFrom: path.resolve(__dirname, `../codebases/${codebase}`),
  includeSubComponents: true,
  // No importedFrom filter - captures all components
  processors: [
    [
      "count-components-and-props",
      {
        outputTo: path.resolve(
          __dirname,
          `../reports/${codebase}/all-components/all-components-report.json`,
        ),
      },
    ],
  ],
}));

// Export the first config for single runs, or export all for batch processing
module.exports = process.env.CODEBASE
  ? configs.find((c) => c.crawlFrom.includes(process.env.CODEBASE))
  : configs[0];

// Export all configs for scripts that need to process multiple codebases
module.exports.all = configs;
module.exports.CODEBASES = CODEBASES;
