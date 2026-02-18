module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.js"],
  collectCoverageFrom: [
    "scripts/sources/analyze-ui-component-sources.js",
    "scripts/html-tags/analyze-html-tags.js",
    "scripts/customizations/analyze-customizations.js",
    "scripts/per-component/analyze-per-component.js",
    "scripts/per-component/detect-prop-defaults.js",
    "scripts/lib/constants.js",
    "scripts/lib/utils.js",
    "scripts/lib/files.js",
    "!scripts/**/__tests__/**",
  ],
  coverageDirectory: "scripts/__tests__/coverage",
  coverageReporters: ["text", "lcov", "html"],
  coverageThreshold: {
    // ── Pure logic modules — high coverage expected ─────────────────────
    "scripts/lib/utils.js": {
      branches: 80,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    "scripts/lib/constants.js": {
      branches: 50,
      functions: 100,
      lines: 85,
      statements: 85,
    },

    // ── File I/O module — async glob + fs calls are hard to unit test ───
    "scripts/lib/files.js": {
      branches: 35,
      functions: 50,
      lines: 35,
      statements: 35,
    },

    // ── HTML tags — extraction + aggregation well-tested; CLI is not ────
    "scripts/html-tags/analyze-html-tags.js": {
      branches: 60,
      functions: 80,
      lines: 75,
      statements: 75,
    },

    // ── Customizations — extraction + aggregation well-tested ───────────
    "scripts/customizations/analyze-customizations.js": {
      branches: 60,
      functions: 80,
      lines: 75,
      statements: 75,
    },

    // ── Per-component — extraction, props, aggregation, defaults ────────
    "scripts/per-component/analyze-per-component.js": {
      branches: 70,
      functions: 80,
      lines: 70,
      statements: 70,
    },

    // ── Detect prop defaults — core detectPropDefault() is tested via
    //    analyze-per-component.js; the rest is CLI/I/O ───────────────────
    "scripts/per-component/detect-prop-defaults.js": {
      branches: 15,
      functions: 5,
      lines: 15,
      statements: 15,
    },

    // ── Sources — most code is report generation + CLI (I/O heavy) ──────
    "scripts/sources/analyze-ui-component-sources.js": {
      branches: 35,
      functions: 30,
      lines: 20,
      statements: 20,
    },
  },
  verbose: true,
  testTimeout: 10000,
  modulePathIgnorePatterns: ["<rootDir>/codebases/", "<rootDir>/node_modules/"],
  testPathIgnorePatterns: ["<rootDir>/codebases/", "<rootDir>/node_modules/"],
  watchPathIgnorePatterns: ["<rootDir>/codebases/", "<rootDir>/node_modules/"],
};
