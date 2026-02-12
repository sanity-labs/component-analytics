const path = require("path");

// List of codebases to analyze
const CODEBASES = ["sanity", "canvas", "huey"];

// Generate configurations for each codebase
const configs = CODEBASES.map((codebase) => ({
  crawlFrom: path.resolve(__dirname, `../codebases/${codebase}`),
  includeSubComponents: true,
  importedFrom: /@sanity\/icons/,
  processors: [
    [
      "count-components-and-props",
      {
        outputTo: path.resolve(
          __dirname,
          `../reports/${codebase}/icons/icon-usage-report.json`,
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
