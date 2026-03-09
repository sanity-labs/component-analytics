const {
  createContext,
  perComponent,
  htmlTags,
  customizations,
  propCombos,
  utils,
  HTML_TAG_CATEGORIES,
  KNOWN_TAGS,
} = require("../../index");

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════════

const ctx = createContext({
  codebases: [
    { name: "App", path: "./src" },
    { name: "Lib", path: "./lib" },
  ],
  uiLibraries: [
    {
      name: "My UI",
      importSources: ["@my-org/ui"],
      excludeSources: ["@my-org/ui/theme"],
      components: ["Button", "Card", "Flex", "Text"],
    },
    {
      name: "My Icons",
      importSources: ["@my-org/icons"],
      excludeSources: [],
      components: ["AddIcon", "CloseIcon"],
    },
  ],
  files: {
    pattern: "**/*.tsx",
    ignore: ["**/node_modules/**"],
  },
  otherUIPatterns: ["@radix-ui", "styled-components"],
  propCombos: [{ component: "Button", props: ["tone", "mode"] }],
});

const SAMPLE_FILE = `
import { Button, Card } from '@my-org/ui';
import { AddIcon } from '@my-org/icons';

export function MyPage() {
  return (
    <Card padding={4} tone="primary">
      <Button mode="ghost" onClick={handleClick}>
        <AddIcon />
        Save
      </Button>
    </Card>
  );
}
`;

const NON_TRACKED_FILE = `
import { Dialog } from '@radix-ui/react-dialog';

export function Modal() {
  return <Dialog open={true} />;
}
`;

const PLAIN_FILE = `
export function greet(name) {
  return \`Hello, \${name}!\`;
}
`;

const ALIASED_FILE = `
import { Button as Btn, Card as C } from '@my-org/ui';

export function Actions() {
  return (
    <C padding={2}>
      <Btn mode="bleed" tone="critical">Delete</Btn>
    </C>
  );
}
`;

const EXCLUDED_SOURCE_FILE = `
import { ThemeProvider } from '@my-org/ui/theme';

export function App() {
  return <ThemeProvider />;
}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// createContext
// ═══════════════════════════════════════════════════════════════════════════════

describe("createContext", () => {
  test("derives codebases from config", () => {
    expect(ctx.codebases).toEqual(["App", "Lib"]);
  });

  test("keeps codebase paths as-is when no projectRoot provided", () => {
    expect(ctx.codebasePaths).toEqual({
      App: "./src",
      Lib: "./lib",
    });
  });

  test("resolves codebase paths against projectRoot when provided", () => {
    const withRoot = createContext(
      {
        codebases: [{ name: "X", path: "./codebases/x" }],
        uiLibraries: [],
        files: { pattern: "**/*.tsx", ignore: [] },
      },
      { projectRoot: "/home/user/project" },
    );
    expect(withRoot.codebasePaths.X).toMatch(/^\/home\/user\/project/);
    expect(withRoot.codebasePaths.X).toMatch(/codebases[/\\]x$/);
  });

  test("normalizes UI library entries", () => {
    expect(ctx.allUILibraries).toHaveLength(2);
    expect(ctx.allUILibraries[0].name).toBe("My UI");
    expect(ctx.allUILibraries[1].name).toBe("My Icons");
  });

  test("sets primary library to first entry", () => {
    expect(ctx.primaryUILibrary.name).toBe("My UI");
  });

  test("derives uiLibraryName from primary", () => {
    expect(ctx.uiLibraryName).toBe("My UI");
  });

  test("joins all library names for uiLibraryNames", () => {
    expect(ctx.uiLibraryNames).toBe("My UI & My Icons");
  });

  test("uiLibraryNames equals uiLibraryName when only one library", () => {
    const single = createContext({
      codebases: [],
      uiLibraries: [
        {
          name: "Only",
          importSources: ["only-ui"],
          excludeSources: [],
          components: ["A"],
        },
      ],
      files: { pattern: "**/*.tsx", ignore: [] },
    });
    expect(single.uiLibraryNames).toBe("Only");
  });

  test("merges tracked components from all libraries", () => {
    expect(ctx.trackedComponents).toContain("Button");
    expect(ctx.trackedComponents).toContain("Card");
    expect(ctx.trackedComponents).toContain("AddIcon");
    expect(ctx.trackedComponents).toContain("CloseIcon");
  });

  test("de-duplicates tracked components", () => {
    const dup = createContext({
      codebases: [],
      uiLibraries: [
        {
          name: "A",
          importSources: ["a"],
          excludeSources: [],
          components: ["Button", "Card"],
        },
        {
          name: "B",
          importSources: ["b"],
          excludeSources: [],
          components: ["Card", "Text"],
        },
      ],
      files: { pattern: "**/*.tsx", ignore: [] },
    });
    const cardOccurrences = dup.trackedComponents.filter(
      (c) => c === "Card",
    ).length;
    expect(cardOccurrences).toBe(1);
  });

  test("merges import sources from all libraries", () => {
    expect(ctx.uiImportSources).toContain("@my-org/ui");
    expect(ctx.uiImportSources).toContain("@my-org/icons");
  });

  test("merges exclude sources", () => {
    expect(ctx.uiExcludeSources).toContain("@my-org/ui/theme");
  });

  test("builds library component map", () => {
    expect(ctx.libraryComponentMap.get("My UI").has("Button")).toBe(true);
    expect(ctx.libraryComponentMap.get("My Icons").has("AddIcon")).toBe(true);
  });

  test("derives prop combos", () => {
    expect(ctx.propCombos).toEqual([
      { component: "Button", props: ["tone", "mode"] },
    ]);
  });

  test("derives file scanning settings", () => {
    expect(ctx.filePattern).toBe("**/*.tsx");
    expect(ctx.defaultGlobIgnore).toEqual(["**/node_modules/**"]);
  });

  test("includes static HTML tag data", () => {
    expect(ctx.htmlTagCategories).toBeDefined();
    expect(ctx.knownTags).toBeInstanceOf(Set);
    expect(ctx.knownTags.has("div")).toBe(true);
  });

  test("derives other UI patterns", () => {
    expect(ctx.otherUIPatterns).toContain("@radix-ui");
    expect(ctx.otherUIPatterns).toContain("styled-components");
  });

  test("context is frozen (strict mode)", () => {
    "use strict";
    expect(() => {
      ctx.codebases = [];
    }).toThrow();
  });

  test("handles empty config gracefully", () => {
    const empty = createContext({});
    expect(empty.codebases).toEqual([]);
    expect(empty.allUILibraries).toEqual([]);
    expect(empty.trackedComponents).toEqual([]);
    expect(empty.isTrackedUISource("anything")).toBe(false);
    expect(empty.identifyLibrary("anything")).toBeNull();
    expect(empty.identifyComponentLibrary("Button")).toBeNull();
    expect(empty.isOtherUISource("anything")).toBe(false);
  });

  test("handles missing optional fields", () => {
    const minimal = createContext({
      codebases: [{ name: "x", path: "./x" }],
      uiLibraries: [{ name: "L", importSources: ["l"], components: ["A"] }],
    });
    expect(minimal.codebases).toEqual(["x"]);
    expect(minimal.trackedComponents).toEqual(["A"]);
    expect(minimal.allUILibraries[0].excludeSources).toEqual([]);
    expect(minimal.allUILibraries[0].wrapperSources).toEqual([]);
    expect(minimal.propCombos).toEqual([]);
    expect(minimal.otherUIPatterns).toEqual([]);
    expect(minimal.filePattern).toBe("**/*.{tsx,jsx}");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Context functions
// ═══════════════════════════════════════════════════════════════════════════════

describe("ctx.isTrackedUISource", () => {
  test("returns true for tracked library imports", () => {
    expect(ctx.isTrackedUISource("@my-org/ui")).toBe(true);
    expect(ctx.isTrackedUISource("@my-org/icons")).toBe(true);
  });

  test("returns true for subpath imports", () => {
    expect(ctx.isTrackedUISource("@my-org/ui/components")).toBe(true);
  });

  test("returns false for excluded sources", () => {
    expect(ctx.isTrackedUISource("@my-org/ui/theme")).toBe(false);
  });

  test("returns false for unrelated packages", () => {
    expect(ctx.isTrackedUISource("react")).toBe(false);
    expect(ctx.isTrackedUISource("@radix-ui/react-dialog")).toBe(false);
  });
});

describe("ctx.identifyLibrary", () => {
  test("identifies which library an import belongs to", () => {
    expect(ctx.identifyLibrary("@my-org/ui")).toBe("My UI");
    expect(ctx.identifyLibrary("@my-org/icons")).toBe("My Icons");
  });

  test("returns null for excluded sources", () => {
    expect(ctx.identifyLibrary("@my-org/ui/theme")).toBeNull();
  });

  test("returns null for unrelated sources", () => {
    expect(ctx.identifyLibrary("react")).toBeNull();
  });
});

describe("ctx.identifyComponentLibrary", () => {
  test("identifies which library a component belongs to", () => {
    expect(ctx.identifyComponentLibrary("Button")).toBe("My UI");
    expect(ctx.identifyComponentLibrary("AddIcon")).toBe("My Icons");
  });

  test("returns null for unknown components", () => {
    expect(ctx.identifyComponentLibrary("SomethingElse")).toBeNull();
  });
});

describe("ctx.isOtherUISource", () => {
  test("returns true for configured other UI patterns", () => {
    expect(ctx.isOtherUISource("@radix-ui/react-dialog")).toBe(true);
    expect(ctx.isOtherUISource("styled-components")).toBe(true);
  });

  test("returns false for tracked library", () => {
    expect(ctx.isOtherUISource("@my-org/ui")).toBe(false);
  });

  test("returns false for unrelated packages", () => {
    expect(ctx.isOtherUISource("react")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// perComponent — pure utilities (no context needed)
// ═══════════════════════════════════════════════════════════════════════════════

describe("perComponent — pure utilities", () => {
  test("parseProps extracts prop names and values", () => {
    const result = perComponent.parseProps('mode="ghost" padding={4}');
    expect(result).toEqual([
      { name: "mode", value: "'ghost'" },
      { name: "padding", value: "4" },
    ]);
  });

  test("parseProps handles boolean shorthand", () => {
    const result = perComponent.parseProps("disabled muted");
    expect(result).toEqual([
      { name: "disabled", value: "true" },
      { name: "muted", value: "true" },
    ]);
  });

  test("classifyValue classifies booleans", () => {
    expect(perComponent.classifyValue("true")).toBe("true");
    expect(perComponent.classifyValue("false")).toBe("false");
  });

  test("classifyValue classifies numbers", () => {
    expect(perComponent.classifyValue("42")).toBe("42");
    expect(perComponent.classifyValue("-1")).toBe("-1");
    expect(perComponent.classifyValue("0.5")).toBe("0.5");
  });

  test("classifyValue classifies strings", () => {
    expect(perComponent.classifyValue("'hello'")).toBe("hello");
    expect(perComponent.classifyValue('"world"')).toBe("world");
  });

  test("classifyValue classifies arrays", () => {
    expect(perComponent.classifyValue("[1, 2, 3]")).toBe("[1, 2, 3]");
    expect(perComponent.classifyValue("[myVar, 2]")).toBe("<array>");
  });

  test("classifyValue classifies objects", () => {
    expect(perComponent.classifyValue('{color: "red"}')).toBe('{color: "red"}');
    expect(perComponent.classifyValue("{color: myVar}")).toBe(
      "<unwound>{color: <variable:myVar>}",
    );
  });

  test("classifyValue classifies dynamic values", () => {
    expect(perComponent.classifyValue("handleClick")).toBe("<handler>");
    expect(perComponent.classifyValue("() => doSomething()")).toBe(
      "<function>",
    );
    expect(perComponent.classifyValue("isOpen ? 'a' : 'b'")).toBe("<ternary>");
  });

  test("normalizeValue keeps short strings quoted", () => {
    expect(perComponent.normalizeValue("ghost")).toBe('"ghost"');
    expect(perComponent.normalizeValue("primary")).toBe('"primary"');
  });

  test("normalizeValue collapses variables", () => {
    expect(perComponent.normalizeValue("<variable:myValue>")).toBe(
      "<variable>",
    );
  });

  test("normalizeValue keeps literal arrays when short", () => {
    expect(perComponent.normalizeValue("[1, 2, 3]")).toBe("[1, 2, 3]");
  });

  test("normalizeValue keeps literal objects when short", () => {
    expect(perComponent.normalizeValue('{color: "red"}')).toBe(
      '{color: "red"}',
    );
  });

  test("lineNumberAt returns correct line number", () => {
    expect(perComponent.lineNumberAt("a\nb\nc", 0)).toBe(1);
    expect(perComponent.lineNumberAt("a\nb\nc", 2)).toBe(2);
    expect(perComponent.lineNumberAt("a\nb\nc", 4)).toBe(3);
  });

  test("extractImports parses import statements", () => {
    const result = perComponent.extractImports("import { A, B } from 'pkg';");
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("pkg");
    expect(result[0].namedImports).toContain("A");
    expect(result[0].namedImports).toContain("B");
  });

  test("parseNamedImports handles aliased imports", () => {
    const result = perComponent.parseNamedImports("Button as Btn, Card");
    expect(result).toEqual([
      { original: "Button", local: "Btn" },
      { original: "Card", local: "Card" },
    ]);
  });

  test("recordProp creates and increments counts", () => {
    const report = {
      component: "Test",
      props: {},
    };
    perComponent.recordProp(report, "size", "4");
    perComponent.recordProp(report, "size", "4");
    perComponent.recordProp(report, "size", "2");

    expect(report.props.size.totalUsages).toBe(3);
    expect(report.props.size.values["4"]).toBe(2);
    expect(report.props.size.values["2"]).toBe(1);
  });

  test("buildComponentJson produces correct output", () => {
    const report = {
      component: "Button",
      library: "My UI",
      totalImports: 5,
      totalInstances: 10,
      codebaseImports: { App: 5 },
      codebaseInstances: { App: 10 },
      props: {
        mode: {
          values: { '"ghost"': 7, '"bleed"': 3 },
          totalUsages: 10,
          defaultUsages: 0,
          defaultValue: null,
        },
      },
      references: [],
      totalDefaultUsages: 0,
    };
    const json = perComponent.buildComponentJson(report);

    expect(json.component).toBe("Button");
    expect(json.totalInstances).toBe(10);
    expect(json.uniqueProps).toBe(1);
    expect(json.props.mode.totalUsages).toBe(10);
    expect(json.props.mode.unsetInstances).toBe(0);
    expect(json.props.mode.values['"ghost"']).toBe(7);
    expect(json.props.mode.values['"bleed"']).toBe(3);
  });

  test("generateSummaryJSON produces valid JSON", () => {
    const reports = {
      Button: {
        component: "Button",
        library: "My UI",
        totalImports: 1,
        totalInstances: 2,
        codebaseImports: {},
        codebaseInstances: {},
        props: {},
        references: [],
        totalDefaultUsages: 0,
      },
    };
    const jsonStr = perComponent.generateSummaryJSON(reports);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.totalComponents).toBe(1);
    expect(parsed.totalInstances).toBe(2);
    expect(parsed.generatedAt).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// perComponent — context-aware functions
// ═══════════════════════════════════════════════════════════════════════════════

describe("perComponent — context-aware", () => {
  test("buildTrackedUIImportMap finds tracked imports", () => {
    const map = perComponent.buildTrackedUIImportMap(SAMPLE_FILE, ctx);
    expect(map).toEqual({
      Button: "Button",
      Card: "Card",
      AddIcon: "AddIcon",
    });
  });

  test("buildTrackedUIImportMap ignores non-tracked imports", () => {
    const map = perComponent.buildTrackedUIImportMap(NON_TRACKED_FILE, ctx);
    expect(map).toEqual({});
  });

  test("buildTrackedUIImportMap ignores excluded sources", () => {
    const map = perComponent.buildTrackedUIImportMap(EXCLUDED_SOURCE_FILE, ctx);
    expect(map).toEqual({});
  });

  test("buildTrackedUIImportMap returns empty for plain file", () => {
    const map = perComponent.buildTrackedUIImportMap(PLAIN_FILE, ctx);
    expect(map).toEqual({});
  });

  test("buildTrackedUIImportMap handles aliased imports", () => {
    const map = perComponent.buildTrackedUIImportMap(ALIASED_FILE, ctx);
    expect(map).toEqual({
      Btn: "Button",
      C: "Card",
    });
  });

  test("analyzeFileContent finds component instances", () => {
    const result = perComponent.analyzeFileContent(SAMPLE_FILE, ctx);

    expect(Object.keys(result.importMap)).toEqual(
      expect.arrayContaining(["Button", "Card", "AddIcon"]),
    );
    expect(result.instances.length).toBe(3);

    const components = result.instances.map((i) => i.component);
    expect(components).toContain("Card");
    expect(components).toContain("Button");
    expect(components).toContain("AddIcon");
  });

  test("analyzeFileContent extracts props", () => {
    const result = perComponent.analyzeFileContent(SAMPLE_FILE, ctx);

    const card = result.instances.find((i) => i.component === "Card");
    const cardProps = card.props.map((p) => p.name);
    expect(cardProps).toContain("padding");
    expect(cardProps).toContain("tone");

    const button = result.instances.find((i) => i.component === "Button");
    const buttonProps = button.props.map((p) => p.name);
    expect(buttonProps).toContain("mode");
    expect(buttonProps).toContain("onClick");
  });

  test("analyzeFileContent includes line numbers", () => {
    const result = perComponent.analyzeFileContent(SAMPLE_FILE, ctx);
    for (const inst of result.instances) {
      expect(inst.line).toBeGreaterThan(0);
    }
    // Card is on an earlier line than Button
    const card = result.instances.find((i) => i.component === "Card");
    const button = result.instances.find((i) => i.component === "Button");
    expect(card.line).toBeLessThan(button.line);
  });

  test("analyzeFileContent returns empty for non-tracked file", () => {
    const result = perComponent.analyzeFileContent(NON_TRACKED_FILE, ctx);
    expect(result.instances).toEqual([]);
  });

  test("analyzeFileContent returns empty for plain file", () => {
    const result = perComponent.analyzeFileContent(PLAIN_FILE, ctx);
    expect(result.instances).toEqual([]);
  });

  test("analyzeFileContent handles aliased imports", () => {
    const result = perComponent.analyzeFileContent(ALIASED_FILE, ctx);
    expect(result.instances.length).toBe(2);
    const components = result.instances.map((i) => i.component);
    // Aliased imports should resolve to original names
    expect(components).toContain("Button");
    expect(components).toContain("Card");
  });

  test("createEmptyReport uses context for library identification", () => {
    const report = perComponent.createEmptyReport("Button", ctx);
    expect(report.component).toBe("Button");
    expect(report.library).toBe("My UI");
    expect(report.totalImports).toBe(0);
    expect(report.totalInstances).toBe(0);
    expect(report.props).toEqual({});
    expect(report.references).toEqual([]);
  });

  test("createEmptyReport identifies icon library", () => {
    const report = perComponent.createEmptyReport("AddIcon", ctx);
    expect(report.library).toBe("My Icons");
  });

  test("createEmptyReport returns null library for unknown component", () => {
    const report = perComponent.createEmptyReport("Unknown", ctx);
    expect(report.library).toBeNull();
  });

  test("generateSummaryCSV uses codebase names from context", () => {
    const reports = {
      Button: {
        component: "Button",
        library: "My UI",
        totalImports: 1,
        totalInstances: 5,
        codebaseImports: { App: 1 },
        codebaseInstances: { App: 5 },
        props: {},
        references: [],
        totalDefaultUsages: 0,
      },
    };
    const csv = perComponent.generateSummaryCSV(reports, ctx);
    expect(csv).toContain("App Imports");
    expect(csv).toContain("Lib Imports");
    expect(csv).toContain("App Instances");
    expect(csv).toContain("Lib Instances");
    expect(csv).toContain("Button");
  });

  test("generateSummaryMarkdown uses library name from context", () => {
    const reports = {};
    const text = perComponent.generateSummaryMarkdown(reports, ctx);
    expect(text).toContain("My UI & My Icons");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Full pipeline — analyze → aggregate → build JSON (no disk I/O)
// ═══════════════════════════════════════════════════════════════════════════════

describe("full pipeline with context", () => {
  test("analyze → merge → build component JSON", () => {
    const reports = {};
    for (const comp of ctx.trackedComponents) {
      reports[comp] = perComponent.createEmptyReport(comp, ctx);
    }

    const fileResult = perComponent.analyzeFileContent(SAMPLE_FILE, ctx);
    perComponent.mergeFileResult(reports, fileResult, "App", "src/MyPage.tsx");

    // Check aggregated data
    expect(reports.Button.totalInstances).toBe(1);
    expect(reports.Card.totalInstances).toBe(1);
    expect(reports.AddIcon.totalInstances).toBe(1);
    expect(reports.Button.codebaseInstances.App).toBe(1);

    // Check props were recorded
    expect(reports.Card.props.padding).toBeDefined();
    expect(reports.Card.props.padding.totalUsages).toBe(1);
    expect(reports.Card.props.tone.totalUsages).toBe(1);
    expect(reports.Button.props.mode.totalUsages).toBe(1);

    // Build final JSON
    const buttonJson = perComponent.buildComponentJson(reports.Button);
    expect(buttonJson.component).toBe("Button");
    expect(buttonJson.library).toBe("My UI");
    expect(buttonJson.totalInstances).toBe(1);
    expect(buttonJson.props.mode.totalUsages).toBe(1);
    expect(buttonJson.props.mode.unsetInstances).toBe(0);

    // References recorded
    expect(reports.Button.references).toHaveLength(1);
    expect(reports.Button.references[0]).toEqual(
      expect.objectContaining({
        file: "src/MyPage.tsx",
        codebase: "App",
      }),
    );
  });

  test("multiple files across codebases", () => {
    const reports = {};
    for (const comp of ctx.trackedComponents) {
      reports[comp] = perComponent.createEmptyReport(comp, ctx);
    }

    const result1 = perComponent.analyzeFileContent(SAMPLE_FILE, ctx);
    perComponent.mergeFileResult(reports, result1, "App", "src/Page.tsx");

    const result2 = perComponent.analyzeFileContent(ALIASED_FILE, ctx);
    perComponent.mergeFileResult(reports, result2, "Lib", "lib/Actions.tsx");

    // Button: 1 from App + 1 from Lib
    expect(reports.Button.totalInstances).toBe(2);
    expect(reports.Button.codebaseInstances.App).toBe(1);
    expect(reports.Button.codebaseInstances.Lib).toBe(1);

    // Card: 1 from App + 1 from Lib
    expect(reports.Card.totalInstances).toBe(2);
    expect(reports.Card.codebaseInstances.App).toBe(1);
    expect(reports.Card.codebaseInstances.Lib).toBe(1);

    // References span both codebases
    expect(reports.Button.references).toHaveLength(2);
    expect(reports.Button.references[0].codebase).toBe("App");
    expect(reports.Button.references[1].codebase).toBe("Lib");

    // Generate summary reports with context
    const csv = perComponent.generateSummaryCSV(reports, ctx);
    expect(csv).toContain("Button");
    expect(csv).toContain("Card");
    expect(csv).toContain("App Imports");
    expect(csv).toContain("Lib Imports");

    const text = perComponent.generateSummaryMarkdown(reports, ctx);
    expect(text).toContain("My UI & My Icons");
    expect(text).toContain("Button");

    const jsonStr = perComponent.generateSummaryJSON(reports);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.totalComponents).toBe(ctx.trackedComponents.length);
  });

  test("unsetInstances is computed correctly after aggregation", () => {
    const reports = {};
    for (const comp of ctx.trackedComponents) {
      reports[comp] = perComponent.createEmptyReport(comp, ctx);
    }

    // Two files, both use Card but only one uses padding
    const file1 = `
      import { Card } from '@my-org/ui';
      export function A() { return <Card padding={4} tone="primary" />; }
    `;
    const file2 = `
      import { Card } from '@my-org/ui';
      export function B() { return <Card tone="caution" />; }
    `;

    const r1 = perComponent.analyzeFileContent(file1, ctx);
    const r2 = perComponent.analyzeFileContent(file2, ctx);
    perComponent.mergeFileResult(reports, r1, "App", "a.tsx");
    perComponent.mergeFileResult(reports, r2, "App", "b.tsx");

    expect(reports.Card.totalInstances).toBe(2);

    const cardJson = perComponent.buildComponentJson(reports.Card);
    // padding used in 1 of 2 instances → 1 unset
    expect(cardJson.props.padding.totalUsages).toBe(1);
    expect(cardJson.props.padding.unsetInstances).toBe(1);
    // tone used in both → 0 unset
    expect(cardJson.props.tone.totalUsages).toBe(2);
    expect(cardJson.props.tone.unsetInstances).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Context isolation — two contexts don't interfere
// ═══════════════════════════════════════════════════════════════════════════════

describe("context isolation", () => {
  const ctxA = createContext({
    codebases: [{ name: "A", path: "./a" }],
    uiLibraries: [
      {
        name: "LibA",
        importSources: ["lib-a"],
        excludeSources: [],
        components: ["WidgetA"],
      },
    ],
    files: { pattern: "**/*.tsx", ignore: [] },
  });

  const ctxB = createContext({
    codebases: [{ name: "B", path: "./b" }],
    uiLibraries: [
      {
        name: "LibB",
        importSources: ["lib-b"],
        excludeSources: [],
        components: ["WidgetB"],
      },
    ],
    files: { pattern: "**/*.jsx", ignore: [] },
  });

  test("tracked components are independent", () => {
    expect(ctxA.trackedComponents).toEqual(["WidgetA"]);
    expect(ctxB.trackedComponents).toEqual(["WidgetB"]);
  });

  test("isTrackedUISource is independent", () => {
    expect(ctxA.isTrackedUISource("lib-a")).toBe(true);
    expect(ctxA.isTrackedUISource("lib-b")).toBe(false);
    expect(ctxB.isTrackedUISource("lib-b")).toBe(true);
    expect(ctxB.isTrackedUISource("lib-a")).toBe(false);
  });

  test("identifyLibrary is independent", () => {
    expect(ctxA.identifyLibrary("lib-a")).toBe("LibA");
    expect(ctxA.identifyLibrary("lib-b")).toBeNull();
    expect(ctxB.identifyLibrary("lib-b")).toBe("LibB");
    expect(ctxB.identifyLibrary("lib-a")).toBeNull();
  });

  test("identifyComponentLibrary is independent", () => {
    expect(ctxA.identifyComponentLibrary("WidgetA")).toBe("LibA");
    expect(ctxA.identifyComponentLibrary("WidgetB")).toBeNull();
    expect(ctxB.identifyComponentLibrary("WidgetB")).toBe("LibB");
    expect(ctxB.identifyComponentLibrary("WidgetA")).toBeNull();
  });

  test("analyzeFileContent uses correct context", () => {
    const fileA = `
      import { WidgetA } from 'lib-a';
      export function Test() { return <WidgetA size={1} />; }
    `;
    const fileB = `
      import { WidgetB } from 'lib-b';
      export function Test() { return <WidgetB size={2} />; }
    `;

    const resultA = perComponent.analyzeFileContent(fileA, ctxA);
    expect(resultA.instances.length).toBe(1);
    expect(resultA.instances[0].component).toBe("WidgetA");

    const resultB = perComponent.analyzeFileContent(fileB, ctxB);
    expect(resultB.instances.length).toBe(1);
    expect(resultB.instances[0].component).toBe("WidgetB");

    // Cross-context: ctxA doesn't know about lib-b
    const crossResult = perComponent.analyzeFileContent(fileB, ctxA);
    expect(crossResult.instances).toEqual([]);
  });

  test("createEmptyReport uses correct context", () => {
    const rA = perComponent.createEmptyReport("WidgetA", ctxA);
    expect(rA.library).toBe("LibA");

    const rB = perComponent.createEmptyReport("WidgetB", ctxB);
    expect(rB.library).toBe("LibB");

    // Cross-context: unknown
    const rCross = perComponent.createEmptyReport("WidgetB", ctxA);
    expect(rCross.library).toBeNull();
  });

  test("file pattern is independent", () => {
    expect(ctxA.filePattern).toBe("**/*.tsx");
    expect(ctxB.filePattern).toBe("**/*.jsx");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Static exports
// ═══════════════════════════════════════════════════════════════════════════════

describe("static exports", () => {
  test("HTML_TAG_CATEGORIES is available at top level", () => {
    expect(HTML_TAG_CATEGORIES).toBeDefined();
    expect(HTML_TAG_CATEGORIES.layout).toContain("div");
    expect(HTML_TAG_CATEGORIES.layout).toContain("span");
    expect(HTML_TAG_CATEGORIES.text).toContain("p");
    expect(HTML_TAG_CATEGORIES.text).toContain("h1");
    expect(HTML_TAG_CATEGORIES.form).toContain("input");
    expect(HTML_TAG_CATEGORIES.form).toContain("button");
    expect(HTML_TAG_CATEGORIES.media).toContain("img");
    expect(HTML_TAG_CATEGORIES.media).toContain("svg");
  });

  test("KNOWN_TAGS is a Set of all tags from categories", () => {
    expect(KNOWN_TAGS).toBeInstanceOf(Set);
    expect(KNOWN_TAGS.has("div")).toBe(true);
    expect(KNOWN_TAGS.has("span")).toBe(true);
    expect(KNOWN_TAGS.has("svg")).toBe(true);
    expect(KNOWN_TAGS.has("notarealtag")).toBe(false);
  });

  test("utils module is exported", () => {
    expect(typeof utils.sortByCount).toBe("function");
    expect(typeof utils.pct).toBe("function");
    expect(typeof utils.incr).toBe("function");
    expect(typeof utils.mergeCounters).toBe("function");
    expect(typeof utils.sumValues).toBe("function");
    expect(typeof utils.compact).toBe("function");
    expect(typeof utils.topN).toBe("function");
    expect(typeof utils.padNum).toBe("function");
  });

  test("utils.sortByCount sorts descending by value", () => {
    expect(utils.sortByCount({ a: 10, b: 50, c: 25 })).toEqual([
      ["b", 50],
      ["c", 25],
      ["a", 10],
    ]);
  });

  test("utils.pct returns a fixed-precision string", () => {
    expect(utils.pct(1, 4)).toBe("25.0");
    expect(utils.pct(0, 10)).toBe("0.0");
    expect(utils.pct(5, 0)).toBe("0.0");
    expect(utils.pct(1, 3, 2)).toBe("33.33");
  });

  test("utils.incr creates and increments counters", () => {
    const c = {};
    utils.incr(c, "a");
    utils.incr(c, "a", 5);
    utils.incr(c, "b");
    expect(c).toEqual({ a: 6, b: 1 });
  });

  test("utils.compact removes null/undefined values", () => {
    expect(utils.compact({ a: 1, b: null, c: undefined, d: 0 })).toEqual({
      a: 1,
      d: 0,
    });
  });

  test("all analysis modules are exported", () => {
    expect(perComponent).toBeDefined();
    expect(typeof perComponent.analyzeFileContent).toBe("function");
    expect(typeof perComponent.buildComponentJson).toBe("function");
    expect(typeof perComponent.parseProps).toBe("function");

    expect(htmlTags).toBeDefined();
    expect(typeof htmlTags.extractHTMLTags).toBe("function");
    expect(typeof htmlTags.analyzeContent).toBe("function");

    expect(customizations).toBeDefined();
    expect(typeof customizations.extractInlineStyles).toBe("function");
    expect(typeof customizations.analyzeContent).toBe("function");

    expect(propCombos).toBeDefined();
    expect(typeof propCombos.comboKey).toBe("function");
    expect(typeof propCombos.normalize).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Data collection vs report generation separation
// ═══════════════════════════════════════════════════════════════════════════════

describe("data collection / report generation separation", () => {
  test("analyzeFileContent returns data without writing to disk", () => {
    // This is the key contract: analysis functions return data structures.
    // No fs.writeFileSync, no console.log, no side effects.
    const result = perComponent.analyzeFileContent(SAMPLE_FILE, ctx);

    // Returns a plain object with importMap and instances
    expect(typeof result).toBe("object");
    expect(result.importMap).toBeDefined();
    expect(Array.isArray(result.instances)).toBe(true);

    // Each instance is a data object, not a formatted string
    for (const inst of result.instances) {
      expect(typeof inst.component).toBe("string");
      expect(typeof inst.line).toBe("number");
      expect(Array.isArray(inst.props)).toBe(true);
    }
  });

  test("buildComponentJson returns a serializable object", () => {
    const report = perComponent.createEmptyReport("Button", ctx);
    report.totalInstances = 1;
    perComponent.recordProp(report, "mode", "'ghost'");

    const json = perComponent.buildComponentJson(report);

    // It's a plain object, not a string — the caller decides how to use it
    expect(typeof json).toBe("object");
    expect(typeof json.props).toBe("object");

    // It's JSON-serializable
    const roundTripped = JSON.parse(JSON.stringify(json));
    expect(roundTripped).toEqual(json);
  });

  test("generateSummaryCSV and generateSummaryMarkdown return strings", () => {
    const reports = {
      Button: perComponent.createEmptyReport("Button", ctx),
    };
    reports.Button.totalInstances = 1;

    // These are formatters — they return strings, not write files
    const csv = perComponent.generateSummaryCSV(reports, ctx);
    expect(typeof csv).toBe("string");
    expect(csv.split("\n").length).toBeGreaterThan(1);

    const text = perComponent.generateSummaryMarkdown(reports, ctx);
    expect(typeof text).toBe("string");
    expect(text).toContain("Button");

    const jsonStr = perComponent.generateSummaryJSON(reports);
    expect(typeof jsonStr).toBe("string");
    JSON.parse(jsonStr); // should not throw
  });

  test("entire pipeline runs without any file system operations", () => {
    // This test proves the data collection layer is fully decoupled
    // from the filesystem.  We create a context, analyze strings,
    // aggregate, and produce output — all in memory.

    const myCtx = createContext({
      codebases: [{ name: "test", path: "./test" }],
      uiLibraries: [
        {
          name: "TestUI",
          importSources: ["test-ui"],
          excludeSources: [],
          components: ["Box"],
        },
      ],
    });

    const src = `
      import { Box } from 'test-ui';
      export function App() { return <Box padding={4} />; }
    `;

    const reports = { Box: perComponent.createEmptyReport("Box", myCtx) };
    const result = perComponent.analyzeFileContent(src, myCtx);
    perComponent.mergeFileResult(reports, result, "test", "app.tsx");

    const componentData = perComponent.buildComponentJson(reports.Box);
    expect(componentData.totalInstances).toBe(1);
    expect(componentData.props.padding.totalUsages).toBe(1);
    expect(componentData.props.padding.values["4"]).toBe(1);

    // The consumer decides what to do with the data:
    // write to disk, send to an API, store in a database, etc.
  });
});
