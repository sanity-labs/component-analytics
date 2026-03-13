# Component Analytics

Measures React component usage for a UI component library. Uses [React Scanner](https://github.com/moroshko/react-scanner) and custom AST-based analyzers to produce actionable reports on component usage, HTML tag prevalence, customization patterns, prop surface area, and line ownership across configurable codebases.

The project has two layers:

1. **Data collection library** (`index.js`) — Pure functions that parse, classify, and aggregate component usage data. No filesystem writes, no side effects. Can be imported into any Node.js application.
2. **CLI** (`scripts/run.js`) — An implementation on top of the library that reads a config file from disk, runs every analysis step, and writes reports. This is what `npm run analyze` invokes.

## Quick Start (CLI)

```bash
npm install

# 1. Copy the example config and edit it to match your project
cp component-analytics.config.example.js component-analytics.config.js

# 2. Edit the config file
#    (codebases, UI libraries, components to track)
vi component-analytics.config.js

# 3. Run every analysis
npm run analyze

# Or run a single step
npm run analyze:scan             # React Scanner (components + wrappers)
npm run analyze:sources          # Tracked UI library vs internal vs HTML
npm run analyze:html-tags        # Raw HTML tag usage per codebase
npm run analyze:customizations   # Inline styles & styled() on tracked components
npm run analyze:per-component    # Per-component imports, instances, props, defaults
npm run analyze:prop-combos      # Prop value combination cross-tabulation
npm run analyze:prop-surface     # Character footprint of UI props
npm run analyze:line-ownership   # Line-of-code footprint of UI library
```

The runner reads codebases and UI libraries from `component-analytics.config.js` automatically — no hardcoded codebase names in any script.

> **Note:** A full run (`npm run analyze`) clears the entire `reports/` directory before generating new output. This prevents stale reports from lingering when codebases or scan types are renamed or removed. Running a single step (`--step`) does **not** clear reports, so other steps' output is preserved.

## Programmatic Usage (Library)

The data collection layer can be imported directly into any Node.js application — no config file on disk is required.

```js
const { createContext, perComponent } = require("ui-component-analysis");

// 1. Build a context from a plain object (no config file needed)
const ctx = createContext({
  codebases: [{ name: "my-app", path: "./src" }],
  uiLibraries: [{
    name: "My UI",
    importSources: ["@my-org/ui"],
    excludeSources: [],
    components: ["Button", "Card", "Text"],
  }],
  files: { pattern: "**/*.tsx", ignore: ["**/node_modules/**"] },
});

// 2. Analyze a single file (data collection only — no disk I/O)
const fs = require("fs");
const source = fs.readFileSync("src/MyPage.tsx", "utf8");
const result = perComponent.analyzeFileContent(source, ctx);

for (const inst of result.instances) {
  const props = inst.props.map(p => p.name).join(", ");
  console.log(`<${inst.component}> line ${inst.line} — props: ${props}`);
}

// 3. Aggregate across files
const reports = {};
for (const comp of ctx.trackedComponents) {
  reports[comp] = perComponent.createEmptyReport(comp, ctx);
}
perComponent.mergeFileResult(reports, result, "my-app", "src/MyPage.tsx");
perComponent.applyAutoDetectedDefaults(reports);

// 4. Build the final per-component data (same structure as the CLI JSON)
const buttonData = perComponent.buildComponentJson(reports.Button);
console.log(buttonData);
// => { component, library, totalInstances, props, references, … }

// 5. Use pure utilities (no context needed)
const props = perComponent.parseProps('mode="ghost" tone="primary"');
const classified = perComponent.classifyValue("{color: 'red'}");
```

A full working example is available at [`examples/programmatic-usage.js`](examples/programmatic-usage.js).

### What's exported

| Export | Description |
|--------|------------|
| `createContext(config, options?)` | Build an analysis context from a plain config object. Each context is frozen and self-contained — multiple contexts don't share state. |
| `perComponent` | Per-component analysis: file parsing, prop classification, aggregation, and JSON building. |
| `sources` | Import source classification (tracked UI vs internal vs HTML vs other). |
| `htmlTags` | Native HTML/SVG tag extraction and counting. |
| `customizations` | Inline `style={}` and `styled()` detection on tracked components. |
| `propCombos` | Prop value combination cross-tabulation. |
| `utils` | Pure utilities: `sortByCount`, `pct`, `incr`, `mergeCounters`, `compact`, `topN`, `padNum`. |
| `HTML_TAG_CATEGORIES` | Static map of tag categories (layout, text, form, media, …). |
| `KNOWN_TAGS` | Flat `Set` of every known HTML/SVG tag name. |

### Context-aware vs pure functions

Functions that need to know which components and libraries to track accept an optional trailing `ctx` parameter:

```js
// Context-aware — pass ctx to control what's tracked
perComponent.analyzeFileContent(source, ctx);
perComponent.buildTrackedUIImportMap(source, ctx);
perComponent.createEmptyReport("Button", ctx);
perComponent.generateSummaryCSV(reports, ctx);
perComponent.generateSummaryMarkdown(reports, ctx);

// Pure utilities — no context needed
perComponent.parseProps('mode="ghost"');
perComponent.classifyValue("[1, 2, 3]");
perComponent.normalizeValue("ghost");
perComponent.buildComponentJson(report);
perComponent.recordProp(report, "mode", "'ghost'");
perComponent.mergeFileResult(reports, fileResult, "my-app", "file.tsx");
```

When `ctx` is omitted, functions fall back to the CLI's on-disk config. This means the CLI code is unchanged — it never passes `ctx`.

### Context isolation

Each context is fully independent. You can create multiple contexts for different projects and they won't interfere:

```js
const ctxA = createContext({
  uiLibraries: [{ name: "Lib A", importSources: ["lib-a"], components: ["WidgetA"] }],
});
const ctxB = createContext({
  uiLibraries: [{ name: "Lib B", importSources: ["lib-b"], components: ["WidgetB"] }],
});

ctxA.isTrackedUISource("lib-a"); // true
ctxA.isTrackedUISource("lib-b"); // false
ctxB.isTrackedUISource("lib-b"); // true
ctxB.isTrackedUISource("lib-a"); // false
```

## Configuration

All CLI settings live in a single file at the project root:

```
component-analytics.config.js
```

This file is **not checked into the repository** — it's `.gitignore`d so each developer/environment can have its own configuration without merge conflicts. An example is provided:

```bash
cp component-analytics.config.example.js component-analytics.config.js
```

Edit the copy to control **what** gets analysed. Every CLI script reads from it automatically. If the config file is missing you'll see an error with instructions when you run any CLI command. There is no silent fallback.

Library consumers pass the same config shape directly to `createContext()` — no file on disk is needed.

### Codebases

Define which codebases to scan. Each entry has a `name` (used in reports) and a `path` (relative to the project root):

```js
codebases: [
  { name: "my-app",    path: "./codebases/my-app" },
  { name: "my-design", path: "./codebases/my-design-system" },
],
```

To add or remove a codebase, edit this array and re-run `npm run analyze`. No other files need to change.

### UI Libraries

Define one or more UI component libraries whose usage you want to measure. Each entry specifies import sources and, optionally, which components to track:

```js
uiLibraries: [
  {
    name: "My UI Library",
    importSources: ["@my-org/ui"],
    excludeSources: ["@my-org/ui/theme"],
    wrapperSources: ["ui-components"],
    // components is optional — omit it to track ALL PascalCase imports
  },
  {
    name: "My Icons",
    importSources: ["@my-org/icons"],
    excludeSources: [],
    // or list specific components to track only those:
    components: ["AddIcon", "CloseIcon", "EditIcon", /* … */],
  },
],
```

When `components` is omitted or empty, **every PascalCase import** from the library's `importSources` is tracked automatically — you don't need to enumerate the full component list. When `components` is provided, only those specific names are tracked.

Components from all entries are merged into a single tracked set. All libraries' import sources are matched together when classifying JSX elements.

| Field | Purpose |
|-------|---------|
| `importSources` | Package names matched as substrings against import paths |
| `excludeSources` | Import paths to ignore even if they match an `importSource` |
| `wrapperSources` | Optional. Import-path substrings that identify an internal wrapper layer around this library (e.g. `["ui-components"]`). When present, a separate "wrappers" scan measures how much code goes through the wrapper vs. importing the library directly. |
| `components` | Optional. PascalCase component names to track. When omitted, all PascalCase imports from the library are tracked. |

Prop defaults are detected automatically from usage data during `npm run analyze` — no manual configuration needed.

#### Scan types derived from config

React Scanner scan types are built dynamically from your `uiLibraries` entries — there are no hardcoded scan definitions. The available types are:

| Scan type | Generated from | What it captures |
|-----------|---------------|-----------------|
| `components` | Always present | Every React component in the codebase (no import filter) |
| `library:<name>` | Each library's `importSources` | Only components imported from that library |
| `wrappers:<name>` | Each library's `wrapperSources` | Only components imported from the wrapper layer |

For example, a config with two UI libraries ("Sanity UI" with `wrapperSources` and "Sanity Icons" without) produces: `components`, `library:Sanity UI`, `wrappers:Sanity UI`, `library:Sanity Icons`.

### File Scanning

Control which files are included in every analysis:

```js
files: {
  pattern: "**/*.{tsx,jsx}",
  ignore: [
    "**/node_modules/**",
    "**/dist/**",
    "**/*.test.*",
    "**/__tests__/**",
    "**/*.stories.*",
  ],
},
```

### Other UI Libraries

The sources report classifies imports into categories. Third-party UI libraries (not the tracked one, not internal code) are identified by these substrings:

```js
otherUIPatterns: [
  "@radix-ui",
  "@chakra-ui",
  "styled-components",
  "motion/react",
],
```

### Prop Combinations

Cross-tabulate prop value combinations on specific components to see which pairings actually occur in practice. Each entry names a tracked component and two or more props to combine:

```js
propCombos: [
  { component: "Text", props: ["weight", "size"] },
  { component: "Button", props: ["tone", "mode"] },
  { component: "Card", props: ["tone", "padding", "radius"] },
  { component: "Heading", props: ["size", "as"] },
],
```

| Field | Purpose |
|-------|---------|
| `component` | A PascalCase component name from one of your `uiLibraries` entries |
| `props` | Two or more prop names whose value tuples will be counted |

The report counts every unique combination of values across all codebases. Instances where none of the listed props are set are excluded. Run with:

```
npm run analyze:prop-combos
```

## Reports

All reports are written to the `reports/` directory. A full run clears this directory first so output is always fresh. The structure is designed to be self-explanatory:

```
reports/
├── codebases/                          # Per-codebase React Scanner output
│   └── {codebase}/
│       ├── all-components/             #   Every React component (no import filter)
│       │   ├── all-components.json     #     Raw React Scanner JSON
│       │   ├── summary.csv             #     Component name, instance count, top prop
│       │   ├── detailed.csv            #     Every component × prop × value
│       │   └── stats.md                #     Tracked library + all-source statistics
│       ├── wrappers/                   #   Only internal UI wrapper components
│       │   ├── wrappers.json           #     Raw React Scanner JSON
│       │   ├── summary.csv             #     Wrapper component summary
│       │   ├── detailed.csv            #     Wrapper component × prop × value
│       │   └── stats.md                #     Human-readable statistics
│       ├── versions.md                 #   Per-codebase version usage breakdown
│       └── versions.json              #   Machine-readable version data
│
├── components/                         # Tracked UI library — per-component detail
│   ├── summary.md                      #   Ranked table of all tracked components
│   ├── summary.csv                     #   One row per component (instances, imports, props)
│   ├── summary.json                    #   Machine-readable summary
│   ├── detected-defaults.md            #   Auto-detected default prop values with evidence
│   ├── detected-defaults.json          #   Machine-readable detected defaults
│   └── detail/                         #   One JSON per component
│       ├── Button.json                 #     Imports, instances, props, values, references
│       ├── Card.json
│       └── …
│
├── sources/                            # JSX element source classification
│   ├── report.md                       #   Which JSX elements come from the tracked library
│   ├── report.csv                      #     vs internal code vs native HTML vs other UI
│   ├── report.json
│   ├── versions.md                     #   Cross-codebase version usage summary
│   └── versions.json                   #   Machine-readable version data
│
├── html-tags/                          # Native HTML/SVG tag usage
│   ├── report.md                       #   Every <div>, <span>, <svg>, etc. in JSX
│   ├── report.csv                      #     categorized by purpose (layout, text, form, …)
│   └── report.json
│
├── customizations/                     # Inline style= and styled() overrides
│   ├── report.md                       #   How often tracked components are customized
│   ├── report.csv                      #     with inline styles or styled-components wrappers
│   └── report.json
│
├── prop-combos/                        # Prop value combination cross-tabulation
│   ├── Text/                           #   One directory per component
│   │   ├── Text-weight-size-combo.md
│   │   ├── Text-weight-size-combo.csv
│   │   └── Text-weight-size-combo.json
│   ├── Button/
│   │   ├── Button-tone-mode-combo.md
│   │   ├── Button-tone-mode-combo.csv
│   │   └── Button-tone-mode-combo.json
│   └── …/                             #   File pattern: <Component>-<prop1>-<prop2>-combo.*
│
├── prop-surface/                       # UI prop character footprint
│   ├── report.md                       #   What percentage of UI-file characters are
│   ├── report.csv                      #     tracked component props/attributes
│   └── report.json
│
└── line-ownership/                     # UI library line ownership
    ├── report.md                       #   What percentage of UI-file lines belong to
    ├── report.csv                      #     tracked library imports and JSX tags
    └── report.json
```

### What each report measures

| Report | Question it answers |
|--------|-------------------|
| **`codebases/{name}/all-components/`** | What React components exist in this codebase and how often is each used? Includes tracked library breakdown and all-source ranking. |
| **`codebases/{name}/wrappers/`** | Which internal wrapper components are used and how? (Only present when `wrapperSources` is configured.) |
| **`codebases/{name}/versions.*`** | Which versions of the tracked library are used in this codebase? |
| **`sources/versions.*`** | Cross-codebase version usage: which codebases use which versions, which components span multiple versions? |
| **`components/summary.*`** | Across all codebases, which tracked UI library components are used most? |
| **`components/detail/<Name>.json`** | For one component: every prop, every value, every file+line reference. |
| **`components/detected-defaults.*`** | Which prop values are redundant because they match the component's default? |
| **`sources/report.*`** | What percentage of JSX elements come from the tracked library vs internal code vs raw HTML? |
| **`html-tags/report.*`** | How much raw HTML (`<div>`, `<span>`, etc.) is used instead of tracked UI components? |
| **`customizations/report.*`** | How often are tracked components overridden with `style={}` or `styled()`? |
| **`prop-combos/report.*`** | Which prop value combinations actually occur (e.g. `weight` × `size` on `<Text>`)? Configured via `propCombos` in the config file. |
| **`prop-surface/report.*`** | What fraction of UI-file characters are tracked component props? |
| **`line-ownership/report.*`** | What fraction of UI-file lines are tracked library imports + JSX tags? |

### Per-component detail JSON

Each `components/detail/<Name>.json` file contains a `props` object keyed by prop name. Each prop entry includes:

| Field | Description |
|-------|-------------|
| `totalUsages` | How many component instances set this prop |
| `unsetInstances` | How many component instances do **not** set this prop (i.e. `totalInstances − totalUsages`) |
| `values` | Map of normalized value → count, sorted by count descending |
| `defaultValue` | The auto-detected default value, if any |
| `defaultUsages` | How many times the prop was explicitly set to its default value |

Each instance reference in the `references` array includes:

| Field | Description |
|-------|-------------|
| `file` | File path relative to the codebase root |
| `packageVersion` | The declared version of the import source package (resolved from the nearest `package.json`). Handles pnpm catalogs, npm aliases, and workspace protocols. `null` if the version could not be determined. |
| `line` | 1-based line number |
| `codebase` | Which codebase the instance belongs to |
| `sourceCode` | The JSX opening tag collapsed to a single line |

#### Version tracking

Every component instance is automatically tagged with the **declared package version** from the nearest `package.json`. This enables version usage analysis without any config changes — the tool resolves versions by walking up the directory tree from each source file.

In a monorepo where different workspace packages depend on different versions of the same library, each file's instances are tagged with its own resolved version. For example, Studio files might show `^3.1.11` while Canvas files show `4.0.0-static.46`.

Version reports are generated automatically:
- **`reports/sources/versions.md`** + **`versions.json`** — Cross-codebase version summary with breakdowns by library, by codebase, and components used across multiple versions.
- **`reports/codebases/{name}/versions.md`** + **`versions.json`** — Per-codebase version breakdown.

#### Value normalization

Prop values are classified and normalized for aggregation:

- **Literals** are kept as-is: booleans (`true`, `false`), numbers (`4`, `0.5`), and short strings (`"primary"`, `"ghost"`).
- **Arrays** with all-literal elements are preserved when short (≤ 40 chars): `[1, 2, 3]`. Longer or dynamic arrays collapse to `<array>`.
- **Objects** with all-literal values are preserved when short (≤ 40 chars): `{color: "red", size: 4}`. Longer or dynamic objects collapse to `<object>`.
- **Dynamic values** are collapsed into category labels: `<variable>`, `<function>`, `<handler>`, `<ternary>`, `<template>`, `<expression>`.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     DATA COLLECTION LAYER                        │
│                                                                  │
│  createContext(config)  →  AnalysisContext                        │
│                            ├─ trackedComponents                  │
│                            ├─ isTrackedUISource(source)          │
│                            ├─ identifyLibrary(source)            │
│                            └─ …                                  │
│                                                                  │
│  perComponent.analyzeFileContent(source, ctx)  →  FileResult     │
│  perComponent.mergeFileResult(reports, result, codebase, path)   │
│  perComponent.buildComponentJson(report)  →  { props, … }       │
│                                                                  │
│  Pure utilities (no context):                                    │
│  parseProps, classifyValue, normalizeValue, recordProp, …        │
├──────────────────────────────────────────────────────────────────┤
│                     REPORT GENERATION LAYER (CLI)                │
│                                                                  │
│  scripts/run.js  ─────────────  npm run analyze                  │
│    ├─ loads component-analytics.config.js from disk              │
│    ├─ calls data collection functions                            │
│    ├─ writes reports/ to filesystem                              │
│    └─ prints console output                                      │
│                                                                  │
│  Each analyzer's main() function:                                │
│    analyzeCodebase() → iterate files → merge → write reports     │
└──────────────────────────────────────────────────────────────────┘
```

The data collection layer (`index.js`, `scripts/lib/context.js`, and the analysis modules' exported functions) can be `require()`-d without a config file on disk. Config loading is deferred — it only happens when a CLI script reads a value without passing an explicit context.

## Project Structure

```
ui-component-analysis/
├── index.js                                # ← Library entry point (data collection API)
├── component-analytics.config.js           # ← CLI configuration file
├── component-analytics.config.test.js      # ← Test configuration (used automatically by Jest)
├── examples/                               # Programmatic usage examples
│   └── programmatic-usage.js               #   Working example: context + analyze + aggregate
├── codebases/                              # Source codebases (git clones)
│   └── <your-codebases>/
├── config/                                 # React Scanner config (reads from component-analytics.config.js)
│   └── react-scanner.config.js             #   Builds scan types dynamically from config
├── scripts/                                # CLI scripts (report generation layer)
│   ├── run.js                              # ← Unified CLI runner (npm run analyze)
│   ├── lib/                                # Shared library
│   │   ├── context.js                      #   createContext() — config-to-context factory
│   │   ├── constants.js                    #   Lazy re-exports from context (CLI backward compat)
│   │   ├── config-schema.js                #   JSDoc typedefs for configuration
│   │   ├── version.js                      #   Package version resolution from package.json
│   │   ├── utils.js                        #   sortByCount, pct, incr, mergeCounters, compact, …
│   │   └── files.js                        #   findFiles, readSafe, writeReports, clearReports, …
│   ├── sources/                            # Import source classification
│   │   └── analyze-ui-component-sources.js
│   ├── html-tags/                          # HTML tag usage analysis
│   │   └── analyze-html-tags.js
│   ├── customizations/                     # Inline style & styled() analysis
│   │   └── analyze-customizations.js
│   ├── per-component/                      # Per-component analysis + default detection
│   │   ├── analyze-per-component.js
│   │   └── detect-prop-defaults.js
│   ├── prop-combos/                        # Prop combination cross-tabulation
│   │   └── analyze-prop-combos.js
│   ├── prop-surface/                       # Character footprint of UI props
│   │   └── analyze-prop-surface.js
│   ├── line-ownership/                     # Line-of-code footprint
│   │   └── analyze-line-ownership.js
│   ├── versions/                           # Version usage analysis
│   │   └── analyze-versions.js
│   ├── components/                         # React Scanner post-processing
│   ├── ui-components/                      # UI wrapper layer post-processing
│   └── __tests__/                          # Unit tests
│       ├── api.test.js                     #   Library API integration tests
│       ├── lib.test.js
│       ├── html-tags.test.js
│       ├── customizations.test.js
│       ├── sources.test.js
│       └── per-component.test.js
├── dashboard/                              # Vite + React dashboard for browsing reports
├── reports/                                # Generated output (cleared on full CLI run)
├── package.json
├── jest.config.js
└── README.md
```

## Adding a New Codebase

1. Clone the repo into a directory (e.g. `codebases/my-app/`).
2. Add an entry to the `codebases` array in `component-analytics.config.js`:
   ```js
   { name: "my-app", path: "./codebases/my-app" }
   ```
3. Run `npm run analyze`.

## Tracking a Different UI Library

1. Edit the `uiLibraries` array in `component-analytics.config.js`.
2. Set `importSources` to the package name(s) (e.g. `["@chakra-ui/react"]`).
3. Optionally list specific component names in `components`. If omitted, all PascalCase imports from the library are tracked automatically.
4. Optionally set `wrapperSources` if the codebase has an internal wrapper layer around the library.
5. Run `npm run analyze`.

Prop defaults are detected automatically from the usage data — no manual configuration needed. Package versions are resolved automatically from `package.json` declarations.

## Testing

Tests use a dedicated configuration file (`component-analytics.config.test.js`) that is automatically loaded when running under Jest. This ensures tests are deterministic regardless of the user's real config. The test config includes explicit component lists so that all test assertions are stable.

```bash
npm test              # run all tests
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
```

## Tools & Dependencies

- **[React Scanner](https://github.com/moroshko/react-scanner)** — component-level usage via static analysis
- **[glob](https://github.com/isaacs/node-glob)** — file discovery
- **[semver](https://github.com/npm/node-semver)** — package version resolution and comparison
- **[Jest](https://jestjs.io/)** — testing
- **Node.js** — custom AST-pattern scripts for HTML tags, styled analysis, and prop detection