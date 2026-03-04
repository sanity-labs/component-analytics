# Component Analytics

Measures React component usage for a UI component library. Uses [React Scanner](https://github.com/moroshko/react-scanner) and custom AST-based analyzers to produce actionable reports on component usage, HTML tag prevalence, customization patterns, prop surface area, and line ownership across configurable codebases.

All settings — which codebases to scan, which UI libraries to measure, and which components to track — are controlled by a single configuration file: **`component-analytics.config.js`**. This file is not committed to the repository — copy the included example to get started.

## Quick Start

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

## Configuration

All project settings live in a single file at the project root:

```
component-analytics.config.js
```

This file is **not checked into the repository** — it's `.gitignore`d so each developer/environment can have its own configuration without merge conflicts. An example is provided:

```bash
cp component-analytics.config.example.js component-analytics.config.js
```

Edit the copy to control **what** gets analysed. Every analysis script reads from it automatically. If the config file is missing you'll see an error with instructions when you run any command — including tests. There is no silent fallback.

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

Define one or more UI component libraries whose usage you want to measure. Each entry specifies import sources and component names:

```js
uiLibraries: [
  {
    name: "My UI Library",
    importSources: ["@my-org/ui"],
    excludeSources: ["@my-org/ui/theme"],
    wrapperSources: ["ui-components"],
    components: ["Box", "Button", "Card", "Flex", "Text", /* … */],
  },
  {
    name: "My Icons",
    importSources: ["@my-org/icons"],
    excludeSources: [],
    components: ["AddIcon", "CloseIcon", "EditIcon", /* … */],
  },
],
```

Components from all entries are merged into a single tracked set. All libraries' import sources are matched together when classifying JSX elements.

| Field | Purpose |
|-------|---------|
| `importSources` | Package names matched as substrings against import paths |
| `excludeSources` | Import paths to ignore even if they match an `importSource` |
| `wrapperSources` | Optional. Import-path substrings that identify an internal wrapper layer around this library (e.g. `["ui-components"]`). When present, a separate "wrappers" scan measures how much code goes through the wrapper vs. importing the library directly. |
| `components` | PascalCase component names to track |

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
│       │   └── stats.md                #     Human-readable statistics
│       └── wrappers/                   #   Only internal UI wrapper components
│           ├── wrappers.json           #     Raw React Scanner JSON
│           ├── summary.csv             #     Wrapper component summary
│           ├── detailed.csv            #     Wrapper component × prop × value
│           └── stats.md                #     Human-readable statistics
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
│   └── report.json
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
| **`codebases/{name}/all-components/`** | What React components exist in this codebase and how often is each used? |
| **`codebases/{name}/wrappers/`** | Which internal wrapper components are used and how? (Only present when `wrapperSources` is configured.) |
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

#### Value normalization

Prop values are classified and normalized for aggregation:

- **Literals** are kept as-is: booleans (`true`, `false`), numbers (`4`, `0.5`), and short strings (`"primary"`, `"ghost"`).
- **Arrays** with all-literal elements are preserved when short (≤ 40 chars): `[1, 2, 3]`. Longer or dynamic arrays collapse to `<array>`.
- **Objects** with all-literal values are preserved when short (≤ 40 chars): `{color: "red", size: 4}`. Longer or dynamic objects collapse to `<object>`.
- **Dynamic values** are collapsed into category labels: `<variable>`, `<function>`, `<handler>`, `<ternary>`, `<template>`, `<expression>`.

## Project Structure

```
ui-component-analysis/
├── component-analytics.config.js           # ← Single configuration file
├── codebases/                          # Source codebases (git clones)
│   └── <your-codebases>/
├── config/                             # React Scanner config (reads from component-analytics.config.js)
│   └── react-scanner.config.js         #   Builds scan types dynamically from config
├── scripts/                            # Analysis & reporting scripts
│   ├── run.js                          # ← Unified runner (npm run analyze)
│   ├── lib/                            # Shared library
│   │   ├── constants.js                #   Derived from component-analytics.config.js
│   │   ├── config-schema.js            #   JSDoc typedefs for configuration
│   │   ├── utils.js                    #   sortByCount, pct, incr, mergeCounters, compact, …
│   │   └── files.js                    #   findFiles, readSafe, writeReports, clearReports, …
│   ├── sources/                        # Import source classification
│   │   └── analyze-ui-component-sources.js
│   ├── html-tags/                      # HTML tag usage analysis
│   │   └── analyze-html-tags.js
│   ├── customizations/                 # Inline style & styled() analysis
│   │   └── analyze-sanity-ui-customizations.js
│   ├── per-component/                  # Per-component analysis + default detection
│   │   ├── analyze-per-component.js
│   │   └── detect-prop-defaults.js
│   ├── prop-combos/                    # Prop combination cross-tabulation
│   │   └── analyze-prop-combos.js
│   ├── prop-surface/                   # Character footprint of UI props
│   │   └── analyze-prop-surface.js
│   ├── line-ownership/                 # Line-of-code footprint
│   │   └── analyze-line-ownership.js
│   ├── components/                     # React Scanner post-processing
│   ├── ui-components/                  # UI wrapper layer post-processing
│   └── __tests__/                      # Unit tests
│       ├── lib.test.js
│       ├── html-tags.test.js
│       ├── customizations.test.js
│       ├── sources.test.js
│       └── per-component.test.js
├── dashboard/                          # Vite + React dashboard for browsing reports
├── reports/                            # Generated output (cleared on full run)
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
3. List the component names you want to track in `components`.
4. Optionally set `wrapperSources` if the codebase has an internal wrapper layer around the library.
5. Run `npm run analyze`.

Prop defaults are detected automatically from the usage data — no manual configuration needed.

## Tools & Dependencies

- **[React Scanner](https://github.com/moroshko/react-scanner)** — component-level usage via static analysis
- **[glob](https://github.com/isaacs/node-glob)** — file discovery
- **[Jest](https://jestjs.io/)** — testing
- **Node.js** — custom AST-pattern scripts for icons, HTML tags, styled analysis, and prop detection