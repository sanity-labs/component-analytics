#!/usr/bin/env node

/**
 * @module examples/programmatic-usage
 *
 * Demonstrates how to use the component-analytics library
 * programmatically from a Node.js application — without a config
 * file on disk and without any report-generation side-effects.
 *
 * Run:
 *   node examples/programmatic-usage.js
 *
 * This example:
 *   1. Creates an analysis context from a plain config object
 *   2. Analyzes sample JSX source strings (no filesystem needed)
 *   3. Aggregates results across multiple "files"
 *   4. Builds the final per-component JSON output
 *   5. Uses pure utility functions that need no context at all
 */

const { createContext, perComponent, utils } = require("../index");

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CREATE A CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════
//
// A context holds all the derived values (tracked components, import
// matchers, etc.) that the analysis functions need.  You build one from
// a plain config object — the same shape as component-analytics.config.js.
//
// No file on disk is required.  No globals are mutated.

const ctx = createContext({
  codebases: [
    { name: "web-app", path: "./packages/web" },
    { name: "mobile-app", path: "./packages/mobile" },
  ],
  uiLibraries: [
    {
      name: "Acme UI",
      importSources: ["@acme/ui"],
      excludeSources: ["@acme/ui/theme"],
      components: ["Button", "Card", "Flex", "Stack", "Text", "TextInput"],
    },
    {
      name: "Acme Icons",
      importSources: ["@acme/icons"],
      excludeSources: [],
      components: ["AddIcon", "CloseIcon", "SearchIcon"],
    },
  ],
  files: {
    pattern: "**/*.{tsx,jsx}",
    ignore: ["**/node_modules/**", "**/*.test.*"],
  },
  otherUIPatterns: ["@radix-ui", "styled-components"],
});

console.log("Context created:");
console.log("  Codebases:", ctx.codebases.join(", "));
console.log("  Tracked components:", ctx.trackedComponents.length);
console.log("  Import sources:", ctx.uiImportSources.join(", "));
console.log("");

// ═══════════════════════════════════════════════════════════════════════════════
// 2. ANALYZE INDIVIDUAL FILES
// ═══════════════════════════════════════════════════════════════════════════════
//
// analyzeFileContent takes a source string and returns every tracked
// component instance with its parsed props.  No disk I/O happens.

const fileA = `
import { Button, Card } from '@acme/ui';
import { AddIcon } from '@acme/icons';

export function SavePanel() {
  return (
    <Card padding={4} tone="positive" radius={2}>
      <Button mode="ghost" tone="primary" onClick={handleSave}>
        <AddIcon />
        Save changes
      </Button>
      <Button mode="default" tone="caution" onClick={handleCancel}>
        Cancel
      </Button>
    </Card>
  );
}
`;

const fileB = `
import { Flex, Text, TextInput } from '@acme/ui';
import { SearchIcon } from '@acme/icons';

export function SearchBar() {
  return (
    <Flex align="center" gap={2}>
      <SearchIcon />
      <TextInput placeholder="Search…" value={query} onChange={setQuery} />
      <Text size={1} muted>
        {results.length} results
      </Text>
    </Flex>
  );
}
`;

const resultA = perComponent.analyzeFileContent(fileA, ctx);
const resultB = perComponent.analyzeFileContent(fileB, ctx);

console.log("File A analysis:");
console.log("  Tracked imports:", Object.keys(resultA.importMap).join(", "));
console.log("  Component instances:", resultA.instances.length);
for (const inst of resultA.instances) {
  const propNames = inst.props.map((p) => p.name).join(", ");
  console.log(`    <${inst.component}> line ${inst.line} — props: ${propNames || "(none)"}`);
}
console.log("");

console.log("File B analysis:");
console.log("  Tracked imports:", Object.keys(resultB.importMap).join(", "));
console.log("  Component instances:", resultB.instances.length);
for (const inst of resultB.instances) {
  const propNames = inst.props.map((p) => p.name).join(", ");
  console.log(`    <${inst.component}> line ${inst.line} — props: ${propNames || "(none)"}`);
}
console.log("");

// ═══════════════════════════════════════════════════════════════════════════════
// 3. AGGREGATE RESULTS
// ═══════════════════════════════════════════════════════════════════════════════
//
// Seed a reports map, then merge each file's results in.  This is the
// same aggregation the CLI does, but you control the loop.

const reports = {};
for (const comp of ctx.trackedComponents) {
  reports[comp] = perComponent.createEmptyReport(comp, ctx);
}

// Merge file results (with codebase name and file path for references)
perComponent.mergeFileResult(reports, resultA, "web-app", "src/SavePanel.tsx");
perComponent.mergeFileResult(reports, resultB, "web-app", "src/SearchBar.tsx");

// Run automatic default-value detection across all collected data
perComponent.applyAutoDetectedDefaults(reports);

console.log("Aggregated results:");
for (const [name, report] of Object.entries(reports)) {
  if (report.totalInstances === 0) continue;
  const propCount = Object.keys(report.props).length;
  console.log(
    `  ${name}: ${report.totalInstances} instances, ${report.totalImports} imports, ${propCount} unique props`,
  );
}
console.log("");

// ═══════════════════════════════════════════════════════════════════════════════
// 4. BUILD PER-COMPONENT JSON
// ═══════════════════════════════════════════════════════════════════════════════
//
// buildComponentJson produces the same structure written to
// reports/components/detail/<Name>.json by the CLI.

const buttonJson = perComponent.buildComponentJson(reports.Button);

console.log("Button component detail:");
console.log("  Library:", buttonJson.library);
console.log("  Instances:", buttonJson.totalInstances);
console.log("  Unique props:", buttonJson.uniqueProps);
console.log("  Avg props/instance:", buttonJson.avgPropsPerInstance);
console.log("  Props:");
for (const [prop, info] of Object.entries(buttonJson.props)) {
  const values = Object.entries(info.values)
    .map(([v, c]) => `${v}(${c})`)
    .join(", ");
  console.log(
    `    ${prop}: ${info.totalUsages} usages, ${info.unsetInstances} unset — values: ${values}`,
  );
}
console.log("  References:");
for (const ref of buttonJson.references) {
  console.log(`    ${ref.file}:${ref.line} (${ref.codebase})`);
}
console.log("");

// ═══════════════════════════════════════════════════════════════════════════════
// 5. PURE UTILITIES (no context needed)
// ═══════════════════════════════════════════════════════════════════════════════
//
// These functions work standalone — useful for building custom tooling
// on top of the analysis primitives.

console.log("Pure utility examples:");

// Parse props from a JSX tag body
const props = perComponent.parseProps('mode="ghost" padding={4} disabled');
console.log("  parseProps:", JSON.stringify(props));

// Classify prop values
console.log('  classifyValue("true"):', perComponent.classifyValue("true"));
console.log("  classifyValue(\"'ghost'\"):", perComponent.classifyValue("'ghost'"));
console.log("  classifyValue(\"[1, 2, 3]\"):", perComponent.classifyValue("[1, 2, 3]"));
console.log(
  "  classifyValue(\"{color: 'red'}\"):",
  perComponent.classifyValue("{color: 'red'}"),
);
console.log(
  "  classifyValue(\"handleClick\"):",
  perComponent.classifyValue("handleClick"),
);

// Normalize for aggregation
console.log('  normalizeValue("ghost"):', perComponent.normalizeValue("ghost"));
console.log(
  '  normalizeValue("<variable:myVar>"):',
  perComponent.normalizeValue("<variable:myVar>"),
);

// Line number utility
const source = "line1\nline2\nline3";
console.log("  lineNumberAt(offset=6):", perComponent.lineNumberAt(source, 6));

// Shared utilities
console.log("  pct(30, 200):", utils.pct(30, 200));
console.log(
  "  sortByCount({a:10, b:50, c:25}):",
  JSON.stringify(utils.sortByCount({ a: 10, b: 50, c: 25 })),
);
console.log("");

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CONTEXT ISOLATION
// ═══════════════════════════════════════════════════════════════════════════════
//
// Each context is fully self-contained.  You can create multiple
// contexts for different projects and they won't interfere.

const otherCtx = createContext({
  codebases: [{ name: "other", path: "./other" }],
  uiLibraries: [
    {
      name: "Other UI",
      importSources: ["other-ui"],
      excludeSources: [],
      components: ["Widget"],
    },
  ],
  files: { pattern: "**/*.tsx", ignore: [] },
});

console.log("Context isolation:");
console.log("  ctx.isTrackedUISource('@acme/ui'):", ctx.isTrackedUISource("@acme/ui"));
console.log("  ctx.isTrackedUISource('other-ui'):", ctx.isTrackedUISource("other-ui"));
console.log(
  "  otherCtx.isTrackedUISource('@acme/ui'):",
  otherCtx.isTrackedUISource("@acme/ui"),
);
console.log(
  "  otherCtx.isTrackedUISource('other-ui'):",
  otherCtx.isTrackedUISource("other-ui"),
);
console.log("");

console.log("Done.");
