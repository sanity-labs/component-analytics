# Studio Analysis

Multi-codebase React component analysis for Sanity Studio. Uses [React Scanner](https://github.com/moroshko/react-scanner) and custom AST-based analyzers to produce actionable reports on component usage, icon adoption, HTML tag prevalence, and Sanity UI customization patterns across the **sanity**, **canvas**, and **huey** codebases.

## Quick Start

```bash
npm install

# Run every analysis (components, icons, UI, HTML tags, customizations)
npm run analyze

# Or run individually
npm run analyze:components              # All React component usage
npm run analyze:icons                   # @sanity/icons usage (JSX + props)
npm run analyze:ui                      # ui-components wrapper layer
npm run analyze:ui-sources              # Sanity UI vs internal import sources
npm run analyze:html-tags               # Raw HTML tag usage per codebase
npm run analyze:sanity-ui-customizations # Inline styles & styled() on Sanity UI
npm run analyze:per-component            # Per-component import, instance & prop analysis
```

## Analyses

### 1. Components

All React components imported and rendered across every codebase.

| Report | Path |
|--------|------|
| Summary CSV | `reports/components/component-summary.csv` |
| Detailed CSV | `reports/components/component-usage-detailed.csv` |
| Statistics | `reports/components/component-analysis-stats.txt` |

### 2. Icons

Every `@sanity/icons` icon tracked in both JSX (`<AddIcon />`) and prop (`icon={AddIcon}`) positions. Per-codebase CSVs plus an aggregate report combining all three codebases.

| Report | Path |
|--------|------|
| Per-codebase | `reports/{codebase}/icons/icon-analysis-comprehensive.csv` |
| Aggregate CSV | `reports/icon-analysis-aggregate.csv` |
| Aggregate stats | `reports/icon-analysis-aggregate-stats.txt` |

### 3. UI Components

Usage of the 13 internal wrapper components in `sanity/packages/sanity/src/ui-components` (Button, MenuItem, Tooltip, Dialog, etc.).

| Report | Path |
|--------|------|
| Summary CSV | `reports/ui-components/ui-components-summary.csv` |
| Detailed CSV | `reports/ui-components/ui-components-usage-detailed.csv` |
| Statistics | `reports/ui-components/ui-components-stats.txt` |

### 4. UI Component Sources

Classifies every component import as **Sanity UI**, **other UI library**, or **internal**, then measures how many internal components also use Sanity UI.

| Report | Path |
|--------|------|
| Text report | `reports/ui-component-sources/ui-component-sources-report.txt` |
| CSV | `reports/ui-component-sources/ui-component-sources-report.csv` |
| JSON | `reports/ui-component-sources/ui-component-sources-report.json` |

### 5. HTML Tags

Counts every raw HTML element (`<div>`, `<span>`, `<button>`, …) in JSX across all codebases, categorised by purpose (layout, text, form, list, table, media, link, embed).

| Report | Path |
|--------|------|
| Text report | `reports/html-tags/html-tags-report.txt` |
| CSV | `reports/html-tags/html-tags-report.csv` |
| JSON | `reports/html-tags/html-tags-report.json` |

### 6. Per-Component Sanity UI

Individual report for every `@sanity/ui` component with total imports, total JSX instances, prop usage frequencies, and prop value distributions across all codebases.

| Report | Path |
|--------|------|
| Summary text | `reports/per-component/per-component-summary.txt` |
| Summary CSV | `reports/per-component/per-component-summary.csv` |
| Summary JSON | `reports/per-component/per-component-summary.json` |
| Individual JSONs | `reports/per-component/components/<Component>.json` |

### 7. Sanity UI Customizations

Measures how often Sanity UI primitives receive an inline `style` prop or are wrapped with `styled()`. Captures which CSS properties are applied in each case.

| Report | Path |
|--------|------|
| Text report | `reports/sanity-ui-customizations/sanity-ui-customizations-report.txt` |
| CSV | `reports/sanity-ui-customizations/sanity-ui-customizations-report.csv` |
| JSON | `reports/sanity-ui-customizations/sanity-ui-customizations-report.json` |

## Project Structure

```
studio-analysis/
├── codebases/                          # Source codebases (git clones)
│   ├── sanity/
│   ├── canvas/
│   └── huey/
├── config/                             # React Scanner configs
│   ├── react-scanner.config.js
│   ├── react-scanner-icons.config.js
│   ├── react-scanner-ui-components.config.js
│   ├── react-scanner-sanity-ui.config.js
│   └── react-scanner-all-components.config.js
├── scripts/                            # Analysis & reporting scripts
│   ├── lib/                            # Shared library
│   │   ├── constants.js                #   CODEBASES, SANITY_UI_COMPONENTS, HTML_TAG_CATEGORIES
│   │   ├── utils.js                    #   sortByCount, pct, incr, mergeCounters, compact, …
│   │   └── files.js                    #   findFiles, readSafe, writeReports, ensureDir, …
│   ├── components/                     # React Scanner post-processing
│   │   ├── convert-to-csv.js
│   │   ├── create-summary-csv.js
│   │   └── generate-stats.js
│   ├── icons/                          # @sanity/icons analysis
│   │   ├── analyze-icons-comprehensive.js
│   │   ├── aggregate-icon-reports.js
│   │   ├── analyze-icon-props.js
│   │   ├── convert-icons-to-csv.js
│   │   └── create-icon-summary.js
│   ├── ui-components/                  # UI wrapper layer analysis
│   │   ├── convert-ui-components-to-csv.js
│   │   └── create-ui-components-summary.js
│   ├── sources/                        # Import-source classification
│   │   └── analyze-ui-component-sources.js
│   ├── html-tags/                      # HTML tag usage analysis
│   │   └── analyze-html-tags.js
│   ├── customizations/                 # Inline style & styled() analysis
│   │   └── analyze-sanity-ui-customizations.js
│   ├── per-component/                  # Per-component Sanity UI analysis
│   │   └── analyze-per-component.js
│   └── __tests__/                      # Unit tests (536 tests)
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
npm test                # Run all 536 tests
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

1. Clone the repo into `codebases/<name>/`.
2. Add `<name>` to the `CODEBASES` array in each config and script file.
3. Run `npm run analyze`.

## Tools & Dependencies

- **[React Scanner](https://github.com/moroshko/react-scanner)** — component-level usage via static analysis
- **[glob](https://github.com/isaacs/node-glob)** — file discovery
- **[Jest](https://jestjs.io/)** — testing
- **Node.js** — custom AST-pattern scripts for icons, HTML tags, and styled analysis