# UI Component Analysis

Multi-codebase React component usage analysis for any UI component library. Uses [React Scanner](https://github.com/moroshko/react-scanner) and custom AST-based analyzers to produce actionable reports on component usage, HTML tag prevalence, customization patterns, prop surface area, and line ownership across configurable codebases.

All settings — which codebases to scan, which UI libraries to measure, and which components to track — are controlled by a single configuration file: **`studio-analysis.config.js`**.

## Quick Start

```bash
npm install

# 1. Edit the config file to match your project
#    (codebases, UI libraries, components to track)
vi studio-analysis.config.js

# 2. Run every analysis
npm run analyze

# Or run a single step
npm run analyze:scan             # React Scanner (components + ui-wrappers)
npm run analyze:sources          # Tracked UI library vs internal vs HTML
npm run analyze:html-tags        # Raw HTML tag usage per codebase
npm run analyze:customizations   # Inline styles & styled() on tracked components
npm run analyze:per-component    # Per-component imports, instances, props, defaults
npm run analyze:prop-surface     # Character footprint of UI props
npm run analyze:line-ownership   # Line-of-code footprint of UI library
```

The runner reads codebases and UI libraries from `studio-analysis.config.js` automatically — no hardcoded codebase names in any script.

## Configuration

All project settings live in a single file at the project root:

```
studio-analysis.config.js
```

Edit this file to control **what** gets analysed. Every analysis script reads from it automatically.

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
| `components` | PascalCase component names to track |

Prop defaults are detected automatically from usage data during `npm run analyze` — no manual configuration needed.

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

## Analyses

### 1. Components

All React components imported and rendered across every codebase.

| Report | Path |
|--------|------|
| Summary CSV | `reports/components/component-summary.csv` |
| Detailed CSV | `reports/components/component-usage-detailed.csv` |
| Statistics | `reports/components/component-analysis-stats.txt` |

### 2. UI Component Sources

Classifies every component import as **Sanity UI**, **other UI library**, or **internal**, then measures how many internal components also use Sanity UI.

| Report | Path |
|--------|------|
| Text report | `reports/ui-component-sources/ui-component-sources-report.txt` |
| CSV | `reports/ui-component-sources/ui-component-sources-report.csv` |
| JSON | `reports/ui-component-sources/ui-component-sources-report.json` |

### 5. HTML Tags

Counts every raw HTML element (`<div>`, `<span>`, `<button>`, …) in JSX across all codebases, categorized by purpose (layout, text, form, list, table, media, link, embed).

| Report | Path |
|--------|------|
| Text report | `reports/html-tags/html-tags-report.txt` |
| CSV | `reports/html-tags/html-tags-report.csv` |
| JSON | `reports/html-tags/html-tags-report.json` |

### 6. Per-Component

Individual report for every tracked UI library component with total imports, total JSX instances, prop usage frequencies, prop value distributions, and default-value detection across all codebases.

| Report | Path |
|--------|------|
| Summary text | `reports/per-component/per-component-summary.txt` |
| Summary CSV | `reports/per-component/per-component-summary.csv` |
| Summary JSON | `reports/per-component/per-component-summary.json` |
| Individual JSONs | `reports/per-component/components/<Component>.json` |

### 7. Customizations

Measures how often tracked UI components receive an inline `style` prop or are wrapped with `styled()`. Captures which CSS properties are applied in each case.

| Report | Path |
|--------|------|
| Text report | `reports/sanity-ui-customizations/*-report.txt` |
| CSV | `reports/sanity-ui-customizations/*-report.csv` |
| JSON | `reports/sanity-ui-customizations/*-report.json` |

## Project Structure

```
ui-component-analysis/
├── studio-analysis.config.js           # ← Single configuration file
├── codebases/                          # Source codebases (git clones)
│   └── <your-codebases>/
├── config/                             # React Scanner config (reads from studio-analysis.config.js)
│   └── react-scanner.config.js         #   Unified config; SCAN_TYPE env var selects the mode
├── scripts/                            # Analysis & reporting scripts
│   ├── run.js                          # ← Unified runner (npm run analyze)
│   ├── lib/                            # Shared library
│   │   ├── constants.js                #   Derived from studio-analysis.config.js
│   │   ├── utils.js                    #   sortByCount, pct, incr, mergeCounters, compact, …
│   │   └── files.js                    #   findFiles, readSafe, writeReports, ensureDir, …
│   ├── sources/                        # Import source classification
│   │   └── analyze-ui-component-sources.js
│   ├── html-tags/                      # HTML tag usage analysis
│   │   └── analyze-html-tags.js
│   ├── customizations/                 # Inline style & styled() analysis
│   │   └── analyze-sanity-ui-customizations.js
│   ├── per-component/                  # Per-component analysis + default detection
│   │   ├── analyze-per-component.js
│   │   └── detect-prop-defaults.js
│   ├── prop-surface/                   # Character footprint of UI props
│   │   └── analyze-prop-surface.js
│   ├── line-ownership/                 # Line-of-code footprint
│   │   └── analyze-line-ownership.js
│   ├── components/                     # React Scanner post-processing
│   ├── icons/                          # Icon-specific analysis (legacy)
│   ├── ui-components/                  # UI wrapper layer post-processing
│   └── __tests__/                      # Unit tests (570 tests)
│       ├── lib.test.js
│       ├── html-tags.test.js
│       ├── customizations.test.js
│       ├── sources.test.js
│       └── per-component.test.js
├── reports/                            # Generated output (gitignored csvs/txts)
├── package.json
├── jest.config.js
└── README.md
```

## Testing

```bash
npm test                # Run all 570 tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

Five test suites cover the shared library and custom analysis scripts:

| Suite | Tests | Covers |
|-------|-------|--------|
| `lib.test.js` | 86 | Shared constants, utility functions, file helpers, cross-module integration |
| `html-tags.test.js` | 78 | HTML tag extraction, allowlist filtering, aggregation, report generation |
| `customizations.test.js` | 105 | Inline style & styled() extraction, property parsing, report generation |
| `sources.test.js` | 133 | Import mapping, JSX instance counting, aggregation, HTML tag integration |
| `per-component.test.js` | 134 | Import/instance extraction, prop parsing, value classification, aggregation, report generation |

## Adding a New Codebase

1. Clone the repo into a directory (e.g. `codebases/my-app/`).
2. Add an entry to the `codebases` array in `studio-analysis.config.js`:
   ```js
   { name: "my-app", path: "./codebases/my-app" }
   ```
3. Run `npm run analyze`.

## Tracking a Different UI Library

1. Edit the `uiLibraries` array in `studio-analysis.config.js`.
2. Set `importSources` to the package name(s) (e.g. `["@chakra-ui/react"]`).
3. List the component names you want to track in `components`.
4. Run `npm run analyze`.

Prop defaults are detected automatically from the usage data — no manual configuration needed.

## Tools & Dependencies

- **[React Scanner](https://github.com/moroshko/react-scanner)** — component-level usage via static analysis
- **[glob](https://github.com/isaacs/node-glob)** — file discovery
- **[Jest](https://jestjs.io/)** — testing
- **Node.js** — custom AST-pattern scripts for icons, HTML tags, styled analysis, and prop detection