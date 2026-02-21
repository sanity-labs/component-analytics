const { UI_LIBRARY_NAMES } = require("../lib/constants");
const {
  lineNumberAt,
  extractImports,
  parseNamedImports,
  isTrackedUISource,
  buildTrackedUIImportMap,
  findTagEnd,
  parseProps,
  classifyValue,
  normalizeValue,
  analyzeFileContent,
  createEmptyReport,
  recordProp,
  mergeFileResult,
  applyAutoDetectedDefaults,
  buildComponentJson,
  generateSummaryCSV,
  generateSummaryJSON,
  generateSummaryText,
} = require("../per-component/analyze-per-component");

// ═══════════════════════════════════════════════════════════════════════════════
// lineNumberAt
// ═══════════════════════════════════════════════════════════════════════════════

describe("lineNumberAt", () => {
  test("returns 1 for offset 0", () => {
    expect(lineNumberAt("hello\nworld", 0)).toBe(1);
  });

  test("returns 1 for offset within the first line", () => {
    expect(lineNumberAt("hello\nworld", 3)).toBe(1);
  });

  test("returns 2 for offset on the second line", () => {
    // "hello\n" = 6 chars, so offset 6 is the first char of line 2
    expect(lineNumberAt("hello\nworld", 6)).toBe(2);
  });

  test("returns correct line for offset at the newline character itself", () => {
    // offset 5 is the '\n' at the end of line 1 — the loop stops before
    // reaching it, so it's still line 1.
    expect(lineNumberAt("hello\nworld", 5)).toBe(1);
  });

  test("returns correct line for multi-line content", () => {
    const content = "line1\nline2\nline3\nline4\n";
    expect(lineNumberAt(content, 0)).toBe(1);
    expect(lineNumberAt(content, 6)).toBe(2);
    expect(lineNumberAt(content, 12)).toBe(3);
    expect(lineNumberAt(content, 18)).toBe(4);
  });

  test("returns 1 for negative offset", () => {
    expect(lineNumberAt("hello\nworld", -5)).toBe(1);
  });

  test("returns 1 for empty content", () => {
    expect(lineNumberAt("", 0)).toBe(1);
  });

  test("handles offset beyond content length", () => {
    // Should count all newlines in the string
    const content = "a\nb\nc";
    expect(lineNumberAt(content, 1000)).toBe(3);
  });

  test("handles content with no newlines", () => {
    expect(lineNumberAt("hello world", 5)).toBe(1);
  });

  test("handles content with consecutive newlines", () => {
    // content: "a\n\n\nb"
    //  index:   0 1 2 3 4
    // The loop runs i = 0..<offset, so:
    //   offset 0 → line 1 (no chars scanned)
    //   offset 1 → scans 'a' → line 1
    //   offset 2 → scans 'a','\n' → line 2
    //   offset 3 → scans 'a','\n','\n' → line 3
    const content = "a\n\n\nb";
    expect(lineNumberAt(content, 0)).toBe(1);
    expect(lineNumberAt(content, 1)).toBe(1);
    expect(lineNumberAt(content, 2)).toBe(2);
    expect(lineNumberAt(content, 3)).toBe(3);
  });

  test("works for a realistic JSX file", () => {
    const content = [
      'import { Button } from "@sanity/ui"', // line 1
      "", // line 2
      "export function MyComponent() {", // line 3
      "  return (", // line 4
      "    <Button>Click</Button>", // line 5
      "  )", // line 6
      "}", // line 7
    ].join("\n");

    // Find the offset of "<Button"
    const idx = content.indexOf("<Button");
    expect(lineNumberAt(content, idx)).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// extractImports
// ═══════════════════════════════════════════════════════════════════════════════

describe("extractImports", () => {
  test("extracts a single named import", () => {
    const content = `import { Button } from '@sanity/ui'`;
    const result = extractImports(content);
    expect(result).toEqual([
      { namedImports: " Button ", defaultImport: null, source: "@sanity/ui" },
    ]);
  });

  test("extracts multiple named imports", () => {
    const content = `import { Button, Card, Flex } from '@sanity/ui'`;
    const result = extractImports(content);
    expect(result.length).toBe(1);
    expect(result[0].namedImports).toContain("Button");
    expect(result[0].namedImports).toContain("Card");
    expect(result[0].namedImports).toContain("Flex");
  });

  test("extracts a default import", () => {
    const content = `import MyWidget from './MyWidget'`;
    const result = extractImports(content);
    expect(result).toEqual([
      { namedImports: null, defaultImport: "MyWidget", source: "./MyWidget" },
    ]);
  });

  test("extracts multiple import statements", () => {
    const content = `
      import { Button } from '@sanity/ui'
      import { CloseIcon } from '@sanity/icons'
      import CustomWidget from './CustomWidget'
    `;
    const result = extractImports(content);
    expect(result.length).toBe(3);
  });

  test("returns empty array for no imports", () => {
    const content = "const x = 1;";
    expect(extractImports(content)).toEqual([]);
  });

  test("returns empty array for empty content", () => {
    expect(extractImports("")).toEqual([]);
  });

  test("handles single quotes", () => {
    const content = `import { Button } from '@sanity/ui'`;
    const result = extractImports(content);
    expect(result[0].source).toBe("@sanity/ui");
  });

  test("handles double quotes", () => {
    const content = `import { Button } from "@sanity/ui"`;
    const result = extractImports(content);
    expect(result[0].source).toBe("@sanity/ui");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// parseNamedImports
// ═══════════════════════════════════════════════════════════════════════════════

describe("parseNamedImports", () => {
  test("parses single import", () => {
    const result = parseNamedImports("Button");
    expect(result).toEqual([{ original: "Button", local: "Button" }]);
  });

  test("parses multiple imports", () => {
    const result = parseNamedImports("Button, Card, Flex");
    expect(result).toEqual([
      { original: "Button", local: "Button" },
      { original: "Card", local: "Card" },
      { original: "Flex", local: "Flex" },
    ]);
  });

  test("parses aliased import", () => {
    const result = parseNamedImports("Button as Btn");
    expect(result).toEqual([{ original: "Button", local: "Btn" }]);
  });

  test("parses mix of aliased and non-aliased", () => {
    const result = parseNamedImports("Button as Btn, Card, Flex as F");
    expect(result).toEqual([
      { original: "Button", local: "Btn" },
      { original: "Card", local: "Card" },
      { original: "Flex", local: "F" },
    ]);
  });

  test("filters out lowercase names (hooks, utilities)", () => {
    const result = parseNamedImports("useToast, Button, rem");
    expect(result).toEqual([{ original: "Button", local: "Button" }]);
  });

  test("returns empty array for null", () => {
    expect(parseNamedImports(null)).toEqual([]);
  });

  test("returns empty array for empty string", () => {
    expect(parseNamedImports("")).toEqual([]);
  });

  test("handles whitespace variations", () => {
    const result = parseNamedImports("  Button  ,  Card  ");
    expect(result.length).toBe(2);
    expect(result[0].original).toBe("Button");
    expect(result[1].original).toBe("Card");
  });

  test("handles type keyword prefix (filtered)", () => {
    const result = parseNamedImports("type ButtonProps, Button");
    // "type" starts lowercase, so "type" is skipped.
    // "ButtonProps" is not in the list but is PascalCase — depends on
    // implementation: the raw parser returns it.
    // "Button" should always be present.
    const locals = result.map((r) => r.local);
    expect(locals).toContain("Button");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// isTrackedUISource
// ═══════════════════════════════════════════════════════════════════════════════

describe("isTrackedUISource", () => {
  test('returns true for "@sanity/ui"', () => {
    expect(isTrackedUISource("@sanity/ui")).toBe(true);
  });

  test("returns true for @sanity/ui subpath", () => {
    expect(isTrackedUISource("@sanity/ui/components")).toBe(true);
  });

  test("returns false for @sanity/ui/theme", () => {
    expect(isTrackedUISource("@sanity/ui/theme")).toBe(false);
  });

  test("returns true for @sanity/icons (configured in uiLibraries)", () => {
    expect(isTrackedUISource("@sanity/icons")).toBe(true);
  });

  test("returns false for relative imports", () => {
    expect(isTrackedUISource("./Button")).toBe(false);
  });

  test("returns false for other packages", () => {
    expect(isTrackedUISource("react")).toBe(false);
    expect(isTrackedUISource("@radix-ui/react-popover")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildTrackedUIImportMap
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildTrackedUIImportMap", () => {
  test("maps standard imports", () => {
    const content = `import { Button, Card, Flex } from '@sanity/ui'`;
    const map = buildTrackedUIImportMap(content);
    expect(map).toEqual({
      Button: "Button",
      Card: "Card",
      Flex: "Flex",
    });
  });

  test("maps aliased imports", () => {
    const content = `import { Button as Btn, Card as UICard } from '@sanity/ui'`;
    const map = buildTrackedUIImportMap(content);
    expect(map).toEqual({
      Btn: "Button",
      UICard: "Card",
    });
  });

  test("includes both @sanity/ui and @sanity/icons imports", () => {
    const content = `
      import { Button } from '@sanity/ui'
      import { CloseIcon } from '@sanity/icons'
      import { Dialog } from './Dialog'
    `;
    const map = buildTrackedUIImportMap(content);
    expect(map.Button).toBe("Button");
    expect(map.CloseIcon).toBe("CloseIcon");
    expect(map.Dialog).toBeUndefined();
  });

  test("excludes hooks and utilities", () => {
    const content = `import { Button, useToast, rem } from '@sanity/ui'`;
    const map = buildTrackedUIImportMap(content);
    expect(map).toEqual({ Button: "Button" });
  });

  test("excludes @sanity/ui/theme imports", () => {
    const content = `import { Theme } from '@sanity/ui/theme'`;
    const map = buildTrackedUIImportMap(content);
    expect(map).toEqual({});
  });

  test("returns empty map for no tracked UI library imports", () => {
    const content = `import { useState } from 'react'`;
    const map = buildTrackedUIImportMap(content);
    expect(map).toEqual({});
  });

  test("returns empty map for empty content", () => {
    expect(buildTrackedUIImportMap("")).toEqual({});
  });

  test("only includes components in the TRACKED_COMPONENTS list", () => {
    // "SomethingRandom" is PascalCase but not in the list
    const content = `import { Button, SomethingRandom } from '@sanity/ui'`;
    const map = buildTrackedUIImportMap(content);
    expect(map).toEqual({ Button: "Button" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// findTagEnd
// ═══════════════════════════════════════════════════════════════════════════════

describe("findTagEnd", () => {
  test("finds > for simple tag", () => {
    const content = "<Button onClick={fn}>Click</Button>";
    // After "<Button" at index 7
    const idx = findTagEnd(content, 7);
    expect(content[idx]).toBe(">");
    expect(idx).toBe(20);
  });

  test("handles nested braces", () => {
    const content = '<Card style={{color: "red"}} padding={4}>';
    // After "<Card" at index 5
    const idx = findTagEnd(content, 5);
    expect(content[idx]).toBe(">");
  });

  test("handles self-closing tag", () => {
    const content = "<Spinner />";
    const idx = findTagEnd(content, 8);
    expect(content[idx]).toBe(">");
  });

  test("returns -1 when no closing bracket found", () => {
    const content = "<Button onClick={fn}";
    const idx = findTagEnd(content, 7);
    expect(idx).toBe(-1);
  });

  test("handles multi-line tags", () => {
    const content = `<Card
      padding={4}
      tone="primary"
    >`;
    const idx = findTagEnd(content, 5);
    expect(idx).toBeGreaterThan(0);
    expect(content[idx]).toBe(">");
  });

  test("handles deeply nested expressions", () => {
    const content = "<Box style={{transform: `translateX(${x}px)`}}>";
    const idx = findTagEnd(content, 4);
    expect(content[idx]).toBe(">");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// parseProps
// ═══════════════════════════════════════════════════════════════════════════════

describe("parseProps", () => {
  test("parses string prop with double quotes", () => {
    const result = parseProps(' tone="primary"');
    expect(result).toEqual([{ name: "tone", value: "'primary'" }]);
  });

  test("parses string prop with single quotes", () => {
    const result = parseProps(" tone='primary'");
    expect(result).toEqual([{ name: "tone", value: "'primary'" }]);
  });

  test("parses numeric expression prop", () => {
    const result = parseProps(" padding={4}");
    expect(result).toEqual([{ name: "padding", value: "4" }]);
  });

  test("parses boolean shorthand prop", () => {
    const result = parseProps(" border disabled");
    expect(result).toEqual([
      { name: "border", value: "true" },
      { name: "disabled", value: "true" },
    ]);
  });

  test("parses multiple props", () => {
    const result = parseProps(' padding={4} tone="primary" border');
    expect(result.length).toBe(3);
    expect(result).toEqual([
      { name: "padding", value: "4" },
      { name: "tone", value: "'primary'" },
      { name: "border", value: "true" },
    ]);
  });

  test("parses object expression prop", () => {
    const result = parseProps(' style={{color: "red"}}');
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("style");
    expect(result[0].value).toContain("color");
  });

  test("parses function/arrow expression prop", () => {
    const result = parseProps(" onClick={() => doSomething()}");
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("onClick");
    expect(result[0].value).toContain("=>");
  });

  test("parses variable reference prop", () => {
    const result = parseProps(" icon={CloseIcon}");
    expect(result).toEqual([{ name: "icon", value: "CloseIcon" }]);
  });

  test("parses array expression prop", () => {
    const result = parseProps(" paddingY={[4, 5, 6]}");
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("paddingY");
    expect(result[0].value).toContain("[4, 5, 6]");
  });

  test("skips spread attributes", () => {
    const result = parseProps(' {...props} padding={4} tone="primary"');
    expect(result.length).toBe(2);
    expect(result[0].name).toBe("padding");
    expect(result[1].name).toBe("tone");
  });

  test("handles data- and aria- attributes", () => {
    const result = parseProps(' data-testid="card" aria-label="Close"');
    expect(result).toEqual([
      { name: "data-testid", value: "'card'" },
      { name: "aria-label", value: "'Close'" },
    ]);
  });

  test("returns empty array for empty input", () => {
    expect(parseProps("")).toEqual([]);
  });

  test("returns empty array for whitespace only", () => {
    expect(parseProps("   ")).toEqual([]);
  });

  test("handles self-closing slash", () => {
    const result = parseProps(" padding={4} /");
    expect(result).toEqual([{ name: "padding", value: "4" }]);
  });

  test("handles ternary expression in prop value", () => {
    const result = parseProps(" tone={isActive ? 'primary' : 'default'}");
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("tone");
    // Expression values keep their raw content
    expect(result[0].value).toContain("?");
  });

  test("handles template literal in prop value", () => {
    const result = parseProps(" className={`card-${variant}`}");
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("className");
    // Expression values keep their raw content
    expect(result[0].value).toContain("`");
  });

  test("handles complex nested expression", () => {
    const result = parseProps(
      " style={{gridTemplateColumns: `repeat(${cols}, 1fr)`}}",
    );
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("style");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// classifyValue
// ═══════════════════════════════════════════════════════════════════════════════

describe("classifyValue", () => {
  test("classifies boolean true", () => {
    expect(classifyValue("true")).toBe("true");
  });

  test("classifies boolean false", () => {
    expect(classifyValue("false")).toBe("false");
  });

  test("classifies integer", () => {
    expect(classifyValue("4")).toBe("4");
  });

  test("classifies negative number", () => {
    expect(classifyValue("-1")).toBe("-1");
  });

  test("classifies decimal", () => {
    expect(classifyValue("0.5")).toBe("0.5");
  });

  test("classifies unquoted string as itself (already unwrapped)", () => {
    expect(classifyValue("primary")).toBe("<variable:primary>");
  });

  test("classifies quoted string", () => {
    expect(classifyValue("'primary'")).toBe("primary");
    expect(classifyValue('"ghost"')).toBe("ghost");
  });

  test("classifies array literal", () => {
    expect(classifyValue("[4, 5, 6]")).toBe("<array>");
  });

  test("classifies object literal", () => {
    expect(classifyValue('{color: "red"}')).toBe("<object>");
  });

  test("classifies arrow function", () => {
    expect(classifyValue("() => doSomething()")).toBe("<function>");
  });

  test("classifies handler by name", () => {
    expect(classifyValue("handleClick")).toBe("<handler>");
    expect(classifyValue("onClose")).toBe("<handler>");
  });

  test("classifies ternary", () => {
    expect(classifyValue("isOpen ? 'block' : 'none'")).toBe("<ternary>");
  });

  test("classifies template literal", () => {
    expect(classifyValue("`card-${variant}`")).toBe("<template>");
  });

  test("classifies simple variable", () => {
    expect(classifyValue("myValue")).toBe("<variable:myValue>");
  });

  test("classifies dotted variable", () => {
    expect(classifyValue("theme.color")).toBe("<variable:theme.color>");
  });

  test("classifies complex expression as <expression>", () => {
    expect(classifyValue("a + b * c")).toBe("<expression>");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// normalizeValue
// ═══════════════════════════════════════════════════════════════════════════════

describe("normalizeValue", () => {
  test("keeps boolean values", () => {
    expect(normalizeValue("true")).toBe("true");
    expect(normalizeValue("false")).toBe("false");
  });

  test("keeps numeric values", () => {
    expect(normalizeValue("4")).toBe("4");
    expect(normalizeValue("0.5")).toBe("0.5");
    expect(normalizeValue("-1")).toBe("-1");
  });

  test("wraps short string literals in quotes", () => {
    expect(normalizeValue("primary")).toBe('"primary"');
    expect(normalizeValue("ghost")).toBe('"ghost"');
  });

  test("collapses <variable:X> to <variable>", () => {
    expect(normalizeValue("<variable:myValue>")).toBe("<variable>");
    expect(normalizeValue("<variable:theme.color>")).toBe("<variable>");
  });

  test("preserves other category labels", () => {
    expect(normalizeValue("<function>")).toBe("<function>");
    expect(normalizeValue("<handler>")).toBe("<handler>");
    expect(normalizeValue("<ternary>")).toBe("<ternary>");
    expect(normalizeValue("<array>")).toBe("<array>");
    expect(normalizeValue("<object>")).toBe("<object>");
    expect(normalizeValue("<expression>")).toBe("<expression>");
    expect(normalizeValue("<template>")).toBe("<template>");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// analyzeFileContent
// ═══════════════════════════════════════════════════════════════════════════════

describe("analyzeFileContent", () => {
  test("finds tracked UI library imports and JSX instances with props", () => {
    const content = `
      import { Button, Card } from '@sanity/ui'

      export function MyComponent() {
        return (
          <Card padding={4} tone="primary">
            <Button mode="ghost" onClick={handleClick}>Click</Button>
          </Card>
        )
      }
    `;

    const result = analyzeFileContent(content);

    expect(result.importMap).toEqual({ Button: "Button", Card: "Card" });
    expect(result.instances.length).toBe(2);

    const card = result.instances.find((i) => i.component === "Card");
    expect(card).toBeDefined();
    expect(card.props.length).toBe(2);
    expect(card.props).toContainEqual({ name: "padding", value: "4" });
    expect(card.props).toContainEqual({ name: "tone", value: "'primary'" });

    const button = result.instances.find((i) => i.component === "Button");
    expect(button).toBeDefined();
    expect(button.props.length).toBe(2);
    expect(button.props).toContainEqual({ name: "mode", value: "'ghost'" });
  });

  test("includes line numbers on every instance", () => {
    const content = [
      'import { Button, Card } from "@sanity/ui"', // line 1
      "", // line 2
      "export function MyComponent() {", // line 3
      "  return (", // line 4
      "    <Card padding={4}>", // line 5
      "      <Button>One</Button>", // line 6
      "      <Button>Two</Button>", // line 7
      "    </Card>", // line 8
      "  )", // line 9
      "}", // line 10
    ].join("\n");

    const result = analyzeFileContent(content);

    expect(result.instances.length).toBe(3);

    const card = result.instances.find((i) => i.component === "Card");
    expect(card.line).toBe(5);

    const buttons = result.instances.filter((i) => i.component === "Button");
    expect(buttons.length).toBe(2);
    expect(buttons[0].line).toBe(6);
    expect(buttons[1].line).toBe(7);
  });

  test("line numbers are correct with blank lines and comments", () => {
    const content = [
      "// Top-level comment", // line 1
      "", // line 2
      'import { Text } from "@sanity/ui"', // line 3
      "", // line 4
      "// Another comment", // line 5
      "", // line 6
      "export function X() {", // line 7
      "  return (", // line 8
      "    <Text size={1}>Hello</Text>", // line 9
      "  )", // line 10
      "}", // line 11
    ].join("\n");

    const result = analyzeFileContent(content);
    expect(result.instances.length).toBe(1);
    expect(result.instances[0].line).toBe(9);
  });

  test("counts repeated JSX instances with distinct line numbers", () => {
    const content = [
      'import { Button } from "@sanity/ui"', // line 1
      "", // line 2
      "export function List() {", // line 3
      "  return (", // line 4
      "    <>", // line 5
      '      <Button mode="default">One</Button>', // line 6
      '      <Button mode="ghost">Two</Button>', // line 7
      '      <Button mode="bleed">Three</Button>', // line 8
      "    </>", // line 9
      "  )", // line 10
      "}", // line 11
    ].join("\n");

    const result = analyzeFileContent(content);
    expect(result.instances.length).toBe(3);
    expect(result.instances.every((i) => i.component === "Button")).toBe(true);

    // Each instance should have a unique line number
    expect(result.instances[0].line).toBe(6);
    expect(result.instances[1].line).toBe(7);
    expect(result.instances[2].line).toBe(8);
  });

  test("handles aliased imports", () => {
    const content = `
      import { Button as Btn } from '@sanity/ui'

      export function MyComponent() {
        return <Btn mode="ghost">Click</Btn>
      }
    `;

    const result = analyzeFileContent(content);
    expect(result.importMap).toEqual({ Btn: "Button" });
    expect(result.instances.length).toBe(1);
    expect(result.instances[0].component).toBe("Button");
  });

  test("returns empty instances for file with no tracked UI library imports", () => {
    const content = `
      import { useState } from 'react'
      export function Hook() { return null }
    `;

    const result = analyzeFileContent(content);
    expect(result.importMap).toEqual({});
    expect(result.instances).toEqual([]);
  });

  test("returns empty instances for empty content", () => {
    const result = analyzeFileContent("");
    expect(result.importMap).toEqual({});
    expect(result.instances).toEqual([]);
  });

  test("handles imported but unused components", () => {
    const content = `
      import { Button, Card, Flex } from '@sanity/ui'

      export function MyComponent() {
        return <Button>Only button used</Button>
      }
    `;

    const result = analyzeFileContent(content);
    // All three are in the import map
    expect(Object.keys(result.importMap).length).toBe(3);
    // But only Button appears as a JSX instance
    expect(result.instances.length).toBe(1);
    expect(result.instances[0].component).toBe("Button");
  });

  test("parses boolean shorthand props", () => {
    const content = `
      import { Card } from '@sanity/ui'
      export function MyComponent() {
        return <Card border overflow="auto">content</Card>
      }
    `;

    const result = analyzeFileContent(content);
    expect(result.instances.length).toBe(1);
    expect(result.instances[0].props).toContainEqual({
      name: "border",
      value: "true",
    });
    expect(result.instances[0].props).toContainEqual({
      name: "overflow",
      value: "'auto'",
    });
  });

  test("parses self-closing tags with props", () => {
    const content = `
      import { Spinner, TextInput } from '@sanity/ui'
      export function MyComponent() {
        return (
          <>
            <Spinner muted />
            <TextInput value={val} onChange={handleChange} />
          </>
        )
      }
    `;

    const result = analyzeFileContent(content);
    expect(result.instances.length).toBe(2);

    const spinner = result.instances.find((i) => i.component === "Spinner");
    expect(spinner.props).toContainEqual({ name: "muted", value: "true" });

    const input = result.instances.find((i) => i.component === "TextInput");
    expect(input.props.length).toBe(2);
  });

  test("counts both @sanity/ui and @sanity/icons components", () => {
    const content = `
      import { Button } from '@sanity/ui'
      import { CloseIcon } from '@sanity/icons'
      import { CustomDialog } from './Dialog'

      export function MyComponent() {
        return (
          <CustomDialog>
            <CloseIcon />
            <Button>Close</Button>
          </CustomDialog>
        )
      }
    `;

    const result = analyzeFileContent(content);
    // Button and CloseIcon are both tracked; CustomDialog is not
    expect(result.instances.length).toBe(2);
    const components = result.instances.map((i) => i.component);
    expect(components).toContain("Button");
    expect(components).toContain("CloseIcon");
  });

  test("handles multi-line JSX tag with many props", () => {
    const content = `
      import { Card } from '@sanity/ui'

      export function MyComponent() {
        return (
          <Card
            padding={4}
            radius={2}
            border
            tone="primary"
            overflow="auto"
            style={{minHeight: '100px'}}
          >
            content
          </Card>
        )
      }
    `;

    const result = analyzeFileContent(content);
    expect(result.instances.length).toBe(1);
    expect(result.instances[0].props.length).toBe(6);

    const propNames = result.instances[0].props.map((p) => p.name);
    expect(propNames).toContain("padding");
    expect(propNames).toContain("radius");
    expect(propNames).toContain("border");
    expect(propNames).toContain("tone");
    expect(propNames).toContain("overflow");
    expect(propNames).toContain("style");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// createEmptyReport
// ═══════════════════════════════════════════════════════════════════════════════

describe("createEmptyReport", () => {
  test("creates a report with all fields zeroed", () => {
    const report = createEmptyReport("Button");
    expect(report).toEqual({
      component: "Button",
      library: "Sanity UI",
      totalImports: 0,
      totalInstances: 0,
      props: {},
      codebaseImports: {},
      codebaseInstances: {},
      references: [],
      totalDefaultUsages: 0,
    });
  });

  test("uses the provided component name", () => {
    const report = createEmptyReport("Card");
    expect(report.component).toBe("Card");
  });

  test("references array starts empty", () => {
    const report = createEmptyReport("Flex");
    expect(report.references).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// recordProp
// ═══════════════════════════════════════════════════════════════════════════════

describe("recordProp", () => {
  test("creates prop entry on first recording", () => {
    const report = createEmptyReport("Card");
    recordProp(report, "padding", "4");

    expect(report.props.padding).toBeDefined();
    expect(report.props.padding.totalUsages).toBe(1);
    expect(report.props.padding.values["4"]).toBe(1);
  });

  test("increments count on repeated recording", () => {
    const report = createEmptyReport("Card");
    recordProp(report, "padding", "4");
    recordProp(report, "padding", "4");
    recordProp(report, "padding", "2");

    expect(report.props.padding.totalUsages).toBe(3);
    expect(report.props.padding.values["4"]).toBe(2);
    expect(report.props.padding.values["2"]).toBe(1);
  });

  test("tracks multiple different props", () => {
    const report = createEmptyReport("Card");
    recordProp(report, "padding", "4");
    recordProp(report, "tone", "primary");
    recordProp(report, "border", "true");

    expect(Object.keys(report.props).length).toBe(3);
    expect(report.props.padding.totalUsages).toBe(1);
    expect(report.props.tone.totalUsages).toBe(1);
    expect(report.props.border.totalUsages).toBe(1);
  });

  test("normalizes string literal values", () => {
    const report = createEmptyReport("Button");
    // parseProps preserves quotes: mode="ghost" → value "'ghost'"
    recordProp(report, "mode", "'ghost'");

    // classifyValue("'ghost'") → "ghost" (unwraps quotes)
    // normalizeValue("ghost") → '"ghost"'
    expect(report.props.mode.values['"ghost"']).toBe(1);
  });

  test("normalizes handler references", () => {
    const report = createEmptyReport("Button");
    recordProp(report, "onClick", "handleClick");

    expect(report.props.onClick.values["<handler>"]).toBe(1);
  });

  test("normalizes arrow functions", () => {
    const report = createEmptyReport("Button");
    recordProp(report, "onClick", "() => doSomething()");

    expect(report.props.onClick.values["<function>"]).toBe(1);
  });

  test("normalizes ternary expressions", () => {
    const report = createEmptyReport("Card");
    recordProp(report, "tone", "isActive ? 'primary' : 'default'");

    expect(report.props.tone.values["<ternary>"]).toBe(1);
  });

  test("keeps numeric values as-is (from expression props)", () => {
    const report = createEmptyReport("Card");
    // padding={4} → value "4" (from expression, no quotes)
    recordProp(report, "padding", "4");
    recordProp(report, "radius", "2");

    expect(report.props.padding.values["4"]).toBe(1);
    expect(report.props.radius.values["2"]).toBe(1);
  });

  test("keeps boolean values as-is", () => {
    const report = createEmptyReport("Card");
    recordProp(report, "border", "true");
    recordProp(report, "disabled", "false");

    expect(report.props.border.values["true"]).toBe(1);
    expect(report.props.disabled.values["false"]).toBe(1);
  });

  // ── Default value detection ─────────────────────────────────────────────
  //
  // Defaults are now detected AFTER aggregation via applyAutoDetectedDefaults(),
  // not during recordProp().  These tests build a reports map, record props,
  // then call applyAutoDetectedDefaults() and check the results.

  test("detects when Button mode is set to its default value", () => {
    const reports = { Button: createEmptyReport("Button") };
    reports.Button.totalInstances = 3;
    recordProp(reports.Button, "mode", "'default'");
    recordProp(reports.Button, "mode", "'ghost'");
    recordProp(reports.Button, "mode", "'bleed'");

    applyAutoDetectedDefaults(reports);

    expect(reports.Button.props.mode.totalUsages).toBe(3);
    expect(reports.Button.props.mode.defaultUsages).toBe(1);
    expect(reports.Button.props.mode.defaultValue).toBe('"default"');
    expect(reports.Button.totalDefaultUsages).toBe(1);
  });

  test("detects when Flex direction is set to its default 'row'", () => {
    const reports = { Flex: createEmptyReport("Flex") };
    reports.Flex.totalInstances = 3;
    recordProp(reports.Flex, "direction", "'row'");
    recordProp(reports.Flex, "direction", "'row'");
    recordProp(reports.Flex, "direction", "'column'");

    applyAutoDetectedDefaults(reports);

    expect(reports.Flex.props.direction.totalUsages).toBe(3);
    expect(reports.Flex.props.direction.defaultUsages).toBe(2);
    expect(reports.Flex.props.direction.defaultValue).toBe('"row"');
    expect(reports.Flex.totalDefaultUsages).toBe(2);
  });

  test("detects when Flex wrap is set to its default 'nowrap'", () => {
    const reports = { Flex: createEmptyReport("Flex") };
    reports.Flex.totalInstances = 1;
    recordProp(reports.Flex, "wrap", "'nowrap'");

    applyAutoDetectedDefaults(reports);

    expect(reports.Flex.props.wrap.defaultUsages).toBe(1);
    expect(reports.Flex.props.wrap.defaultValue).toBe('"nowrap"');
  });

  test("detects when Flex justify is set to its default 'flex-start'", () => {
    const reports = { Flex: createEmptyReport("Flex") };
    reports.Flex.totalInstances = 2;
    recordProp(reports.Flex, "justify", "'flex-start'");
    recordProp(reports.Flex, "justify", "'center'");

    applyAutoDetectedDefaults(reports);

    expect(reports.Flex.props.justify.defaultUsages).toBe(1);
    expect(reports.Flex.props.justify.defaultValue).toBe('"flex-start"');
  });

  test("detects when Flex align is set to its default 'stretch'", () => {
    const reports = { Flex: createEmptyReport("Flex") };
    reports.Flex.totalInstances = 2;
    recordProp(reports.Flex, "align", "'stretch'");
    recordProp(reports.Flex, "align", "'center'");

    applyAutoDetectedDefaults(reports);

    expect(reports.Flex.props.align.defaultUsages).toBe(1);
    expect(reports.Flex.props.align.defaultValue).toBe('"stretch"');
  });

  test("detects when Text weight is set to its default 'regular'", () => {
    const reports = { Text: createEmptyReport("Text") };
    reports.Text.totalInstances = 2;
    recordProp(reports.Text, "weight", "'regular'");
    recordProp(reports.Text, "weight", "'bold'");

    applyAutoDetectedDefaults(reports);

    expect(reports.Text.props.weight.defaultUsages).toBe(1);
    expect(reports.Text.props.weight.defaultValue).toBe('"regular"');
  });

  test("detects when Card tone is set to its default 'default'", () => {
    const reports = { Card: createEmptyReport("Card") };
    reports.Card.totalInstances = 3;
    recordProp(reports.Card, "tone", "'default'");
    recordProp(reports.Card, "tone", "'primary'");
    recordProp(reports.Card, "tone", "'critical'");

    applyAutoDetectedDefaults(reports);

    expect(reports.Card.props.tone.totalUsages).toBe(3);
    expect(reports.Card.props.tone.defaultUsages).toBe(1);
    expect(reports.Card.props.tone.defaultValue).toBe('"default"');
    expect(reports.Card.totalDefaultUsages).toBe(1);
  });

  test("detects when Skeleton animated is set to its default true", () => {
    const reports = { Skeleton: createEmptyReport("Skeleton") };
    reports.Skeleton.totalInstances = 2;
    recordProp(reports.Skeleton, "animated", "true");
    recordProp(reports.Skeleton, "animated", "false");

    applyAutoDetectedDefaults(reports);

    expect(reports.Skeleton.props.animated.defaultUsages).toBe(1);
    expect(reports.Skeleton.props.animated.defaultValue).toBe("true");
    expect(reports.Skeleton.totalDefaultUsages).toBe(1);
  });

  test("detects when Button type is set to its default 'button'", () => {
    const reports = { Button: createEmptyReport("Button") };
    reports.Button.totalInstances = 2;
    recordProp(reports.Button, "type", "'button'");
    recordProp(reports.Button, "type", "'submit'");

    applyAutoDetectedDefaults(reports);

    expect(reports.Button.props.type.defaultUsages).toBe(1);
    expect(reports.Button.props.type.defaultValue).toBe('"button"');
  });

  test("does not flag non-default values as defaults", () => {
    const reports = { Button: createEmptyReport("Button") };
    reports.Button.totalInstances = 2;
    recordProp(reports.Button, "mode", "'ghost'");
    recordProp(reports.Button, "mode", "'bleed'");

    applyAutoDetectedDefaults(reports);

    expect(reports.Button.props.mode.defaultUsages).toBe(0);
    expect(reports.Button.totalDefaultUsages).toBe(0);
  });

  test("does not flag props with no known default pattern", () => {
    const reports = { Card: createEmptyReport("Card") };
    reports.Card.totalInstances = 2;
    recordProp(reports.Card, "padding", "4");
    recordProp(reports.Card, "radius", "2");

    applyAutoDetectedDefaults(reports);

    // padding and radius don't match any known default patterns
    expect(reports.Card.props.padding.defaultValue).toBeNull();
    expect(reports.Card.props.padding.defaultUsages).toBe(0);
    expect(reports.Card.props.radius.defaultValue).toBeNull();
    expect(reports.Card.props.radius.defaultUsages).toBe(0);
    expect(reports.Card.totalDefaultUsages).toBe(0);
  });

  test("does not flag dynamic values even if they might resolve to the default", () => {
    const reports = { Button: createEmptyReport("Button") };
    reports.Button.totalInstances = 1;
    // A ternary that might evaluate to "default" at runtime — but we can't know
    recordProp(reports.Button, "mode", "isActive ? 'default' : 'ghost'");

    applyAutoDetectedDefaults(reports);

    expect(reports.Button.props.mode.defaultUsages).toBe(0);
    expect(reports.Button.props.mode.values["<ternary>"]).toBe(1);
  });

  test("does not flag variable references even if named 'default'", () => {
    const reports = { Button: createEmptyReport("Button") };
    reports.Button.totalInstances = 1;
    recordProp(reports.Button, "mode", "defaultMode");

    applyAutoDetectedDefaults(reports);

    expect(reports.Button.props.mode.defaultUsages).toBe(0);
    expect(reports.Button.props.mode.values["<variable>"]).toBe(1);
  });

  test("accumulates totalDefaultUsages across multiple props", () => {
    const reports = { Button: createEmptyReport("Button") };
    reports.Button.totalInstances = 4;
    // mode="default" (1 default)
    recordProp(reports.Button, "mode", "'default'");
    // type="button" (1 default)
    recordProp(reports.Button, "type", "'button'");
    // as="button" (1 default)
    recordProp(reports.Button, "as", "'button'");
    // mode="ghost" (not default)
    recordProp(reports.Button, "mode", "'ghost'");

    applyAutoDetectedDefaults(reports);

    expect(reports.Button.props.mode.defaultUsages).toBe(1);
    expect(reports.Button.props.type.defaultUsages).toBe(1);
    expect(reports.Button.props.as.defaultUsages).toBe(1);
    expect(reports.Button.totalDefaultUsages).toBe(3);
  });

  test("components with no matching default patterns get no defaults", () => {
    const reports = { TabList: createEmptyReport("TabList") };
    reports.TabList.totalInstances = 2;
    recordProp(reports.TabList, "space", "2");
    recordProp(reports.TabList, "foo", "'bar'");

    applyAutoDetectedDefaults(reports);

    expect(reports.TabList.props.space.defaultValue).toBeNull();
    expect(reports.TabList.props.foo.defaultValue).toBeNull();
    expect(reports.TabList.totalDefaultUsages).toBe(0);
  });

  test("Tooltip placement default detection", () => {
    const reports = { Tooltip: createEmptyReport("Tooltip") };
    reports.Tooltip.totalInstances = 2;
    recordProp(reports.Tooltip, "placement", "'top'");
    recordProp(reports.Tooltip, "placement", "'bottom'");

    applyAutoDetectedDefaults(reports);

    expect(reports.Tooltip.props.placement.defaultUsages).toBe(1);
    expect(reports.Tooltip.props.placement.defaultValue).toBe('"top"');
  });

  test("Popover placement default detection", () => {
    const reports = { Popover: createEmptyReport("Popover") };
    reports.Popover.totalInstances = 2;
    recordProp(reports.Popover, "placement", "'bottom'");
    recordProp(reports.Popover, "placement", "'top'");

    applyAutoDetectedDefaults(reports);

    // Both "top" and "bottom" are in KNOWN_DEFAULT_VALUES for placement;
    // detection picks the first match found in the candidate set
    expect(
      reports.Popover.props.placement.defaultUsages,
    ).toBeGreaterThanOrEqual(1);
    expect(reports.Popover.props.placement.defaultValue).not.toBeNull();
  });

  test("TextInput type default detection", () => {
    const reports = { TextInput: createEmptyReport("TextInput") };
    reports.TextInput.totalInstances = 3;
    recordProp(reports.TextInput, "type", "'text'");
    recordProp(reports.TextInput, "type", "'password'");
    recordProp(reports.TextInput, "type", "'text'");

    applyAutoDetectedDefaults(reports);

    expect(reports.TextInput.props.type.defaultUsages).toBe(2);
    expect(reports.TextInput.props.type.defaultValue).toBe('"text"');
    expect(reports.TextInput.totalDefaultUsages).toBe(2);
  });

  test("recordProp does NOT set defaults — they are null until applyAutoDetectedDefaults", () => {
    const report = createEmptyReport("Button");
    recordProp(report, "mode", "'default'");

    // Before auto-detection, everything is null/zero
    expect(report.props.mode.defaultValue).toBeNull();
    expect(report.props.mode.defaultUsages).toBe(0);
    expect(report.totalDefaultUsages).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// mergeFileResult
// ═══════════════════════════════════════════════════════════════════════════════

describe("mergeFileResult", () => {
  test("increments import count for each imported component", () => {
    const reports = {
      Button: createEmptyReport("Button"),
      Card: createEmptyReport("Card"),
    };

    const fileResult = {
      importMap: { Button: "Button", Card: "Card" },
      instances: [],
    };

    mergeFileResult(reports, fileResult, "sanity");

    expect(reports.Button.totalImports).toBe(1);
    expect(reports.Card.totalImports).toBe(1);
    expect(reports.Button.codebaseImports.sanity).toBe(1);
    expect(reports.Card.codebaseImports.sanity).toBe(1);
  });

  test("increments instance count and records props", () => {
    const reports = {
      Button: createEmptyReport("Button"),
    };

    const fileResult = {
      importMap: { Button: "Button" },
      instances: [
        {
          component: "Button",
          props: [
            { name: "mode", value: "'ghost'" },
            { name: "onClick", value: "handleClick" },
          ],
          line: 5,
        },
        {
          component: "Button",
          props: [{ name: "mode", value: "'default'" }],
          line: 6,
        },
      ],
    };

    mergeFileResult(reports, fileResult, "sanity", "src/MyComponent.tsx");

    expect(reports.Button.totalImports).toBe(1);
    expect(reports.Button.totalInstances).toBe(2);
    expect(reports.Button.codebaseInstances.sanity).toBe(2);
    expect(reports.Button.props.mode.totalUsages).toBe(2);
    expect(reports.Button.props.onClick.totalUsages).toBe(1);

    // References should be recorded
    expect(reports.Button.references.length).toBe(2);
    expect(reports.Button.references[0]).toEqual({
      file: "src/MyComponent.tsx",
      line: 5,
      codebase: "sanity",
    });
    expect(reports.Button.references[1]).toEqual({
      file: "src/MyComponent.tsx",
      line: 6,
      codebase: "sanity",
    });
  });

  test("accumulates across multiple files and codebases", () => {
    const reports = {
      Card: createEmptyReport("Card"),
    };

    mergeFileResult(
      reports,
      {
        importMap: { Card: "Card" },
        instances: [
          {
            component: "Card",
            props: [{ name: "padding", value: "4" }],
            line: 10,
          },
        ],
      },
      "sanity",
      "src/Header.tsx",
    );

    mergeFileResult(
      reports,
      {
        importMap: { Card: "Card" },
        instances: [
          {
            component: "Card",
            props: [{ name: "padding", value: "2" }],
            line: 5,
          },
          {
            component: "Card",
            props: [{ name: "padding", value: "4" }],
            line: 12,
          },
        ],
      },
      "canvas",
      "src/Footer.tsx",
    );

    expect(reports.Card.totalImports).toBe(2);
    expect(reports.Card.totalInstances).toBe(3);
    expect(reports.Card.codebaseImports.sanity).toBe(1);
    expect(reports.Card.codebaseImports.canvas).toBe(1);
    expect(reports.Card.codebaseInstances.sanity).toBe(1);
    expect(reports.Card.codebaseInstances.canvas).toBe(2);
    expect(reports.Card.props.padding.totalUsages).toBe(3);

    // References from both files and codebases
    expect(reports.Card.references.length).toBe(3);
    expect(reports.Card.references[0]).toEqual({
      file: "src/Header.tsx",
      line: 10,
      codebase: "sanity",
    });
    expect(reports.Card.references[1]).toEqual({
      file: "src/Footer.tsx",
      line: 5,
      codebase: "canvas",
    });
    expect(reports.Card.references[2]).toEqual({
      file: "src/Footer.tsx",
      line: 12,
      codebase: "canvas",
    });
  });

  test("creates report entry for unknown component on the fly", () => {
    const reports = {};

    mergeFileResult(
      reports,
      {
        importMap: { Button: "Button" },
        instances: [{ component: "Button", props: [], line: 3 }],
      },
      "sanity",
      "src/Widget.tsx",
    );

    expect(reports.Button).toBeDefined();
    expect(reports.Button.totalImports).toBe(1);
    expect(reports.Button.totalInstances).toBe(1);
    expect(reports.Button.references).toEqual([
      { file: "src/Widget.tsx", line: 3, codebase: "sanity" },
    ]);
  });

  test("handles aliased imports — credits original component", () => {
    const reports = {
      Button: createEmptyReport("Button"),
    };

    mergeFileResult(
      reports,
      {
        importMap: { Btn: "Button" },
        instances: [
          {
            component: "Button",
            props: [{ name: "mode", value: "'ghost'" }],
            line: 7,
          },
        ],
      },
      "sanity",
      "src/Alias.tsx",
    );

    expect(reports.Button.totalImports).toBe(1);
    expect(reports.Button.totalInstances).toBe(1);
    expect(reports.Button.props.mode.totalUsages).toBe(1);
    expect(reports.Button.references).toEqual([
      { file: "src/Alias.tsx", line: 7, codebase: "sanity" },
    ]);
  });

  test("does not record references when filePath is omitted", () => {
    const reports = {
      Card: createEmptyReport("Card"),
    };

    mergeFileResult(
      reports,
      {
        importMap: { Card: "Card" },
        instances: [{ component: "Card", props: [], line: 3 }],
      },
      "sanity",
      // no filePath argument
    );

    expect(reports.Card.totalInstances).toBe(1);
    expect(reports.Card.references).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildComponentJson
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildComponentJson", () => {
  test("produces correct structure including references", () => {
    const report = createEmptyReport("Card");
    report.totalImports = 50;
    report.totalInstances = 120;
    report.codebaseImports = { sanity: 30, canvas: 15, huey: 5 };
    report.codebaseInstances = { sanity: 80, canvas: 30, huey: 10 };
    report.references = [
      { file: "src/A.tsx", line: 10, codebase: "sanity" },
      { file: "src/B.tsx", line: 20, codebase: "canvas" },
    ];

    recordProp(report, "padding", "4");
    recordProp(report, "padding", "4");
    recordProp(report, "padding", "2");
    recordProp(report, "tone", "'primary'");

    const json = buildComponentJson(report);

    expect(json.component).toBe("Card");
    expect(json.totalImports).toBe(50);
    expect(json.totalInstances).toBe(120);
    expect(json.codebaseImports).toEqual({ sanity: 30, canvas: 15, huey: 5 });
    expect(json.codebaseInstances).toEqual({
      sanity: 80,
      canvas: 30,
      huey: 10,
    });
    expect(json.uniqueProps).toBe(2);
    expect(json.avgPropsPerInstance).toBeCloseTo(4 / 120, 2);

    // References are included in the JSON output
    expect(json.references).toBeDefined();
    expect(json.references.length).toBe(2);
    expect(json.references[0]).toEqual({
      file: "src/A.tsx",
      line: 10,
      codebase: "sanity",
    });
  });

  test("sorts props by usage count descending", () => {
    const report = createEmptyReport("Button");
    report.totalInstances = 10;

    // mode used 5 times, onClick used 8 times, tone used 2 times
    for (let i = 0; i < 5; i++) recordProp(report, "mode", "'ghost'");
    for (let i = 0; i < 8; i++) recordProp(report, "onClick", "handleClick");
    for (let i = 0; i < 2; i++) recordProp(report, "tone", "'primary'");

    const json = buildComponentJson(report);
    const propKeys = Object.keys(json.props);

    expect(propKeys[0]).toBe("onClick");
    expect(propKeys[1]).toBe("mode");
    expect(propKeys[2]).toBe("tone");
  });

  test("sorts values within each prop by count descending", () => {
    const report = createEmptyReport("Card");
    report.totalInstances = 10;

    recordProp(report, "padding", "4");
    recordProp(report, "padding", "4");
    recordProp(report, "padding", "4");
    recordProp(report, "padding", "2");

    const json = buildComponentJson(report);

    // "4" was recorded 3 times, "2" was recorded 1 time
    expect(json.props.padding.values["4"]).toBe(3);
    expect(json.props.padding.values["2"]).toBe(1);
    expect(json.props.padding.totalUsages).toBe(4);
  });

  test("handles report with no props", () => {
    const report = createEmptyReport("Spinner");
    report.totalImports = 5;
    report.totalInstances = 8;

    const json = buildComponentJson(report);

    expect(json.uniqueProps).toBe(0);
    expect(json.avgPropsPerInstance).toBe(0);
    expect(json.props).toEqual({});
    expect(json.references).toEqual([]);
  });

  test("handles report with no instances", () => {
    const report = createEmptyReport("Breadcrumbs");
    report.totalImports = 3;
    report.totalInstances = 0;

    const json = buildComponentJson(report);

    expect(json.avgPropsPerInstance).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// generateSummaryCSV
// ═══════════════════════════════════════════════════════════════════════════════

describe("generateSummaryCSV", () => {
  test("produces valid CSV with header row", () => {
    const reports = {
      Button: createEmptyReport("Button"),
      Card: createEmptyReport("Card"),
    };
    reports.Button.totalInstances = 100;
    reports.Button.totalImports = 50;
    reports.Card.totalInstances = 80;
    reports.Card.totalImports = 40;

    const csv = generateSummaryCSV(reports);
    const lines = csv.trim().split("\n");

    expect(lines[0]).toContain("Component");
    expect(lines[0]).toContain("Total Imports");
    expect(lines[0]).toContain("Total Instances");
    expect(lines[0]).toContain("Unique Props");
    expect(lines[0]).toContain("Top 5 Props");
  });

  test("sorts by instances descending", () => {
    const reports = {
      Button: createEmptyReport("Button"),
      Card: createEmptyReport("Card"),
      Text: createEmptyReport("Text"),
    };
    reports.Button.totalInstances = 50;
    reports.Card.totalInstances = 200;
    reports.Text.totalInstances = 100;

    const csv = generateSummaryCSV(reports);
    const lines = csv.trim().split("\n").slice(1); // skip header

    expect(lines[0]).toContain('"Card"');
    expect(lines[1]).toContain('"Text"');
    expect(lines[2]).toContain('"Button"');
  });

  test("includes per-codebase columns", () => {
    const reports = {
      Button: createEmptyReport("Button"),
    };
    reports.Button.totalInstances = 10;
    reports.Button.codebaseImports = { sanity: 5, canvas: 3 };
    reports.Button.codebaseInstances = { sanity: 7, canvas: 3 };

    const csv = generateSummaryCSV(reports);

    expect(csv).toContain("sanity Imports");
    expect(csv).toContain("canvas Imports");
    expect(csv).toContain("sanity Instances");
    expect(csv).toContain("canvas Instances");
  });

  test("includes top 5 props", () => {
    const reports = {
      Button: createEmptyReport("Button"),
    };
    reports.Button.totalInstances = 10;
    recordProp(reports.Button, "mode", "'ghost'");
    recordProp(reports.Button, "onClick", "handleClick");
    recordProp(reports.Button, "tone", "'primary'");

    const csv = generateSummaryCSV(reports);

    expect(csv).toContain("mode");
    expect(csv).toContain("onClick");
    expect(csv).toContain("tone");
  });

  test("handles empty reports", () => {
    const csv = generateSummaryCSV({});
    const lines = csv.trim().split("\n");
    // Only header line
    expect(lines.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// generateSummaryJSON
// ═══════════════════════════════════════════════════════════════════════════════

describe("generateSummaryJSON", () => {
  test("produces valid JSON", () => {
    const reports = {
      Button: createEmptyReport("Button"),
    };
    reports.Button.totalInstances = 10;
    reports.Button.totalImports = 5;

    const json = generateSummaryJSON(reports);
    const parsed = JSON.parse(json);

    expect(parsed).toBeDefined();
    expect(parsed.generatedAt).toBeDefined();
  });

  test("contains correct totals", () => {
    const reports = {
      Button: createEmptyReport("Button"),
      Card: createEmptyReport("Card"),
    };
    reports.Button.totalInstances = 100;
    reports.Button.totalImports = 50;
    reports.Card.totalInstances = 200;
    reports.Card.totalImports = 80;

    const parsed = JSON.parse(generateSummaryJSON(reports));

    expect(parsed.totalComponents).toBe(2);
    expect(parsed.totalImports).toBe(130);
    expect(parsed.totalInstances).toBe(300);
  });

  test("sorts components by instances descending", () => {
    const reports = {
      Button: createEmptyReport("Button"),
      Card: createEmptyReport("Card"),
    };
    reports.Button.totalInstances = 50;
    reports.Card.totalInstances = 200;

    const parsed = JSON.parse(generateSummaryJSON(reports));

    expect(parsed.components[0].component).toBe("Card");
    expect(parsed.components[1].component).toBe("Button");
  });

  test("includes top props per component", () => {
    const reports = {
      Card: createEmptyReport("Card"),
    };
    reports.Card.totalInstances = 10;
    recordProp(reports.Card, "padding", "4");
    recordProp(reports.Card, "tone", "'primary'");

    const parsed = JSON.parse(generateSummaryJSON(reports));
    const card = parsed.components[0];

    expect(card.topProps.length).toBe(2);
    expect(card.topProps[0].name).toBeDefined();
    expect(card.topProps[0].usages).toBeDefined();
  });

  test("handles empty reports", () => {
    const parsed = JSON.parse(generateSummaryJSON({}));

    expect(parsed.totalComponents).toBe(0);
    expect(parsed.totalImports).toBe(0);
    expect(parsed.totalInstances).toBe(0);
    expect(parsed.components).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// generateSummaryText
// ═══════════════════════════════════════════════════════════════════════════════

describe("generateSummaryText", () => {
  test("produces a non-empty string", () => {
    const reports = {
      Button: createEmptyReport("Button"),
    };
    reports.Button.totalInstances = 10;
    reports.Button.totalImports = 5;

    const text = generateSummaryText(reports);

    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  test("includes title", () => {
    const text = generateSummaryText({
      Button: createEmptyReport("Button"),
    });

    expect(text).toContain(
      `PER-COMPONENT ${UI_LIBRARY_NAMES.toUpperCase()} ANALYSIS`,
    );
  });

  test("includes component name in ranked table", () => {
    const reports = {
      Button: createEmptyReport("Button"),
      Card: createEmptyReport("Card"),
    };
    reports.Button.totalInstances = 100;
    reports.Button.totalImports = 50;
    reports.Card.totalInstances = 200;
    reports.Card.totalImports = 80;

    const text = generateSummaryText(reports);

    expect(text).toContain("Button");
    expect(text).toContain("Card");
  });

  test("includes prop detail section for top components", () => {
    const reports = {
      Card: createEmptyReport("Card"),
    };
    reports.Card.totalInstances = 10;
    reports.Card.totalImports = 5;
    recordProp(reports.Card, "padding", "4");
    recordProp(reports.Card, "tone", "'primary'");

    const text = generateSummaryText(reports);

    expect(text).toContain("padding");
    expect(text).toContain("tone");
  });

  test("handles component with no props", () => {
    const reports = {
      Spinner: createEmptyReport("Spinner"),
    };
    reports.Spinner.totalInstances = 5;
    reports.Spinner.totalImports = 3;

    const text = generateSummaryText(reports);

    expect(text).toContain("Spinner");
    expect(text).toContain("(no props used)");
  });

  test("handles empty reports", () => {
    const text = generateSummaryText({});

    expect(text).toContain("Components analysed:   0");
    expect(text).toContain("Total imports:         0");
    expect(text).toContain("Total JSX instances:   0");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Integration tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Integration tests", () => {
  test("full pipeline: analyse → merge → generate reports", () => {
    const file1 = `
      import { Card, Text, Button } from '@sanity/ui'

      export function DocumentHeader({ title, onClose }) {
        return (
          <Card padding={4} tone="primary" border>
            <Text size={2}>{title}</Text>
            <Button mode="ghost" onClick={onClose}>Close</Button>
          </Card>
        )
      }
    `;

    const file2 = `
      import { Card, Text, Flex, Stack } from '@sanity/ui'

      export function DocumentBody({ fields }) {
        return (
          <Card padding={4}>
            <Flex align="center" gap={3}>
              <Stack space={2}>
                <Text size={1} muted>Field 1</Text>
                <Text size={1}>Field 2</Text>
              </Stack>
            </Flex>
          </Card>
        )
      }
    `;

    const reports = {};
    for (const comp of ["Card", "Text", "Button", "Flex", "Stack"]) {
      reports[comp] = createEmptyReport(comp);
    }

    mergeFileResult(
      reports,
      analyzeFileContent(file1),
      "sanity",
      "src/Header.tsx",
    );
    mergeFileResult(
      reports,
      analyzeFileContent(file2),
      "sanity",
      "src/Body.tsx",
    );

    // Card: imported in 2 files, 2 instances
    expect(reports.Card.totalImports).toBe(2);
    expect(reports.Card.totalInstances).toBe(2);

    // Text: imported in 2 files, 3 instances
    expect(reports.Text.totalImports).toBe(2);
    expect(reports.Text.totalInstances).toBe(3);

    // Button: imported in 1 file, 1 instance
    expect(reports.Button.totalImports).toBe(1);
    expect(reports.Button.totalInstances).toBe(1);

    // Flex: imported in 1 file, 1 instance
    expect(reports.Flex.totalImports).toBe(1);
    expect(reports.Flex.totalInstances).toBe(1);

    // Stack: imported in 1 file, 1 instance
    expect(reports.Stack.totalImports).toBe(1);
    expect(reports.Stack.totalInstances).toBe(1);

    // Card padding prop: used 2 times, values {4} both times (expression)
    expect(reports.Card.props.padding.totalUsages).toBe(2);
    expect(reports.Card.props.padding.values["4"]).toBe(2);

    // Card tone: used 1 time — tone="primary" is a string literal
    expect(reports.Card.props.tone.totalUsages).toBe(1);
    expect(reports.Card.props.tone.values['"primary"']).toBe(1);

    // Card border: used 1 time (boolean shorthand)
    expect(reports.Card.props.border.totalUsages).toBe(1);
    expect(reports.Card.props.border.values["true"]).toBe(1);

    // Text size prop: used 3 times — size={2} and size={1} (expressions)
    expect(reports.Text.props.size.totalUsages).toBe(3);
    expect(reports.Text.props.size.values["2"]).toBe(1);
    expect(reports.Text.props.size.values["1"]).toBe(2);

    // Text muted prop: used 1 time (boolean shorthand)
    expect(reports.Text.props.muted.totalUsages).toBe(1);

    // Card references come from both files
    expect(reports.Card.references.length).toBe(2);
    expect(reports.Card.references[0].file).toBe("src/Header.tsx");
    expect(reports.Card.references[1].file).toBe("src/Body.tsx");
    expect(reports.Card.references.every((r) => r.codebase === "sanity")).toBe(
      true,
    );
    // Every reference has a positive line number
    for (const ref of reports.Card.references) {
      expect(ref.line).toBeGreaterThan(0);
    }

    // Text references: 3 instances across 2 files
    expect(reports.Text.references.length).toBe(3);
    expect(reports.Text.references[0].file).toBe("src/Header.tsx");
    expect(reports.Text.references[1].file).toBe("src/Body.tsx");
    expect(reports.Text.references[2].file).toBe("src/Body.tsx");

    // Generate all three report formats without error
    const csv = generateSummaryCSV(reports);
    expect(csv).toContain('"Card"');
    expect(csv).toContain('"Text"');
    expect(csv).toContain('"Button"');

    const jsonStr = generateSummaryJSON(reports);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.totalComponents).toBe(5);
    expect(parsed.totalInstances).toBe(8);

    const text = generateSummaryText(reports);
    expect(text).toContain("Card");
    expect(text).toContain("padding");
    expect(text).toContain("tone");
  });

  test("handles realistic multi-codebase scenario", () => {
    const sanityFile = `
      import { Button, Card } from '@sanity/ui'

      export function Actions() {
        return (
          <Card padding={2}>
            <Button mode="ghost" tone="primary">Save</Button>
            <Button mode="bleed" tone="critical">Delete</Button>
          </Card>
        )
      }
    `;

    const canvasFile = `
      import { Button as Btn } from '@sanity/ui'

      export function CanvasButton() {
        return <Btn mode="default">Click</Btn>
      }
    `;

    const reports = {};
    for (const comp of ["Button", "Card"]) {
      reports[comp] = createEmptyReport(comp);
    }

    mergeFileResult(
      reports,
      analyzeFileContent(sanityFile),
      "sanity",
      "src/Actions.tsx",
    );
    mergeFileResult(
      reports,
      analyzeFileContent(canvasFile),
      "canvas",
      "src/CanvasButton.tsx",
    );

    // Button: imported in 2 files (1 sanity, 1 canvas), 3 total instances
    expect(reports.Button.totalImports).toBe(2);
    expect(reports.Button.totalInstances).toBe(3);
    expect(reports.Button.codebaseImports.sanity).toBe(1);
    expect(reports.Button.codebaseImports.canvas).toBe(1);
    expect(reports.Button.codebaseInstances.sanity).toBe(2);
    expect(reports.Button.codebaseInstances.canvas).toBe(1);

    // Button mode prop: used 3 times with 3 different string literal values
    expect(reports.Button.props.mode.totalUsages).toBe(3);
    expect(reports.Button.props.mode.values['"ghost"']).toBe(1);
    expect(reports.Button.props.mode.values['"bleed"']).toBe(1);
    expect(reports.Button.props.mode.values['"default"']).toBe(1);

    // Button tone prop: used 2 times (only in sanity file)
    expect(reports.Button.props.tone.totalUsages).toBe(2);

    // Card: only in sanity
    expect(reports.Card.totalImports).toBe(1);
    expect(reports.Card.totalInstances).toBe(1);
    expect(reports.Card.codebaseImports.canvas).toBeUndefined();

    // Build the individual component JSON
    const buttonJson = buildComponentJson(reports.Button);
    expect(buttonJson.component).toBe("Button");
    expect(buttonJson.totalInstances).toBe(3);
    expect(buttonJson.uniqueProps).toBe(2);
    expect(buttonJson.props.mode.totalUsages).toBe(3);
    // 3 distinct string values: "ghost", "bleed", "default"
    expect(Object.keys(buttonJson.props.mode.values).length).toBe(3);

    // References span both codebases
    expect(buttonJson.references.length).toBe(3);
    expect(
      buttonJson.references.filter((r) => r.codebase === "sanity").length,
    ).toBe(2);
    expect(
      buttonJson.references.filter((r) => r.codebase === "canvas").length,
    ).toBe(1);
    expect(buttonJson.references[2].file).toBe("src/CanvasButton.tsx");
    // All line numbers are positive
    for (const ref of buttonJson.references) {
      expect(ref.line).toBeGreaterThan(0);
    }
  });

  test("components imported but never used have 0 instances and no references", () => {
    const content = `
      import { Button, Card, Flex, Stack, Text, Grid, Inline } from '@sanity/ui'

      export function Minimal() {
        return <Button>Click</Button>
      }
    `;

    const reports = {};
    for (const comp of [
      "Button",
      "Card",
      "Flex",
      "Stack",
      "Text",
      "Grid",
      "Inline",
    ]) {
      reports[comp] = createEmptyReport(comp);
    }

    mergeFileResult(
      reports,
      analyzeFileContent(content),
      "sanity",
      "src/Minimal.tsx",
    );

    // All 7 are imported
    for (const comp of [
      "Button",
      "Card",
      "Flex",
      "Stack",
      "Text",
      "Grid",
      "Inline",
    ]) {
      expect(reports[comp].totalImports).toBe(1);
    }

    // Only Button has instances and references
    expect(reports.Button.totalInstances).toBe(1);
    expect(reports.Button.references.length).toBe(1);
    expect(reports.Button.references[0].file).toBe("src/Minimal.tsx");

    // The rest have 0 instances and no references
    for (const comp of ["Card", "Flex", "Stack", "Text", "Grid", "Inline"]) {
      expect(reports[comp].totalInstances).toBe(0);
      expect(reports[comp].references).toEqual([]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe("Edge cases", () => {
  test("handles component used many times in one file", () => {
    const lines = [
      'import { Text } from "@sanity/ui"',
      "function List() {",
      "  return (",
      "    <>",
    ];
    for (let i = 0; i < 50; i++) {
      lines.push(`      <Text size={${i % 5}}>Item ${i}</Text>`);
    }
    lines.push("    </>", "  )", "}");
    const content = lines.join("\n");

    const result = analyzeFileContent(content);
    expect(result.instances.length).toBe(50);
    expect(result.instances.every((i) => i.component === "Text")).toBe(true);
  });

  test("handles empty file content", () => {
    const result = analyzeFileContent("");
    expect(result.importMap).toEqual({});
    expect(result.instances).toEqual([]);
  });

  test("handles file with imports but no JSX at all", () => {
    const content = `
      import { Button, Card } from '@sanity/ui'
      export const components = { Button, Card }
    `;
    const result = analyzeFileContent(content);
    expect(Object.keys(result.importMap).length).toBe(2);
    expect(result.instances.length).toBe(0);
  });

  test("handles component with no props (empty tag body)", () => {
    const content = `
      import { Spinner } from '@sanity/ui'
      export function Loading() {
        return <Spinner />
      }
    `;
    const result = analyzeFileContent(content);
    expect(result.instances.length).toBe(1);
    expect(result.instances[0].props.length).toBe(0);
  });

  test("handles prop with complex nested expression", () => {
    const content = `
      import { Card } from '@sanity/ui'
      export function X() {
        return <Card style={{gridTemplateColumns: \`repeat(\${cols}, 1fr)\`}}>x</Card>
      }
    `;
    const result = analyzeFileContent(content);
    expect(result.instances.length).toBe(1);
    const styleProps = result.instances[0].props.filter(
      (p) => p.name === "style",
    );
    expect(styleProps.length).toBe(1);
  });

  test("parseProps handles prop names with $ prefix", () => {
    const result = parseProps(" $tone={tone}");
    expect(result).toEqual([{ name: "$tone", value: "tone" }]);
  });

  test("classifyValue handles empty string", () => {
    // Empty string from prop="" — technically valid JSX
    const result = classifyValue("");
    // Should not crash
    expect(typeof result).toBe("string");
  });

  test("normalizeValue handles very long strings", () => {
    const longString = "a".repeat(100);
    const result = normalizeValue(longString);
    // Strings longer than 30 chars are not kept as literal
    expect(result).not.toBe(`"${longString}"`);
  });

  test("report generation works for components with zero usage", () => {
    const reports = {};
    for (const comp of ["Button", "Card"]) {
      reports[comp] = createEmptyReport(comp);
    }
    // Don't merge any file results

    const csv = generateSummaryCSV(reports);
    // All counts are 0, still produces valid CSV
    expect(csv).toContain('"Button"');
    expect(csv).toContain(",0,");

    const json = JSON.parse(generateSummaryJSON(reports));
    expect(json.totalInstances).toBe(0);

    const text = generateSummaryText(reports);
    expect(text).toContain("Button");
  });
});
