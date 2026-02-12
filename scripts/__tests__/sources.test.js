const {
  parseNamedImports,
  categorizeImportSource,
  extractImports,
  countJSXInstances,
  buildImportMap,
  analyzeContent,
  aggregateResults,
} = require("../sources/analyze-ui-component-sources");

describe("parseNamedImports", () => {
  test("parses single component import", () => {
    expect(parseNamedImports("Button")).toEqual(["Button"]);
  });

  test("parses multiple component imports", () => {
    expect(parseNamedImports("Button, Card, Flex")).toEqual([
      "Button",
      "Card",
      "Flex",
    ]);
  });

  test("parses imports with 'as' alias — returns the LOCAL name", () => {
    expect(parseNamedImports("Button as UIButton")).toEqual(["UIButton"]);
    expect(parseNamedImports("Button as UIButton, Card")).toEqual([
      "UIButton",
      "Card",
    ]);
  });

  test("filters out non-PascalCase imports (hooks, utilities)", () => {
    expect(parseNamedImports("useToast, Button, useState")).toEqual(["Button"]);
    expect(parseNamedImports("formatDate, Text")).toEqual(["Text"]);
  });

  test("handles whitespace variations", () => {
    expect(parseNamedImports("  Button  ,  Card  ")).toEqual([
      "Button",
      "Card",
    ]);
    expect(parseNamedImports("Button,Card,Flex")).toEqual([
      "Button",
      "Card",
      "Flex",
    ]);
  });

  test("returns empty array for empty input", () => {
    expect(parseNamedImports("")).toEqual([]);
    expect(parseNamedImports(null)).toEqual([]);
    expect(parseNamedImports(undefined)).toEqual([]);
  });

  test("handles type imports (should be filtered)", () => {
    expect(parseNamedImports("type ButtonProps")).toEqual([]);
    expect(parseNamedImports("Button, type CardProps")).toEqual(["Button"]);
  });

  test("handles complex component names", () => {
    expect(parseNamedImports("MenuButton, MenuItem, MenuDivider")).toEqual([
      "MenuButton",
      "MenuItem",
      "MenuDivider",
    ]);
    expect(parseNamedImports("TextInput, TextArea")).toEqual([
      "TextInput",
      "TextArea",
    ]);
  });
});

describe("categorizeImportSource", () => {
  describe("Sanity UI detection (includes @sanity/ui and @sanity/icons)", () => {
    test('identifies @sanity/ui as "sanityUI"', () => {
      expect(categorizeImportSource("@sanity/ui")).toBe("sanityUI");
    });

    test('identifies @sanity/ui subpaths as "sanityUI"', () => {
      expect(categorizeImportSource("@sanity/ui/components")).toBe("sanityUI");
    });

    test("excludes @sanity/ui/theme from sanityUI", () => {
      expect(categorizeImportSource("@sanity/ui/theme")).not.toBe("sanityUI");
    });

    test('identifies @sanity/icons as "sanityUI" (part of Sanity UI ecosystem)', () => {
      expect(categorizeImportSource("@sanity/icons")).toBe("sanityUI");
    });
  });

  describe("Other UI libraries detection", () => {
    test('identifies @radix-ui packages as "otherUI"', () => {
      expect(categorizeImportSource("@radix-ui/react-dialog")).toBe("otherUI");
      expect(categorizeImportSource("@radix-ui/react-popover")).toBe("otherUI");
    });

    test('identifies styled-components as "otherUI"', () => {
      expect(categorizeImportSource("styled-components")).toBe("otherUI");
    });

    test('identifies motion/react as "otherUI"', () => {
      expect(categorizeImportSource("motion/react")).toBe("otherUI");
    });

    test('identifies framer-motion as "otherUI"', () => {
      expect(categorizeImportSource("framer-motion")).toBe("otherUI");
    });

    test("@sanity/icons is NOT in otherUI anymore", () => {
      expect(categorizeImportSource("@sanity/icons")).not.toBe("otherUI");
    });
  });

  describe("Internal components detection", () => {
    test('identifies relative imports as "internal"', () => {
      expect(categorizeImportSource("./Button")).toBe("internal");
      expect(categorizeImportSource("../components/Card")).toBe("internal");
      expect(categorizeImportSource("../../ui/primitives/Text")).toBe(
        "internal",
      );
    });

    test('identifies ui-components path as "internal"', () => {
      expect(categorizeImportSource("ui-components")).toBe("internal");
      expect(categorizeImportSource("@/ui-components/Button")).toBe("internal");
    });

    test('identifies primitives path as "internal"', () => {
      expect(categorizeImportSource("@/primitives/button")).toBe("internal");
    });

    test('identifies components path as "internal"', () => {
      expect(categorizeImportSource("@/components/Layout")).toBe("internal");
    });
  });

  describe("Uncategorized imports", () => {
    test("returns null for react", () => {
      expect(categorizeImportSource("react")).toBeNull();
    });

    test("returns null for react-dom", () => {
      expect(categorizeImportSource("react-dom")).toBeNull();
    });

    test("returns null for arbitrary npm packages", () => {
      expect(categorizeImportSource("lodash")).toBeNull();
      expect(categorizeImportSource("date-fns")).toBeNull();
    });

    test("returns null for next.js imports", () => {
      expect(categorizeImportSource("next/router")).toBeNull();
      expect(categorizeImportSource("next/link")).toBeNull();
    });
  });
});

describe("extractImports", () => {
  test("extracts single named import", () => {
    const content = `import { Button } from '@sanity/ui'`;
    const result = extractImports(content);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      namedImports: " Button ",
      defaultImport: null,
      source: "@sanity/ui",
    });
  });

  test("extracts multiple named imports", () => {
    const content = `import { Button, Card, Flex } from '@sanity/ui'`;
    const result = extractImports(content);

    expect(result).toHaveLength(1);
    expect(result[0].namedImports).toContain("Button");
    expect(result[0].namedImports).toContain("Card");
    expect(result[0].namedImports).toContain("Flex");
  });

  test("extracts default import", () => {
    const content = `import Button from './Button'`;
    const result = extractImports(content);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      namedImports: null,
      defaultImport: "Button",
      source: "./Button",
    });
  });

  test("extracts multiple import statements", () => {
    const content = `
      import { Button, Card } from '@sanity/ui'
      import { CloseIcon } from '@sanity/icons'
      import Text from './primitives/Text'
    `;
    const result = extractImports(content);

    expect(result).toHaveLength(3);
    expect(result[0].source).toBe("@sanity/ui");
    expect(result[1].source).toBe("@sanity/icons");
    expect(result[2].source).toBe("./primitives/Text");
  });

  test("handles single quotes", () => {
    const content = `import { Button } from '@sanity/ui'`;
    const result = extractImports(content);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("@sanity/ui");
  });

  test("handles double quotes", () => {
    const content = `import { Button } from "@sanity/ui"`;
    const result = extractImports(content);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("@sanity/ui");
  });

  test("returns empty array for no imports", () => {
    const content = `const x = 1; console.log(x);`;
    const result = extractImports(content);

    expect(result).toEqual([]);
  });

  test("ignores dynamic imports", () => {
    const content = `const Button = await import('./Button')`;
    const result = extractImports(content);

    expect(result).toEqual([]);
  });

  test("ignores require statements", () => {
    const content = `const Button = require('./Button')`;
    const result = extractImports(content);

    expect(result).toEqual([]);
  });
});

describe("countJSXInstances", () => {
  test("counts a single JSX component", () => {
    const content = "<Button>Click me</Button>";
    const result = countJSXInstances(content);

    expect(result).toEqual({ Button: 1 });
  });

  test("counts multiple different JSX components", () => {
    const content = `
      <Flex>
        <Card>
          <Button>Click</Button>
          <Text>Hello</Text>
        </Card>
      </Flex>
    `;
    const result = countJSXInstances(content);

    expect(result.Flex).toBe(1);
    expect(result.Card).toBe(1);
    expect(result.Button).toBe(1);
    expect(result.Text).toBe(1);
    expect(Object.keys(result)).toHaveLength(4);
  });

  test("counts repeated instances of the same component", () => {
    const content = `
      <Button>One</Button>
      <Button>Two</Button>
      <Button>Three</Button>
    `;
    const result = countJSXInstances(content);

    expect(result).toEqual({ Button: 3 });
  });

  test("counts self-closing components", () => {
    const content = "<Spinner /> <Avatar /> <Avatar />";
    const result = countJSXInstances(content);

    expect(result.Spinner).toBe(1);
    expect(result.Avatar).toBe(2);
  });

  test("ignores lowercase elements (HTML)", () => {
    const content = `
      <div>
        <span>text</span>
        <Button>Click</Button>
        <p>paragraph</p>
      </div>
    `;
    const result = countJSXInstances(content);

    expect(result).toEqual({ Button: 1 });
    expect(result.div).toBeUndefined();
    expect(result.span).toBeUndefined();
    expect(result.p).toBeUndefined();
  });

  test("handles components with props", () => {
    const content = '<Button onClick={handler} size="large">Click</Button>';
    const result = countJSXInstances(content);

    expect(result).toEqual({ Button: 1 });
  });

  test("handles components with complex names", () => {
    const content = `
      <MenuButton>
        <MenuItem>Item 1</MenuItem>
        <MenuDivider />
        <MenuItem>Item 2</MenuItem>
      </MenuButton>
    `;
    const result = countJSXInstances(content);

    expect(result.MenuButton).toBe(1);
    expect(result.MenuItem).toBe(2);
    expect(result.MenuDivider).toBe(1);
  });

  test("handles components with numbers in name", () => {
    const content = "<H1>Title</H1>";
    const result = countJSXInstances(content);

    expect(result).toEqual({ H1: 1 });
  });

  test("returns empty object for no JSX", () => {
    const content = `
      const x = 1;
      function foo() { return 42; }
    `;
    const result = countJSXInstances(content);

    expect(result).toEqual({});
  });
});

describe("buildImportMap", () => {
  test("maps named imports to their category", () => {
    const content = `
      import { Button, Card } from '@sanity/ui'
      import { CloseIcon } from '@sanity/icons'
    `;
    const { componentToCategory } = buildImportMap(content);

    expect(componentToCategory.Button).toBe("sanityUI");
    expect(componentToCategory.Card).toBe("sanityUI");
    expect(componentToCategory.CloseIcon).toBe("sanityUI");
  });

  test("maps aliased imports under their local name", () => {
    const content = `
      import { Button as UIButton, Card as UICard } from '@sanity/ui'
    `;
    const { componentToCategory } = buildImportMap(content);

    expect(componentToCategory.UIButton).toBe("sanityUI");
    expect(componentToCategory.UICard).toBe("sanityUI");
    expect(componentToCategory.Button).toBeUndefined();
    expect(componentToCategory.Card).toBeUndefined();
  });

  test("maps default imports to their category", () => {
    const content = `
      import CustomWidget from './components/CustomWidget'
    `;
    const { componentToCategory } = buildImportMap(content);

    expect(componentToCategory.CustomWidget).toBe("internal");
  });

  test("tracks which categories are present", () => {
    const content = `
      import { Button } from '@sanity/ui'
      import { AnimatePresence } from 'motion/react'
      import { CustomWidget } from './CustomWidget'
    `;
    const { categoriesPresent } = buildImportMap(content);

    expect(categoriesPresent.has("sanityUI")).toBe(true);
    expect(categoriesPresent.has("otherUI")).toBe(true);
    expect(categoriesPresent.has("internal")).toBe(true);
  });

  test("excludes non-component imports (hooks, utilities)", () => {
    const content = `
      import { useToast, rem, Button } from '@sanity/ui'
    `;
    const { componentToCategory } = buildImportMap(content);

    expect(componentToCategory.Button).toBe("sanityUI");
    expect(componentToCategory.useToast).toBeUndefined();
    expect(componentToCategory.rem).toBeUndefined();
  });

  test("skips imports from unrecognized sources", () => {
    const content = `
      import React from 'react'
      import { useState } from 'react'
      import lodash from 'lodash'
    `;
    const { componentToCategory } = buildImportMap(content);

    expect(Object.keys(componentToCategory)).toHaveLength(0);
  });

  test("returns empty map for empty content", () => {
    const { componentToCategory, categoriesPresent } = buildImportMap("");

    expect(Object.keys(componentToCategory)).toHaveLength(0);
    expect(categoriesPresent.size).toBe(0);
  });
});

describe("analyzeContent", () => {
  test("counts JSX instances for Sanity UI components", () => {
    const content = `
      import { Button, Card, Flex } from '@sanity/ui'

      export function MyComponent() {
        return (
          <Flex>
            <Card>
              <Button>Click me</Button>
            </Card>
          </Flex>
        )
      }
    `;

    const result = analyzeContent(content);

    // Each component appears once in JSX → 1 instance each
    expect(result.imports.sanityUI.count).toBe(3);
    expect(result.imports.sanityUI.components).toContain("Button");
    expect(result.imports.sanityUI.components).toContain("Card");
    expect(result.imports.sanityUI.components).toContain("Flex");
    expect(result.imports.nativeHTML.count).toBe(0);
    expect(result.imports.total.count).toBe(3);
    expect(result.hasSanityUI).toBe(true);
    expect(result.hasInternal).toBe(false);
  });

  test("counts repeated JSX instances correctly", () => {
    const content = `
      import { Button, Card } from '@sanity/ui'

      export function MyComponent() {
        return (
          <Card>
            <Button>One</Button>
            <Button>Two</Button>
            <Button>Three</Button>
          </Card>
        )
      }
    `;

    const result = analyzeContent(content);

    // Button rendered 3 times, Card rendered 1 time
    expect(result.imports.sanityUI.count).toBe(4);
    const buttons = result.imports.sanityUI.components.filter(
      (c) => c === "Button",
    );
    expect(buttons.length).toBe(3);
  });

  test("analyzes file with mixed imports — counts instances not imports", () => {
    const content = `
      import { Button, Card } from '@sanity/ui'
      import { CloseIcon } from '@sanity/icons'
      import { AnimatePresence } from 'motion/react'
      import { Text } from '../primitives/Text'

      export function MyComponent() {
        return (
          <AnimatePresence>
            <Card>
              <Text>Hello</Text>
              <Button icon={CloseIcon}>Close</Button>
            </Card>
          </AnimatePresence>
        )
      }
    `;

    const result = analyzeContent(content);

    // Sanity UI: Button(1) + Card(1) = 2 instances (CloseIcon is imported
    // but not used as a JSX element — it's passed as a prop)
    expect(result.imports.sanityUI.count).toBe(2);
    expect(result.imports.sanityUI.components).toContain("Button");
    expect(result.imports.sanityUI.components).toContain("Card");

    // Other UI: AnimatePresence(1)
    expect(result.imports.otherUI.count).toBe(1);
    expect(result.imports.otherUI.components).toContain("AnimatePresence");

    // Internal: Text(1)
    expect(result.imports.internal.count).toBe(1);
    expect(result.imports.internal.components).toContain("Text");

    expect(result.imports.nativeHTML.count).toBe(0);
    expect(result.imports.total.count).toBe(4);

    expect(result.hasSanityUI).toBe(true);
    expect(result.hasInternal).toBe(true);
    expect(result.usesSanityUIWithInternal).toBe(true);
  });

  test("excludes hooks and utilities — only counts JSX instances", () => {
    const content = `
      import { Button, useToast, formatDate } from '@sanity/ui'

      export function MyComponent() {
        const toast = useToast()
        return <Button>Click me</Button>
      }
    `;

    const result = analyzeContent(content);

    // Only Button appears in JSX; useToast and formatDate are not JSX elements
    expect(result.imports.sanityUI.count).toBe(1);
    expect(result.imports.sanityUI.components).toEqual(["Button"]);
  });

  test("handles aliased imports — counts instances under alias name", () => {
    const content = `
      import { Button as UIButton, Card as UICard } from '@sanity/ui'

      export function MyComponent() {
        return (
          <UICard>
            <UIButton>Click</UIButton>
          </UICard>
        )
      }
    `;

    const result = analyzeContent(content);

    // JSX uses UIButton(1) and UICard(1) — both mapped via alias
    expect(result.imports.sanityUI.count).toBe(2);
    expect(result.imports.sanityUI.components).toContain("UIButton");
    expect(result.imports.sanityUI.components).toContain("UICard");
    // The original names (Button, Card) should NOT appear
    expect(result.imports.sanityUI.components).not.toContain("Button");
    expect(result.imports.sanityUI.components).not.toContain("Card");
  });

  test("handles default imports correctly", () => {
    const content = `
      import React from 'react'
      import { Card } from '@sanity/ui'
      import CustomWidget from './CustomWidget'

      export function MyComponent() {
        return (
          <Card>
            <CustomWidget />
          </Card>
        )
      }
    `;

    const result = analyzeContent(content);

    // Card(1) + CustomWidget(1) = 2 instances
    expect(result.imports.sanityUI.count).toBe(1);
    expect(result.imports.internal.count).toBe(1);
    expect(result.imports.total.count).toBe(2);
  });

  test("handles empty file", () => {
    const content = "";
    const result = analyzeContent(content);

    expect(result.imports.sanityUI.count).toBe(0);
    expect(result.imports.otherUI.count).toBe(0);
    expect(result.imports.internal.count).toBe(0);
    expect(result.imports.total.count).toBe(0);
    expect(result.jsxCount).toBe(0);
    expect(result.hasSanityUI).toBe(false);
    expect(result.hasInternal).toBe(false);
  });

  test("handles file with no components", () => {
    const content = `
      import { useCallback, useState } from 'react'

      export function useMyHook() {
        const [state, setState] = useState(null)
        return useCallback(() => setState(null), [])
      }
    `;

    const result = analyzeContent(content);

    expect(result.imports.sanityUI.count).toBe(0);
    expect(result.imports.otherUI.count).toBe(0);
    expect(result.imports.internal.count).toBe(0);
    expect(result.imports.total.count).toBe(0);
    expect(result.jsxCount).toBe(0);
  });

  test("excludes @sanity/ui/theme imports from Sanity UI count", () => {
    const content = `
      import { Button } from '@sanity/ui'
      import { Theme } from '@sanity/ui/theme'

      export function MyComponent() {
        return <Button>Click</Button>
      }
    `;

    const result = analyzeContent(content);

    // Theme is imported but not rendered as JSX here (and even if it were,
    // @sanity/ui/theme is excluded from the sanityUI category)
    expect(result.imports.sanityUI.count).toBe(1);
    expect(result.imports.sanityUI.components).toContain("Button");
  });

  test("tracks internal components using Sanity UI", () => {
    const content = `
      import { Button, Card, Flex } from '@sanity/ui'
      import { CustomWidget } from './components/CustomWidget'
      import { FormField } from '../ui-components/FormField'

      export function MyComponent() {
        return (
          <Flex>
            <Card>
              <CustomWidget>
                <FormField>
                  <Button>Click</Button>
                </FormField>
              </CustomWidget>
            </Card>
          </Flex>
        )
      }
    `;

    const result = analyzeContent(content);

    expect(result.hasSanityUI).toBe(true);
    expect(result.hasInternal).toBe(true);
    expect(result.usesSanityUIWithInternal).toBe(true);

    // Instances: Flex(1) + Card(1) + Button(1) = 3 Sanity UI
    expect(result.imports.sanityUI.count).toBe(3);
    // CustomWidget(1) + FormField(1) = 2 internal
    expect(result.imports.internal.count).toBe(2);
    expect(result.imports.total.count).toBe(5);
  });

  test("tracks files with only internal imports (no Sanity UI)", () => {
    const content = `
      import { CustomWidget } from './components/CustomWidget'
      import { FormField } from '../ui-components/FormField'

      export function MyComponent() {
        return (
          <CustomWidget>
            <FormField />
          </CustomWidget>
        )
      }
    `;

    const result = analyzeContent(content);

    expect(result.hasSanityUI).toBe(false);
    expect(result.hasInternal).toBe(true);
    expect(result.usesSanityUIWithInternal).toBe(false);

    expect(result.imports.sanityUI.count).toBe(0);
    expect(result.imports.internal.count).toBe(2);
    expect(result.imports.total.count).toBe(2);
  });

  test("imported but unused components are NOT counted", () => {
    const content = `
      import { Button, Card, Flex, Text } from '@sanity/ui'

      export function MyComponent() {
        return <Button>Click</Button>
      }
    `;

    const result = analyzeContent(content);

    // Only Button appears in JSX — Card, Flex, Text are imported but unused
    expect(result.imports.sanityUI.count).toBe(1);
    expect(result.imports.sanityUI.components).toEqual(["Button"]);
  });
});

describe("aggregateResults", () => {
  test("aggregates instance counts from multiple files", () => {
    const fileResults = [
      {
        imports: {
          sanityUI: { components: ["Button", "Card"], count: 2 },
          otherUI: { components: ["AnimatePresence"], count: 1 },
          internal: { components: ["CustomInput"], count: 1 },
          nativeHTML: { components: [], count: 0 },
          total: {
            components: ["Button", "Card", "AnimatePresence", "CustomInput"],
            count: 4,
          },
        },
        jsxCounts: { Button: 1, Card: 1, AnimatePresence: 1, CustomInput: 1 },
        jsxCount: 4,
        hasSanityUI: true,
        hasInternal: true,
        usesSanityUIWithInternal: true,
      },
      {
        imports: {
          sanityUI: { components: ["Flex", "Text"], count: 2 },
          otherUI: { components: [], count: 0 },
          internal: { components: ["CustomButton"], count: 1 },
          nativeHTML: { components: [], count: 0 },
          total: {
            components: ["Flex", "Text", "CustomButton"],
            count: 3,
          },
        },
        jsxCounts: { Flex: 1, Text: 1, CustomButton: 1 },
        jsxCount: 3,
        hasSanityUI: true,
        hasInternal: true,
        usesSanityUIWithInternal: true,
      },
    ];

    const result = aggregateResults(fileResults);

    expect(result.fileCount).toBe(2);

    // Sanity UI instances
    expect(result.sanityUI.totalInstances).toBe(4);
    expect(result.sanityUI.components["Button"]).toBe(1);
    expect(result.sanityUI.components["Card"]).toBe(1);
    expect(result.sanityUI.components["Flex"]).toBe(1);
    expect(result.sanityUI.components["Text"]).toBe(1);

    // Other UI instances
    expect(result.otherUI.totalInstances).toBe(1);
    expect(result.otherUI.components["AnimatePresence"]).toBe(1);

    // Internal instances
    expect(result.internal.totalInstances).toBe(2);
    expect(result.internal.components["CustomInput"]).toBe(1);
    expect(result.internal.components["CustomButton"]).toBe(1);

    // Native HTML instances
    expect(result.nativeHTML.totalInstances).toBe(0);

    // Total instances
    expect(result.total.totalInstances).toBe(7);

    // Raw JSX counts
    expect(result.jsxCounts["Button"]).toBe(1);
    expect(result.jsxCounts["Card"]).toBe(1);
    expect(result.jsxCounts["Flex"]).toBe(1);
    expect(result.jsxCounts["Text"]).toBe(1);
    expect(result.jsxCounts["AnimatePresence"]).toBe(1);
    expect(result.jsxCounts["CustomInput"]).toBe(1);
    expect(result.jsxCounts["CustomButton"]).toBe(1);

    // Internal component tracking
    expect(result.filesWithInternal).toBe(2);
    expect(result.filesWithInternalUsingSanityUI).toBe(2);
  });

  test("handles empty file results array", () => {
    const result = aggregateResults([]);

    expect(result.fileCount).toBe(0);
    expect(result.sanityUI.totalInstances).toBe(0);
    expect(result.otherUI.totalInstances).toBe(0);
    expect(result.internal.totalInstances).toBe(0);
    expect(result.nativeHTML.totalInstances).toBe(0);
    expect(result.total.totalInstances).toBe(0);
    expect(Object.keys(result.jsxCounts)).toHaveLength(0);
    expect(result.filesWithInternal).toBe(0);
    expect(result.filesWithInternalUsingSanityUI).toBe(0);
  });

  test("handles single file result", () => {
    const fileResults = [
      {
        imports: {
          sanityUI: { components: ["Button"], count: 1 },
          otherUI: { components: [], count: 0 },
          internal: { components: [], count: 0 },
          nativeHTML: { components: [], count: 0 },
          total: { components: ["Button"], count: 1 },
        },
        jsxCounts: { Button: 1 },
        jsxCount: 1,
        hasSanityUI: true,
        hasInternal: false,
        usesSanityUIWithInternal: false,
      },
    ];

    const result = aggregateResults(fileResults);

    expect(result.fileCount).toBe(1);
    expect(result.sanityUI.totalInstances).toBe(1);
    expect(result.sanityUI.components["Button"]).toBe(1);
  });

  test("sums instances of the same component across multiple files", () => {
    const fileResults = [
      {
        imports: {
          sanityUI: {
            components: ["Button", "Button", "Button"],
            count: 3,
          },
          otherUI: { components: [], count: 0 },
          internal: { components: [], count: 0 },
          nativeHTML: { components: [], count: 0 },
          total: { components: ["Button", "Button", "Button"], count: 3 },
        },
        jsxCounts: { Button: 3 },
        jsxCount: 3,
        hasSanityUI: true,
        hasInternal: false,
        usesSanityUIWithInternal: false,
      },
      {
        imports: {
          sanityUI: { components: ["Button", "Button", "Card"], count: 3 },
          otherUI: { components: [], count: 0 },
          internal: { components: [], count: 0 },
          nativeHTML: { components: [], count: 0 },
          total: { components: ["Button", "Button", "Card"], count: 3 },
        },
        jsxCounts: { Button: 2, Card: 1 },
        jsxCount: 3,
        hasSanityUI: true,
        hasInternal: false,
        usesSanityUIWithInternal: false,
      },
    ];

    const result = aggregateResults(fileResults);

    // Button: 3 + 2 = 5 instances; Card: 1 instance
    expect(result.sanityUI.components["Button"]).toBe(5);
    expect(result.sanityUI.components["Card"]).toBe(1);
    expect(result.sanityUI.totalInstances).toBe(6);

    // JSX counts are also summed
    expect(result.jsxCounts["Button"]).toBe(5);
    expect(result.jsxCounts["Card"]).toBe(1);
  });

  test("tracks internal components with and without Sanity UI", () => {
    const fileResults = [
      {
        imports: {
          sanityUI: { components: ["Button"], count: 1 },
          otherUI: { components: [], count: 0 },
          internal: { components: ["CustomInput"], count: 1 },
          nativeHTML: { components: [], count: 0 },
          total: { components: ["Button", "CustomInput"], count: 2 },
        },
        jsxCounts: { Button: 1, CustomInput: 1 },
        jsxCount: 2,
        hasSanityUI: true,
        hasInternal: true,
        usesSanityUIWithInternal: true,
      },
      {
        imports: {
          sanityUI: { components: [], count: 0 },
          otherUI: { components: [], count: 0 },
          internal: { components: ["LocalWidget"], count: 1 },
          nativeHTML: { components: [], count: 0 },
          total: { components: ["LocalWidget"], count: 1 },
        },
        jsxCounts: { LocalWidget: 1 },
        jsxCount: 1,
        hasSanityUI: false,
        hasInternal: true,
        usesSanityUIWithInternal: false,
      },
      {
        imports: {
          sanityUI: { components: ["Card"], count: 1 },
          otherUI: { components: [], count: 0 },
          internal: { components: [], count: 0 },
          nativeHTML: { components: [], count: 0 },
          total: { components: ["Card"], count: 1 },
        },
        jsxCounts: { Card: 1 },
        jsxCount: 1,
        hasSanityUI: true,
        hasInternal: false,
        usesSanityUIWithInternal: false,
      },
    ];

    const result = aggregateResults(fileResults);

    // 2 files have internal imports
    expect(result.filesWithInternal).toBe(2);
    // Only 1 file has both internal AND Sanity UI
    expect(result.filesWithInternalUsingSanityUI).toBe(1);
  });
});

describe("Integration tests", () => {
  test("full analysis pipeline for realistic component file", () => {
    const content = `
      import { Box, Button, Card, Flex, Stack, Text } from '@sanity/ui'
      import { AddIcon, CloseIcon, EditIcon } from '@sanity/icons'
      import { AnimatePresence, motion } from 'motion/react'
      import { Dialog } from '../ui-components/Dialog'
      import { Tooltip } from './primitives/Tooltip'

      const MotionCard = motion.create(Card)

      export function MyComponent({ onClose }) {
        return (
          <AnimatePresence>
            <Dialog>
              <MotionCard>
                <Flex align="center" justify="space-between">
                  <Stack gap={2}>
                    <Text size={2}>Title</Text>
                    <Text size={1} muted>Description</Text>
                  </Stack>
                  <Box>
                    <Tooltip content="Close">
                      <Button icon={CloseIcon} mode="bleed" onClick={onClose} />
                    </Tooltip>
                  </Box>
                </Flex>
              </MotionCard>
            </Dialog>
          </AnimatePresence>
        )
      }
    `;

    const result = analyzeContent(content);

    // Verify Sanity UI JSX instances.
    // Card is imported but never rendered as <Card> (used via motion.create).
    // Icons are imported but passed as props (icon={CloseIcon}), not JSX.
    // Actual JSX: Flex(1) + Stack(1) + Text(2) + Box(1) + Button(1) = 6
    expect(result.imports.sanityUI.count).toBe(6);
    expect(result.imports.sanityUI.components).toContain("Box");
    expect(result.imports.sanityUI.components).toContain("Button");
    expect(result.imports.sanityUI.components).toContain("Flex");
    expect(result.imports.sanityUI.components).toContain("Stack");
    expect(result.imports.sanityUI.components).toContain("Text");
    // Card, AddIcon, CloseIcon, EditIcon are NOT in JSX
    expect(result.imports.sanityUI.components).not.toContain("Card");
    expect(result.imports.sanityUI.components).not.toContain("AddIcon");
    expect(result.imports.sanityUI.components).not.toContain("CloseIcon");

    // Verify Other UI: AnimatePresence(1)
    // `motion` is lowercase so it's not counted as a component
    expect(result.imports.otherUI.count).toBe(1);
    expect(result.imports.otherUI.components).toContain("AnimatePresence");
    expect(result.imports.otherUI.components).not.toContain("motion");

    // Verify Internal JSX instances: Dialog(1) + Tooltip(1) = 2
    // MotionCard is a local const (not imported), so it's uncategorized.
    expect(result.imports.internal.count).toBe(2);
    expect(result.imports.internal.components).toContain("Dialog");
    expect(result.imports.internal.components).toContain("Tooltip");

    // Verify totals: 6 sanityUI + 1 otherUI + 2 internal = 9
    expect(result.imports.total.count).toBe(9);

    // Verify raw JSX instance counts (all PascalCase, regardless of category)
    expect(result.jsxCounts["AnimatePresence"]).toBe(1);
    expect(result.jsxCounts["Dialog"]).toBe(1);
    expect(result.jsxCounts["MotionCard"]).toBe(1);
    expect(result.jsxCounts["Flex"]).toBe(1);
    expect(result.jsxCounts["Stack"]).toBe(1);
    expect(result.jsxCounts["Text"]).toBe(2);
    expect(result.jsxCounts["Box"]).toBe(1);
    expect(result.jsxCounts["Tooltip"]).toBe(1);
    expect(result.jsxCounts["Button"]).toBe(1);

    // Verify internal tracking
    expect(result.hasSanityUI).toBe(true);
    expect(result.hasInternal).toBe(true);
    expect(result.usesSanityUIWithInternal).toBe(true);
  });

  test("handles real-world edge cases", () => {
    const content = `
      // eslint-disable-next-line no-restricted-imports
      import {Button as UIButton, Grid} from '@sanity/ui'
      import {useCallback, useEffect, useState} from 'react'
      import type {ComponentProps} from 'react'

      import {COMMENT_REACTION_EMOJIS} from '@/features/editor/comments/constants'
      import {type CommentReactionOption} from '@/features/editor/comments/types'

      const GRID_COLUMNS = 6

      export function MyComponent() {
        const [open, setOpen] = useState(false)

        return (
          <Grid columns={GRID_COLUMNS}>
            <UIButton>Click</UIButton>
          </Grid>
        )
      }
    `;

    const result = analyzeContent(content);

    // Grid(1) + UIButton(1) = 2 Sanity UI JSX instances
    // Button was aliased as UIButton, so UIButton is the local name
    expect(result.imports.sanityUI.count).toBe(2);
    expect(result.imports.sanityUI.components).toContain("UIButton");
    expect(result.imports.sanityUI.components).toContain("Grid");

    // Should not count hooks, types, or constants
    expect(result.imports.sanityUI.components).not.toContain("useCallback");
    expect(result.imports.sanityUI.components).not.toContain("ComponentProps");

    // JSX instance counts
    expect(result.jsxCounts["Grid"]).toBe(1);
    expect(result.jsxCounts["UIButton"]).toBe(1);
  });

  test("handles multiline imports — counts JSX instances", () => {
    const content = `
      import {
        Box,
        Button,
        Card,
        Flex,
        Stack,
        Text,
      } from '@sanity/ui'

      export function MyComponent() {
        return <Box><Button>Click</Button></Box>
      }
    `;

    const result = analyzeContent(content);

    // Only Box and Button appear in JSX — the other 4 are imported but unused
    expect(result.imports.sanityUI.count).toBe(2);
    expect(result.imports.sanityUI.components).toContain("Box");
    expect(result.imports.sanityUI.components).toContain("Button");
    expect(result.imports.sanityUI.components).not.toContain("Card");
    expect(result.imports.sanityUI.components).not.toContain("Flex");
    expect(result.imports.sanityUI.components).not.toContain("Stack");
    expect(result.imports.sanityUI.components).not.toContain("Text");
  });

  test("handles mixed default and named imports", () => {
    const content = `
      import React, { useState } from 'react'
      import { Button } from '@sanity/ui'
      import CustomDialog from './components/CustomDialog'

      export function MyComponent() {
        return <CustomDialog><Button>Click</Button></CustomDialog>
      }
    `;

    const result = analyzeContent(content);

    expect(result.imports.sanityUI.count).toBe(1);
    expect(result.imports.sanityUI.components).toContain("Button");
    expect(result.imports.internal.count).toBe(1);
    expect(result.imports.internal.components).toContain("CustomDialog");
  });

  test("handles namespace imports (not counted as components)", () => {
    const content = `
      import * as Icons from '@sanity/icons'
      import { Button } from '@sanity/ui'

      export function MyComponent() {
        return <Button icon={Icons.CloseIcon}>Close</Button>
      }
    `;

    const result = analyzeContent(content);

    // Button(1) = 1 instance; namespace imports are not individual components
    expect(result.imports.sanityUI.count).toBe(1);
    expect(result.imports.sanityUI.components).toEqual(["Button"]);
  });

  test("handles re-exports correctly", () => {
    const content = `
      export { Button } from '@sanity/ui'
      export { Card } from '@sanity/ui'
    `;

    const result = analyzeContent(content);

    // Re-exports have no JSX usage — count is 0
    expect(result.imports.sanityUI.count).toBe(0);
  });

  test("handles Fragment components", () => {
    const content = `
      import React, { Fragment } from 'react'
      import { Button } from '@sanity/ui'

      export function MyComponent() {
        return (
          <Fragment>
            <Button>One</Button>
            <Button>Two</Button>
          </Fragment>
        )
      }
    `;

    const result = analyzeContent(content);

    // Button appears twice in JSX = 2 instances
    // Fragment is from React (uncategorized), so not counted
    // Button(2) = 2 instances; Fragment is from React (uncategorized)
    expect(result.imports.sanityUI.count).toBe(2);
    const buttonCount = result.imports.sanityUI.components.filter(
      (c) => c === "Button",
    ).length;
    expect(buttonCount).toBe(2);
  });

  test("handles JSX spread attributes", () => {
    const content = `
      import { Button } from '@sanity/ui'

      export function MyComponent(props) {
        return <Button {...props}>Click</Button>
      }
    `;

    const result = analyzeContent(content);

    // Button(1) = 1 instance
    expect(result.imports.sanityUI.count).toBe(1);
  });

  test("handles conditional rendering with components", () => {
    const content = `
      import { Button, Card } from '@sanity/ui'

      export function MyComponent({ isOpen }) {
        return isOpen ? <Card><Button>Click</Button></Card> : null
      }
    `;

    const result = analyzeContent(content);

    // Card(1) + Button(1) = 2 instances
    expect(result.imports.sanityUI.count).toBe(2);
    expect(result.imports.nativeHTML.count).toBe(0);
    expect(result.imports.total.count).toBe(2);
  });

  test("handles components in arrays/maps", () => {
    const content = `
      import { Button, Stack } from '@sanity/ui'

      export function MyComponent({ items }) {
        return (
          <Stack>
            {items.map(item => (
              <Button key={item.id}>{item.label}</Button>
            ))}
          </Stack>
        )
      }
    `;

    const result = analyzeContent(content);

    expect(result.imports.sanityUI.count).toBe(2);
    expect(result.jsxCounts["Button"]).toBeGreaterThanOrEqual(1);
    expect(result.jsxCounts["Stack"]).toBeGreaterThanOrEqual(1);
  });

  test("icons used as JSX are counted, icons used as props are not", () => {
    const content = `
      import { Button, Card } from '@sanity/ui'
      import { CloseIcon, EditIcon, TrashIcon } from '@sanity/icons'

      export function ActionBar() {
        return (
          <Card>
            <Button icon={CloseIcon}>Close</Button>
            <Button icon={EditIcon}>Edit</Button>
            <Button icon={TrashIcon}>Delete</Button>
          </Card>
        )
      }
    `;

    const result = analyzeContent(content);

    // Card(1) + Button(3) = 4 Sanity UI JSX instances.
    // CloseIcon, EditIcon, TrashIcon are passed as PROPS, not rendered
    // as JSX elements, so they should NOT be counted as instances.
    // Card(1) + Button(3) = 4 instances; icons are props, not JSX
    expect(result.imports.sanityUI.count).toBe(4);
    expect(result.imports.sanityUI.components).toContain("Button");
    expect(result.imports.sanityUI.components).toContain("Card");
    expect(result.imports.sanityUI.components).not.toContain("CloseIcon");
    expect(result.imports.sanityUI.components).not.toContain("EditIcon");
    expect(result.imports.sanityUI.components).not.toContain("TrashIcon");

    // Other UI should be empty
    expect(result.imports.otherUI.count).toBe(0);
  });

  test("icons rendered as JSX ARE counted as Sanity UI instances", () => {
    const content = `
      import { Card } from '@sanity/ui'
      import { CloseIcon, EditIcon } from '@sanity/icons'

      export function IconList() {
        return (
          <Card>
            <CloseIcon />
            <EditIcon />
            <EditIcon />
          </Card>
        )
      }
    `;

    const result = analyzeContent(content);

    // Card(1) + CloseIcon(1) + EditIcon(2) = 4 Sanity UI instances
    expect(result.imports.sanityUI.count).toBe(4);
    expect(result.imports.sanityUI.components).toContain("CloseIcon");
    expect(result.imports.sanityUI.components).toContain("EditIcon");
  });
});

describe("Native HTML tag counting", () => {
  test("counts native HTML tags and includes them in total", () => {
    const content = `
      import { Card, Text } from '@sanity/ui'

      export function MyComponent() {
        return (
          <Card>
            <div className="wrapper">
              <span className="label">Label</span>
              <Text>Hello</Text>
            </div>
          </Card>
        )
      }
    `;

    const result = analyzeContent(content);

    // Sanity UI instances: Card(1) + Text(1) = 2
    expect(result.imports.sanityUI.count).toBe(2);
    expect(result.imports.nativeHTML.count).toBeGreaterThanOrEqual(2);
    expect(result.imports.nativeHTML.components).toContain("div");
    expect(result.imports.nativeHTML.components).toContain("span");
    // Total includes both component instances and HTML tags
    expect(result.imports.total.count).toBeGreaterThanOrEqual(4);
  });

  test("HTML tags dilute Sanity UI percentage", () => {
    const content = `
      import { Card } from '@sanity/ui'

      export function MyComponent() {
        return (
          <Card>
            <div><div><div><span>lots of HTML</span></div></div></div>
          </Card>
        )
      }
    `;

    const result = analyzeContent(content);

    // 1 Sanity UI instance
    expect(result.imports.sanityUI.count).toBe(1);
    // Multiple HTML tag instances
    expect(result.imports.nativeHTML.count).toBeGreaterThanOrEqual(4);
    // Total is much larger than just Sanity UI
    expect(result.imports.total.count).toBeGreaterThan(
      result.imports.sanityUI.count,
    );
    // Sanity UI is a minority of total
    const sanityPct =
      result.imports.sanityUI.count / result.imports.total.count;
    expect(sanityPct).toBeLessThan(0.5);
  });

  test("file with only HTML tags has 0% Sanity UI", () => {
    const content = `
      export function MyComponent() {
        return (
          <div>
            <span>Hello</span>
            <p>World</p>
          </div>
        )
      }
    `;

    const result = analyzeContent(content);

    expect(result.imports.sanityUI.count).toBe(0);
    expect(result.imports.nativeHTML.count).toBeGreaterThanOrEqual(3);
    expect(result.imports.total.count).toBe(result.imports.nativeHTML.count);
    expect(result.hasSanityUI).toBe(false);
  });

  test("file with no HTML and no imports has empty results", () => {
    const content = `
      export function MyComponent() {
        return null
      }
    `;

    const result = analyzeContent(content);

    expect(result.imports.sanityUI.count).toBe(0);
    expect(result.imports.nativeHTML.count).toBe(0);
    expect(result.imports.total.count).toBe(0);
  });

  test("SVG tags are counted as native HTML", () => {
    const content = `
      import { Box } from '@sanity/ui'

      export function Icon() {
        return (
          <Box>
            <svg viewBox="0 0 24 24">
              <path d="M0 0" />
              <circle cx="12" cy="12" r="5" />
            </svg>
          </Box>
        )
      }
    `;

    const result = analyzeContent(content);

    // Box(1) = 1 Sanity UI instance
    expect(result.imports.sanityUI.count).toBe(1);
    expect(result.imports.nativeHTML.count).toBeGreaterThanOrEqual(3);
    expect(result.imports.nativeHTML.components).toContain("svg");
    expect(result.imports.nativeHTML.components).toContain("path");
    expect(result.imports.nativeHTML.components).toContain("circle");
  });

  test("nativeHTML is aggregated across files", () => {
    const fileResults = [
      {
        imports: {
          sanityUI: { components: ["Card"], count: 1 },
          otherUI: { components: [], count: 0 },
          internal: { components: [], count: 0 },
          nativeHTML: { components: ["div", "div", "span"], count: 3 },
          total: { components: ["Card", "div", "div", "span"], count: 4 },
        },
        jsxCounts: { Card: 1 },
        jsxCount: 1,
        hasSanityUI: true,
        hasInternal: false,
        usesSanityUIWithInternal: false,
      },
      {
        imports: {
          sanityUI: { components: ["Box"], count: 1 },
          otherUI: { components: [], count: 0 },
          internal: { components: [], count: 0 },
          nativeHTML: { components: ["div", "p"], count: 2 },
          total: { components: ["Box", "div", "p"], count: 3 },
        },
        jsxCounts: { Box: 1 },
        jsxCount: 1,
        hasSanityUI: true,
        hasInternal: false,
        usesSanityUIWithInternal: false,
      },
    ];

    const result = aggregateResults(fileResults);

    expect(result.nativeHTML.totalInstances).toBe(5);
    expect(result.nativeHTML.components.div).toBe(3);
    expect(result.nativeHTML.components.span).toBe(1);
    expect(result.nativeHTML.components.p).toBe(1);
    expect(result.sanityUI.totalInstances).toBe(2);
    expect(result.total.totalInstances).toBe(7);
  });
});

describe("Edge cases for categorization", () => {
  test("handles scoped packages correctly", () => {
    expect(categorizeImportSource("@sanity/ui")).toBe("sanityUI");
    expect(categorizeImportSource("@sanity/ui/something")).toBe("sanityUI");
    expect(categorizeImportSource("@sanity/icons")).toBe("sanityUI"); // Now sanityUI
    expect(categorizeImportSource("@radix-ui/react-dialog")).toBe("otherUI");
    expect(categorizeImportSource("@radix-ui/react-popover")).toBe("otherUI");
  });

  test("handles path aliases correctly", () => {
    expect(categorizeImportSource("@/components/Button")).toBe("internal");
    expect(categorizeImportSource("@/ui-components/Dialog")).toBe("internal");
    // Tilde paths match "primitives" pattern, so they're categorized as internal
    expect(categorizeImportSource("~/primitives/Text")).toBe("internal");
    // Paths without components/primitives/ui-components are not categorized
    expect(categorizeImportSource("~/utils/formatDate")).toBe(null);
  });

  test("handles deeply nested relative paths", () => {
    expect(categorizeImportSource("../../../../components/Button")).toBe(
      "internal",
    );
    expect(categorizeImportSource("./a/b/c/d/Button")).toBe("internal");
  });

  test("distinguishes @sanity/ui from @sanity/ui/theme", () => {
    expect(categorizeImportSource("@sanity/ui")).toBe("sanityUI");
    expect(categorizeImportSource("@sanity/ui/theme")).not.toBe("sanityUI");
    expect(categorizeImportSource("@sanity/ui/css")).toBe("sanityUI");
  });

  test("@sanity/icons is part of Sanity UI ecosystem", () => {
    expect(categorizeImportSource("@sanity/icons")).toBe("sanityUI");
    expect(categorizeImportSource("@sanity/icons/")).toBe("sanityUI");
  });
});

describe("Edge cases for parsing", () => {
  test("handles type-only imports in TypeScript", () => {
    // Type imports should be filtered out
    expect(parseNamedImports("type ButtonProps")).toEqual([]);
    expect(parseNamedImports("type ButtonProps, Button")).toEqual(["Button"]);
    expect(parseNamedImports("Button, type CardProps, Flex")).toEqual([
      "Button",
      "Flex",
    ]);
  });

  test("handles complex aliasing patterns", () => {
    expect(parseNamedImports("Button as B")).toEqual(["B"]);
    expect(parseNamedImports("Button as UIButton, Card as UICard")).toEqual([
      "UIButton",
      "UICard",
    ]);
  });

  test("handles empty and whitespace-only strings", () => {
    expect(parseNamedImports("")).toEqual([]);
    expect(parseNamedImports("   ")).toEqual([]);
    expect(parseNamedImports("\n\t")).toEqual([]);
  });

  test("handles imports with trailing commas", () => {
    expect(parseNamedImports("Button, Card,")).toEqual(["Button", "Card"]);
    expect(parseNamedImports("Button,")).toEqual(["Button"]);
  });
});

describe("Internal component Sanity UI adoption tracking", () => {
  test("correctly identifies file with internal imports using Sanity UI", () => {
    const content = `
      import { Button, Card } from '@sanity/ui'
      import { CustomWidget } from './components/CustomWidget'

      export function MyComponent() {
        return (
          <Card>
            <CustomWidget>
              <Button>Click</Button>
            </CustomWidget>
          </Card>
        )
      }
    `;

    const result = analyzeContent(content);

    expect(result.hasSanityUI).toBe(true);
    expect(result.hasInternal).toBe(true);
    expect(result.usesSanityUIWithInternal).toBe(true);
  });

  test("correctly identifies file with internal imports NOT using Sanity UI", () => {
    const content = `
      import { CustomWidget } from './components/CustomWidget'
      import { FormField } from '../ui-components/FormField'

      export function MyComponent() {
        return (
          <CustomWidget>
            <FormField />
          </CustomWidget>
        )
      }
    `;

    const result = analyzeContent(content);

    expect(result.hasSanityUI).toBe(false);
    expect(result.hasInternal).toBe(true);
    expect(result.usesSanityUIWithInternal).toBe(false);
  });

  test("correctly identifies file with Sanity UI but no internal imports", () => {
    const content = `
      import { Button, Card, Flex } from '@sanity/ui'

      export function MyComponent() {
        return (
          <Flex>
            <Card>
              <Button>Click</Button>
            </Card>
          </Flex>
        )
      }
    `;

    const result = analyzeContent(content);

    expect(result.hasSanityUI).toBe(true);
    expect(result.hasInternal).toBe(false);
    expect(result.usesSanityUIWithInternal).toBe(false);
  });

  test("aggregates internal adoption metrics correctly", () => {
    const fileResults = [
      {
        // File 1: Has both internal and Sanity UI
        imports: {
          sanityUI: { components: ["Button"], count: 1 },
          otherUI: { components: [], count: 0 },
          internal: { components: ["CustomInput"], count: 1 },
          nativeHTML: { components: [], count: 0 },
          total: { components: ["Button", "CustomInput"], count: 2 },
        },
        jsxCounts: { Button: 1, CustomInput: 1 },
        jsxCount: 2,
        hasSanityUI: true,
        hasInternal: true,
        usesSanityUIWithInternal: true,
      },
      {
        // File 2: Has internal but NOT Sanity UI
        imports: {
          sanityUI: { components: [], count: 0 },
          otherUI: { components: [], count: 0 },
          internal: { components: ["LocalWidget"], count: 1 },
          nativeHTML: { components: [], count: 0 },
          total: { components: ["LocalWidget"], count: 1 },
        },
        jsxCounts: { LocalWidget: 1 },
        jsxCount: 1,
        hasSanityUI: false,
        hasInternal: true,
        usesSanityUIWithInternal: false,
      },
      {
        // File 3: Has Sanity UI and internal
        imports: {
          sanityUI: { components: ["Card", "Text"], count: 2 },
          otherUI: { components: [], count: 0 },
          internal: { components: ["FormField"], count: 1 },
          nativeHTML: { components: [], count: 0 },
          total: {
            components: ["Card", "Text", "FormField"],
            count: 3,
          },
        },
        jsxCounts: { Card: 1, Text: 1, FormField: 1 },
        jsxCount: 3,
        hasSanityUI: true,
        hasInternal: true,
        usesSanityUIWithInternal: true,
      },
      {
        // File 4: No internal, only Sanity UI
        imports: {
          sanityUI: { components: ["Flex"], count: 1 },
          otherUI: { components: [], count: 0 },
          internal: { components: [], count: 0 },
          nativeHTML: { components: [], count: 0 },
          total: { components: ["Flex"], count: 1 },
        },
        jsxCounts: { Flex: 1 },
        jsxCount: 1,
        hasSanityUI: true,
        hasInternal: false,
        usesSanityUIWithInternal: false,
      },
    ];

    const result = aggregateResults(fileResults);

    expect(result.fileCount).toBe(4);
    // 3 files have internal imports (files 1, 2, 3)
    expect(result.filesWithInternal).toBe(3);
    // 2 files have both internal AND Sanity UI (files 1, 3)
    expect(result.filesWithInternalUsingSanityUI).toBe(2);
  });
});
