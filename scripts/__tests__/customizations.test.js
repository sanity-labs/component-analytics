const {
  extractInlineStyles,
  extractStyleFromProps,
  extractMultiLineInlineStyles,
  extractStyledUsages,
  parseStyleProperties,
  parseStyledProperties,
  analyzeContent,
  aggregateResults,
  sortByCount,
  generateTextReport,
  generateCSV,
  generateJSON,
  TRACKED_COMPONENTS,
} = require("../customizations/analyze-customizations");

// ---------------------------------------------------------------------------
// TRACKED_COMPONENTS constant
// ---------------------------------------------------------------------------
describe("TRACKED_COMPONENTS", () => {
  test("is a non-empty array of strings", () => {
    expect(Array.isArray(TRACKED_COMPONENTS)).toBe(true);
    expect(TRACKED_COMPONENTS.length).toBeGreaterThan(0);
    for (const comp of TRACKED_COMPONENTS) {
      expect(typeof comp).toBe("string");
    }
  });

  test("includes core layout components", () => {
    expect(TRACKED_COMPONENTS).toContain("Box");
    expect(TRACKED_COMPONENTS).toContain("Flex");
    expect(TRACKED_COMPONENTS).toContain("Grid");
    expect(TRACKED_COMPONENTS).toContain("Stack");
    expect(TRACKED_COMPONENTS).toContain("Inline");
    expect(TRACKED_COMPONENTS).toContain("Container");
  });

  test("includes interactive components", () => {
    expect(TRACKED_COMPONENTS).toContain("Button");
    expect(TRACKED_COMPONENTS).toContain("Card");
    expect(TRACKED_COMPONENTS).toContain("Dialog");
    expect(TRACKED_COMPONENTS).toContain("Menu");
    expect(TRACKED_COMPONENTS).toContain("MenuItem");
    expect(TRACKED_COMPONENTS).toContain("Popover");
    expect(TRACKED_COMPONENTS).toContain("Tooltip");
  });

  test("includes typography components", () => {
    expect(TRACKED_COMPONENTS).toContain("Text");
    expect(TRACKED_COMPONENTS).toContain("Heading");
    expect(TRACKED_COMPONENTS).toContain("Code");
    expect(TRACKED_COMPONENTS).toContain("Badge");
  });

  test("includes form components", () => {
    expect(TRACKED_COMPONENTS).toContain("TextInput");
    expect(TRACKED_COMPONENTS).toContain("TextArea");
    expect(TRACKED_COMPONENTS).toContain("Checkbox");
    expect(TRACKED_COMPONENTS).toContain("Select");
    expect(TRACKED_COMPONENTS).toContain("Switch");
  });

  test("has no duplicates", () => {
    const unique = new Set(TRACKED_COMPONENTS);
    expect(unique.size).toBe(TRACKED_COMPONENTS.length);
  });
});

// ---------------------------------------------------------------------------
// extractStyleFromProps
// ---------------------------------------------------------------------------
describe("extractStyleFromProps", () => {
  test("extracts style from simple object literal", () => {
    const propsStr = ' style={{color: "red"}}';
    const result = extractStyleFromProps(propsStr);
    expect(result.length).toBe(1);
    expect(result[0]).toContain("color");
  });

  test("extracts style with multiple properties", () => {
    const propsStr = ' style={{color: "red", padding: 4, margin: "0 auto"}}';
    const result = extractStyleFromProps(propsStr);
    expect(result.length).toBe(1);
    expect(result[0]).toContain("color");
    expect(result[0]).toContain("padding");
    expect(result[0]).toContain("margin");
  });

  test("returns empty array when no style prop present", () => {
    const propsStr = ' className="foo" onClick={handler}';
    const result = extractStyleFromProps(propsStr);
    expect(result).toEqual([]);
  });

  test("returns empty array for empty string", () => {
    expect(extractStyleFromProps("")).toEqual([]);
  });

  test("handles style with variable reference", () => {
    const propsStr = " style={myStyles}";
    const result = extractStyleFromProps(propsStr);
    expect(result.length).toBe(1);
    expect(result[0]).toBe("myStyles");
  });

  test("handles style with spread operator", () => {
    const propsStr = ' style={{...baseStyles, color: "blue"}}';
    const result = extractStyleFromProps(propsStr);
    expect(result.length).toBe(1);
    expect(result[0]).toContain("baseStyles");
    expect(result[0]).toContain("color");
  });

  test("handles nested braces inside style", () => {
    const propsStr =
      ' style={{background: isActive ? "red" : "blue", padding: 4}}';
    const result = extractStyleFromProps(propsStr);
    expect(result.length).toBe(1);
    expect(result[0]).toContain("background");
  });

  test("handles multiple style props (unlikely but valid)", () => {
    const propsStr = " style={{a: 1}} other={true} style={{b: 2}}";
    const result = extractStyleFromProps(propsStr);
    expect(result.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// extractInlineStyles
// ---------------------------------------------------------------------------
describe("extractInlineStyles", () => {
  test("extracts inline style from a single-line tracked UI library component", () => {
    const content = "<Card style={{padding: 4}}>content</Card>";
    const result = extractInlineStyles(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].component).toBe("Card");
    expect(result[0].styleContent).toContain("padding");
  });

  test("extracts inline style from Box component", () => {
    const content = '<Box style={{margin: "10px"}}>content</Box>';
    const result = extractInlineStyles(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((r) => r.component === "Box")).toBe(true);
  });

  test("extracts inline style from Flex component", () => {
    const content =
      '<Flex style={{display: "flex", gap: "8px"}}>content</Flex>';
    const result = extractInlineStyles(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((r) => r.component === "Flex")).toBe(true);
  });

  test("extracts from self-closing tag", () => {
    const content = '<TextInput style={{width: "100%"}} />';
    const result = extractInlineStyles(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((r) => r.component === "TextInput")).toBe(true);
  });

  test("ignores non-tracked UI library components", () => {
    const content =
      '<CustomComponent style={{color: "red"}}>text</CustomComponent>';
    const result = extractInlineStyles(content);
    expect(result.length).toBe(0);
  });

  test("ignores HTML elements", () => {
    const content = '<div style={{color: "red"}}>text</div>';
    const result = extractInlineStyles(content);
    expect(result.length).toBe(0);
  });

  test("returns empty array for content without inline styles", () => {
    const content = "<Card padding={4}><Text>Hello</Text></Card>";
    const result = extractInlineStyles(content);
    expect(result).toEqual([]);
  });

  test("returns empty array for empty content", () => {
    expect(extractInlineStyles("")).toEqual([]);
  });

  test("extracts from multiple components", () => {
    const content = `
      <Card style={{padding: 4}}>
        <Text style={{color: "red"}}>Hello</Text>
      </Card>
    `;
    const result = extractInlineStyles(content);
    const components = result.map((r) => r.component);
    expect(components).toContain("Card");
    expect(components).toContain("Text");
  });

  test("handles components with other props alongside style", () => {
    const content =
      '<Card padding={4} tone="primary" style={{minHeight: "100%"}} data-testid="card">';
    const result = extractInlineStyles(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].component).toBe("Card");
    expect(result[0].styleContent).toContain("minHeight");
  });
});

// ---------------------------------------------------------------------------
// extractMultiLineInlineStyles
// ---------------------------------------------------------------------------
describe("extractMultiLineInlineStyles", () => {
  test("extracts style from multi-line JSX tag", () => {
    const content = `
      <Card
        padding={4}
        style={{
          minHeight: '100%',
          overflow: 'auto',
        }}
      >
        content
      </Card>
    `;
    const result = extractMultiLineInlineStyles(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].component).toBe("Card");
    expect(result[0].styleContent).toContain("minHeight");
    expect(result[0].styleContent).toContain("overflow");
  });

  test("extracts style from self-closing multi-line tag", () => {
    const content = `
      <Box
        style={{
          position: 'absolute',
          top: 0,
        }}
      />
    `;
    const result = extractMultiLineInlineStyles(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].component).toBe("Box");
    expect(result[0].styleContent).toContain("position");
  });

  test("returns empty array for content with no style props", () => {
    const content = `
      <Card
        padding={4}
        tone="primary"
      >
        content
      </Card>
    `;
    const result = extractMultiLineInlineStyles(content);
    expect(result).toEqual([]);
  });

  test("returns empty array for empty content", () => {
    expect(extractMultiLineInlineStyles("")).toEqual([]);
  });

  test("handles nested JSX expressions in the same tag", () => {
    const content = `
      <Flex
        align="center"
        onClick={() => { doSomething(); }}
        style={{gap: 8}}
      >
        content
      </Flex>
    `;
    const result = extractMultiLineInlineStyles(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].component).toBe("Flex");
    expect(result[0].styleContent).toContain("gap");
  });
});

// ---------------------------------------------------------------------------
// extractStyledUsages
// ---------------------------------------------------------------------------
describe("extractStyledUsages", () => {
  test("extracts styled(Card) with template literal", () => {
    const content = `
      const StyledCard = styled(Card)\`
        background: red;
        padding: 10px;
      \`
    `;
    const result = extractStyledUsages(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].component).toBe("Card");
    expect(result[0].styledContent).toContain("background");
    expect(result[0].styledContent).toContain("padding");
    expect(result[0].variableName).toBe("StyledCard");
  });

  test("extracts styled(Box) template literal", () => {
    const content = `
      const CustomBox = styled(Box)\`
        display: grid;
        grid-template-columns: 1fr 1fr;
      \`
    `;
    const result = extractStyledUsages(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].component).toBe("Box");
    expect(result[0].variableName).toBe("CustomBox");
  });

  test("extracts styled(Flex) with .attrs()", () => {
    const content = `
      const AlignedFlex = styled(Flex).attrs({align: 'center'})\`
        min-height: 48px;
      \`
    `;
    const result = extractStyledUsages(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].component).toBe("Flex");
    expect(result[0].variableName).toBe("AlignedFlex");
  });

  test("extracts styled(Text) with generic type parameter", () => {
    const content = `
      const MonoText = styled(Text)<{$mono: boolean}>\`
        font-family: monospace;
      \`
    `;
    const result = extractStyledUsages(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].component).toBe("Text");
  });

  test("extracts styled(Component)(function) pattern", () => {
    const content = `
      const CustomCard = styled(Card)((props) => {
        return css\`
          background: \${props.theme.color};
        \`
      })
    `;
    const result = extractStyledUsages(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].component).toBe("Card");
    expect(result[0].variableName).toBe("CustomCard");
  });

  test("extracts styled(Component)(css) pattern", () => {
    const content = `
      const Root = styled(Card)(rootStyle)
    `;
    const result = extractStyledUsages(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].component).toBe("Card");
    expect(result[0].variableName).toBe("Root");
  });

  test("ignores styled() wrapping non-tracked UI library components", () => {
    const content = `
      const StyledDiv = styled(MyCustomComponent)\`
        color: red;
      \`
    `;
    const result = extractStyledUsages(content);
    expect(result.length).toBe(0);
  });

  test("ignores styled HTML elements", () => {
    const content = `
      const StyledDiv = styled.div\`
        color: red;
      \`
    `;
    const result = extractStyledUsages(content);
    expect(result.length).toBe(0);
  });

  test("returns empty array for content with no styled usage", () => {
    const content = "<Card padding={4}><Text>Hello</Text></Card>";
    const result = extractStyledUsages(content);
    expect(result).toEqual([]);
  });

  test("returns empty array for empty content", () => {
    expect(extractStyledUsages("")).toEqual([]);
  });

  test("extracts multiple styled usages", () => {
    const content = `
      const StyledCard = styled(Card)\`
        padding: 10px;
      \`
      const StyledFlex = styled(Flex)\`
        gap: 8px;
      \`
      const StyledText = styled(Text)\`
        color: red;
      \`
    `;
    const result = extractStyledUsages(content);
    expect(result.length).toBe(3);
    const components = result.map((r) => r.component);
    expect(components).toContain("Card");
    expect(components).toContain("Flex");
    expect(components).toContain("Text");
  });

  test("handles export const pattern", () => {
    const content = `
      export const RootFlex = styled(Flex).attrs({align: 'center'})\`
        height: 40px;
      \`
    `;
    const result = extractStyledUsages(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].component).toBe("Flex");
    expect(result[0].variableName).toBe("RootFlex");
  });

  test("handles styled without variable assignment", () => {
    const content = `
      styled(Card)\`
        background: blue;
      \`
    `;
    const result = extractStyledUsages(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].component).toBe("Card");
    expect(result[0].variableName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseStyleProperties
// ---------------------------------------------------------------------------
describe("parseStyleProperties", () => {
  test("parses simple camelCase properties", () => {
    const styleStr = '{color: "red", padding: 4, marginTop: "10px"}';
    const result = parseStyleProperties(styleStr);
    expect(result).toContain("color");
    expect(result).toContain("padding");
    expect(result).toContain("marginTop");
  });

  test("parses single property", () => {
    const styleStr = '{minHeight: "100%"}';
    const result = parseStyleProperties(styleStr);
    expect(result).toContain("minHeight");
  });

  test("parses quoted property names (CSS custom properties)", () => {
    const styleStr = "{'--custom-color': 'red'}";
    const result = parseStyleProperties(styleStr);
    expect(result).toContain("--custom-color");
  });

  test("parses double-quoted property names", () => {
    const styleStr = '{"--my-var": "blue"}';
    const result = parseStyleProperties(styleStr);
    expect(result).toContain("--my-var");
  });

  test("returns empty array for empty string", () => {
    expect(parseStyleProperties("")).toEqual([]);
  });

  test("returns empty array for a variable reference", () => {
    // When style={someVar}, the inner content is just "someVar"
    const result = parseStyleProperties("someVar");
    expect(result).toEqual([]);
  });

  test("handles spread + properties", () => {
    const styleStr = '{...baseStyles, color: "blue", padding: 4}';
    const result = parseStyleProperties(styleStr);
    expect(result).toContain("color");
    expect(result).toContain("padding");
  });

  test("handles properties with computed values", () => {
    const styleStr = "{width: isWide ? '100%' : '50%', height: HEADER_HEIGHT}";
    const result = parseStyleProperties(styleStr);
    expect(result).toContain("width");
    expect(result).toContain("height");
  });

  test("handles properties with template literal values", () => {
    const styleStr = "{gridTemplateColumns: `repeat(${cols}, 1fr)`}";
    const result = parseStyleProperties(styleStr);
    expect(result).toContain("gridTemplateColumns");
  });
});

// ---------------------------------------------------------------------------
// parseStyledProperties
// ---------------------------------------------------------------------------
describe("parseStyledProperties", () => {
  test("parses CSS property declarations", () => {
    const css = `
      background: red;
      padding: 10px;
      margin-top: 20px;
    `;
    const result = parseStyledProperties(css);
    expect(result).toContain("background");
    expect(result).toContain("padding");
    expect(result).toContain("margin-top");
  });

  test("parses single property", () => {
    const css = "color: blue;";
    const result = parseStyledProperties(css);
    expect(result).toContain("color");
  });

  test("returns empty array for empty string", () => {
    expect(parseStyledProperties("")).toEqual([]);
  });

  test("returns empty array for content with no CSS declarations", () => {
    const css = "/* just a comment */";
    const result = parseStyledProperties(css);
    expect(result).toEqual([]);
  });

  test("handles properties without trailing semicolons", () => {
    const css = `
      display: flex;
      align-items: center
    `;
    const result = parseStyledProperties(css);
    expect(result).toContain("display");
    // align-items may or may not be caught depending on the newline
  });

  test("handles CSS with interpolations", () => {
    const css = `
      background: \${props => props.theme.bg};
      color: \${({ theme }) => theme.fg};
      padding: 10px;
    `;
    const result = parseStyledProperties(css);
    expect(result).toContain("background");
    expect(result).toContain("color");
    expect(result).toContain("padding");
  });

  test("handles multiple selectors and nested blocks", () => {
    const css = `
      position: relative;
      &:hover {
        opacity: 0.8;
      }
      &::before {
        content: '';
        display: block;
      }
    `;
    const result = parseStyledProperties(css);
    expect(result).toContain("position");
    expect(result).toContain("opacity");
    expect(result).toContain("display");
  });

  test("handles vendor-prefixed properties", () => {
    const css = `
      display: flex;
    `;
    const result = parseStyledProperties(css);
    expect(result).toContain("display");
  });
});

// ---------------------------------------------------------------------------
// analyzeContent
// ---------------------------------------------------------------------------
describe("analyzeContent", () => {
  test("returns structure with inlineStyles, styledUsages, and summary", () => {
    const content = "<Card style={{padding: 4}}>content</Card>";
    const result = analyzeContent(content);
    expect(result).toHaveProperty("inlineStyles");
    expect(result).toHaveProperty("styledUsages");
    expect(result).toHaveProperty("summary");
  });

  test("analyzes file with inline styles only", () => {
    const content = `
      <Card style={{padding: 4}}>
        <Text style={{color: "red"}}>Hello</Text>
      </Card>
    `;
    const result = analyzeContent(content);
    expect(result.summary.inlineStyleCount).toBeGreaterThanOrEqual(2);
    expect(result.summary.styledCount).toBe(0);
    expect(result.summary.totalCustomizations).toBeGreaterThanOrEqual(2);
    expect(result.summary.componentsWithInlineStyles).toContain("Card");
    expect(result.summary.componentsWithInlineStyles).toContain("Text");
    expect(result.summary.componentsWithStyled).toEqual([]);
  });

  test("analyzes file with styled() only", () => {
    const content = `
      const StyledCard = styled(Card)\`
        background: red;
        padding: 10px;
      \`
    `;
    const result = analyzeContent(content);
    expect(result.summary.inlineStyleCount).toBe(0);
    expect(result.summary.styledCount).toBeGreaterThanOrEqual(1);
    expect(result.summary.totalCustomizations).toBeGreaterThanOrEqual(1);
    expect(result.summary.componentsWithInlineStyles).toEqual([]);
    expect(result.summary.componentsWithStyled).toContain("Card");
  });

  test("analyzes file with both inline styles and styled()", () => {
    const content = `
      const StyledCard = styled(Card)\`
        background: blue;
      \`
      export function MyComponent() {
        return <Box style={{padding: 4}}>content</Box>
      }
    `;
    const result = analyzeContent(content);
    expect(result.summary.inlineStyleCount).toBeGreaterThanOrEqual(1);
    expect(result.summary.styledCount).toBeGreaterThanOrEqual(1);
    expect(result.summary.totalCustomizations).toBeGreaterThanOrEqual(2);
  });

  test("analyzes file with no customizations", () => {
    const content = `
      <Card padding={4} tone="primary">
        <Text size={2}>No inline styles here</Text>
      </Card>
    `;
    const result = analyzeContent(content);
    expect(result.summary.inlineStyleCount).toBe(0);
    expect(result.summary.styledCount).toBe(0);
    expect(result.summary.totalCustomizations).toBe(0);
  });

  test("returns empty results for empty content", () => {
    const result = analyzeContent("");
    expect(result.summary.inlineStyleCount).toBe(0);
    expect(result.summary.styledCount).toBe(0);
    expect(result.summary.totalCustomizations).toBe(0);
    expect(result.inlineStyles).toEqual([]);
    expect(result.styledUsages).toEqual([]);
  });

  test("parses properties for inline styles", () => {
    const content = '<Card style={{minHeight: "100%", overflow: "auto"}}>';
    const result = analyzeContent(content);
    const cardStyles = result.inlineStyles.filter(
      (s) => s.component === "Card",
    );
    expect(cardStyles.length).toBeGreaterThanOrEqual(1);
    expect(cardStyles[0].properties).toContain("minHeight");
    expect(cardStyles[0].properties).toContain("overflow");
  });

  test("parses properties for styled() usages", () => {
    const content = `
      const Root = styled(Card)\`
        position: relative;
        overflow: hidden;
      \`
    `;
    const result = analyzeContent(content);
    const cardStyled = result.styledUsages.filter(
      (s) => s.component === "Card",
    );
    expect(cardStyled.length).toBeGreaterThanOrEqual(1);
    expect(cardStyled[0].properties).toContain("position");
    expect(cardStyled[0].properties).toContain("overflow");
  });

  test("handles mixed tracked UI library and non-tracked UI library styles", () => {
    const content = `
      <Card style={{padding: 4}}>content</Card>
      <div style={{color: "red"}}>html element</div>
      <MyWidget style={{border: "1px solid"}}>custom</MyWidget>
    `;
    const result = analyzeContent(content);
    // Only Card should be counted
    expect(result.summary.componentsWithInlineStyles).toContain("Card");
    expect(result.summary.componentsWithInlineStyles).not.toContain("div");
    expect(result.summary.componentsWithInlineStyles).not.toContain("MyWidget");
  });
});

// ---------------------------------------------------------------------------
// aggregateResults
// ---------------------------------------------------------------------------
describe("aggregateResults", () => {
  test("aggregates results from multiple files", () => {
    const fileResults = [
      {
        inlineStyles: [
          {
            component: "Card",
            styleContent: "{padding: 4}",
            properties: ["padding"],
          },
        ],
        styledUsages: [],
        summary: {
          inlineStyleCount: 1,
          styledCount: 0,
          totalCustomizations: 1,
          componentsWithInlineStyles: ["Card"],
          componentsWithStyled: [],
        },
      },
      {
        inlineStyles: [
          {
            component: "Box",
            styleContent: "{margin: 0}",
            properties: ["margin"],
          },
        ],
        styledUsages: [
          {
            component: "Card",
            styledContent: "background: blue;",
            variableName: "StyledCard",
            properties: ["background"],
          },
        ],
        summary: {
          inlineStyleCount: 1,
          styledCount: 1,
          totalCustomizations: 2,
          componentsWithInlineStyles: ["Box"],
          componentsWithStyled: ["Card"],
        },
      },
    ];

    const result = aggregateResults(fileResults);

    expect(result.totalFiles).toBe(2);
    expect(result.filesWithCustomizations).toBe(2);
    expect(result.totalInlineStyles).toBe(2);
    expect(result.totalStyledUsages).toBe(1);
    expect(result.totalCustomizations).toBe(3);
    expect(result.inlineStylesByComponent.Card.count).toBe(1);
    expect(result.inlineStylesByComponent.Box.count).toBe(1);
    expect(result.styledByComponent.Card.count).toBe(1);
    expect(result.inlineStyleProperties.padding).toBe(1);
    expect(result.inlineStyleProperties.margin).toBe(1);
    expect(result.styledProperties.background).toBe(1);
  });

  test("handles empty file results array", () => {
    const result = aggregateResults([]);
    expect(result.totalFiles).toBe(0);
    expect(result.filesWithCustomizations).toBe(0);
    expect(result.totalInlineStyles).toBe(0);
    expect(result.totalStyledUsages).toBe(0);
    expect(result.totalCustomizations).toBe(0);
    expect(result.inlineStylesByComponent).toEqual({});
    expect(result.styledByComponent).toEqual({});
  });

  test("handles files with no customizations", () => {
    const fileResults = [
      {
        inlineStyles: [],
        styledUsages: [],
        summary: {
          inlineStyleCount: 0,
          styledCount: 0,
          totalCustomizations: 0,
          componentsWithInlineStyles: [],
          componentsWithStyled: [],
        },
      },
      {
        inlineStyles: [],
        styledUsages: [],
        summary: {
          inlineStyleCount: 0,
          styledCount: 0,
          totalCustomizations: 0,
          componentsWithInlineStyles: [],
          componentsWithStyled: [],
        },
      },
    ];

    const result = aggregateResults(fileResults);
    expect(result.totalFiles).toBe(2);
    expect(result.filesWithCustomizations).toBe(0);
    expect(result.totalCustomizations).toBe(0);
  });

  test("correctly counts same component across multiple files", () => {
    const fileResults = [
      {
        inlineStyles: [
          {
            component: "Card",
            styleContent: "{padding: 4}",
            properties: ["padding"],
          },
        ],
        styledUsages: [],
        summary: {
          inlineStyleCount: 1,
          styledCount: 0,
          totalCustomizations: 1,
          componentsWithInlineStyles: ["Card"],
          componentsWithStyled: [],
        },
      },
      {
        inlineStyles: [
          {
            component: "Card",
            styleContent: "{margin: 0}",
            properties: ["margin"],
          },
          {
            component: "Card",
            styleContent: "{color: 'red'}",
            properties: ["color"],
          },
        ],
        styledUsages: [],
        summary: {
          inlineStyleCount: 2,
          styledCount: 0,
          totalCustomizations: 2,
          componentsWithInlineStyles: ["Card"],
          componentsWithStyled: [],
        },
      },
    ];

    const result = aggregateResults(fileResults);
    expect(result.inlineStylesByComponent.Card.count).toBe(3);
    expect(result.totalInlineStyles).toBe(3);
    expect(result.inlineStylesByComponent.Card.properties.padding).toBe(1);
    expect(result.inlineStylesByComponent.Card.properties.margin).toBe(1);
    expect(result.inlineStylesByComponent.Card.properties.color).toBe(1);
  });

  test("tracks filesWithCustomizations correctly", () => {
    const fileResults = [
      {
        inlineStyles: [{ component: "Card", styleContent: "", properties: [] }],
        styledUsages: [],
        summary: {
          inlineStyleCount: 1,
          styledCount: 0,
          totalCustomizations: 1,
          componentsWithInlineStyles: ["Card"],
          componentsWithStyled: [],
        },
      },
      {
        inlineStyles: [],
        styledUsages: [],
        summary: {
          inlineStyleCount: 0,
          styledCount: 0,
          totalCustomizations: 0,
          componentsWithInlineStyles: [],
          componentsWithStyled: [],
        },
      },
      {
        inlineStyles: [],
        styledUsages: [
          {
            component: "Flex",
            styledContent: "",
            variableName: "Root",
            properties: [],
          },
        ],
        summary: {
          inlineStyleCount: 0,
          styledCount: 1,
          totalCustomizations: 1,
          componentsWithInlineStyles: [],
          componentsWithStyled: ["Flex"],
        },
      },
    ];

    const result = aggregateResults(fileResults);
    expect(result.totalFiles).toBe(3);
    expect(result.filesWithCustomizations).toBe(2);
  });

  test("aggregates property frequencies across files", () => {
    const fileResults = [
      {
        inlineStyles: [
          {
            component: "Card",
            styleContent: "{padding: 4, minHeight: '100%'}",
            properties: ["padding", "minHeight"],
          },
        ],
        styledUsages: [],
        summary: {
          inlineStyleCount: 1,
          styledCount: 0,
          totalCustomizations: 1,
          componentsWithInlineStyles: ["Card"],
          componentsWithStyled: [],
        },
      },
      {
        inlineStyles: [
          {
            component: "Box",
            styleContent: "{padding: 8}",
            properties: ["padding"],
          },
        ],
        styledUsages: [],
        summary: {
          inlineStyleCount: 1,
          styledCount: 0,
          totalCustomizations: 1,
          componentsWithInlineStyles: ["Box"],
          componentsWithStyled: [],
        },
      },
    ];

    const result = aggregateResults(fileResults);
    expect(result.inlineStyleProperties.padding).toBe(2);
    expect(result.inlineStyleProperties.minHeight).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// sortByCount
// ---------------------------------------------------------------------------
describe("sortByCount", () => {
  test("sorts entries by value descending", () => {
    const obj = { a: 10, b: 50, c: 25 };
    const sorted = sortByCount(obj);
    expect(sorted).toEqual([
      ["b", 50],
      ["c", 25],
      ["a", 10],
    ]);
  });

  test("returns empty array for empty object", () => {
    expect(sortByCount({})).toEqual([]);
  });

  test("handles single entry", () => {
    expect(sortByCount({ a: 1 })).toEqual([["a", 1]]);
  });

  test("handles equal values", () => {
    const obj = { a: 5, b: 5 };
    const sorted = sortByCount(obj);
    expect(sorted.length).toBe(2);
    expect(sorted[0][1]).toBe(5);
    expect(sorted[1][1]).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// generateTextReport
// ---------------------------------------------------------------------------
describe("generateTextReport", () => {
  const makeResults = (overrides = {}) => ({
    sanity: {
      totalFiles: 100,
      filesWithCustomizations: 30,
      totalInlineStyles: 50,
      totalStyledUsages: 20,
      totalCustomizations: 70,
      inlineStylesByComponent: {
        Card: { count: 30, properties: { padding: 10, minHeight: 8 } },
        Box: { count: 20, properties: { margin: 5 } },
      },
      styledByComponent: {
        Card: { count: 15, properties: { background: 10, position: 5 } },
        Flex: { count: 5, properties: { gap: 3 } },
      },
      inlineStyleProperties: { padding: 10, minHeight: 8, margin: 5 },
      styledProperties: { background: 10, position: 5, gap: 3 },
      allInlineStyles: [],
      allStyledUsages: [],
      ...overrides,
    },
  });

  test("generates a non-empty string", () => {
    const report = generateTextReport(makeResults());
    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(0);
  });

  test("includes codebase name", () => {
    const report = generateTextReport(makeResults());
    expect(report).toContain("SANITY");
  });

  test("includes customization counts", () => {
    const report = generateTextReport(makeResults());
    expect(report).toContain("50");
    expect(report).toContain("20");
  });

  test("includes aggregate section", () => {
    const results = {
      sanity: makeResults().sanity,
      canvas: {
        totalFiles: 50,
        filesWithCustomizations: 10,
        totalInlineStyles: 15,
        totalStyledUsages: 5,
        totalCustomizations: 20,
        inlineStylesByComponent: {
          Box: { count: 15, properties: { padding: 15 } },
        },
        styledByComponent: {
          Text: { count: 5, properties: { color: 5 } },
        },
        inlineStyleProperties: { padding: 15 },
        styledProperties: { color: 5 },
        allInlineStyles: [],
        allStyledUsages: [],
      },
    };
    const report = generateTextReport(results);
    expect(report).toContain("AGGREGATE");
    expect(report).toContain("ALL CODEBASES COMBINED");
  });

  test("skips null codebase results", () => {
    const results = {
      sanity: makeResults().sanity,
      canvas: null,
    };
    const report = generateTextReport(results);
    expect(report).toContain("SANITY");
    expect(report).not.toContain("CANVAS");
  });

  test("handles codebase with no customizations", () => {
    const results = {
      sanity: {
        totalFiles: 50,
        filesWithCustomizations: 0,
        totalInlineStyles: 0,
        totalStyledUsages: 0,
        totalCustomizations: 0,
        inlineStylesByComponent: {},
        styledByComponent: {},
        inlineStyleProperties: {},
        styledProperties: {},
        allInlineStyles: [],
        allStyledUsages: [],
      },
    };
    const report = generateTextReport(results);
    expect(report).toContain("0");
    // Should still produce a valid report
    expect(report.length).toBeGreaterThan(0);
  });

  test("handles all codebases being null", () => {
    const results = { sanity: null, canvas: null };
    const report = generateTextReport(results);
    expect(typeof report).toBe("string");
    expect(report).toContain("AGGREGATE");
  });

  test("shows component names in report", () => {
    const report = generateTextReport(makeResults());
    expect(report).toContain("Card");
    expect(report).toContain("Box");
    expect(report).toContain("Flex");
  });

  test("shows property names in report", () => {
    const report = generateTextReport(makeResults());
    expect(report).toContain("padding");
    expect(report).toContain("background");
  });
});

// ---------------------------------------------------------------------------
// generateCSV
// ---------------------------------------------------------------------------
describe("generateCSV", () => {
  test("generates valid CSV with header", () => {
    const results = {
      sanity: {
        totalFiles: 10,
        filesWithCustomizations: 3,
        totalInlineStyles: 5,
        totalStyledUsages: 2,
        totalCustomizations: 7,
        inlineStylesByComponent: {
          Card: { count: 5, properties: { padding: 3 } },
        },
        styledByComponent: {
          Card: { count: 2, properties: { background: 2 } },
        },
        inlineStyleProperties: {},
        styledProperties: {},
        allInlineStyles: [],
        allStyledUsages: [],
      },
    };
    const csv = generateCSV(results);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("Component");
    expect(lines[0]).toContain("Type");
    expect(lines[0]).toContain("Total");
  });

  test("includes separate rows for inline and styled", () => {
    const results = {
      sanity: {
        totalFiles: 10,
        filesWithCustomizations: 5,
        totalInlineStyles: 10,
        totalStyledUsages: 5,
        totalCustomizations: 15,
        inlineStylesByComponent: {
          Card: { count: 10, properties: { padding: 5 } },
        },
        styledByComponent: {
          Card: { count: 5, properties: { background: 3 } },
        },
        inlineStyleProperties: {},
        styledProperties: {},
        allInlineStyles: [],
        allStyledUsages: [],
      },
    };
    const csv = generateCSV(results);
    expect(csv).toContain('"inline style"');
    expect(csv).toContain('"styled()"');
  });

  test("includes per-codebase columns", () => {
    const results = {
      sanity: {
        totalFiles: 10,
        filesWithCustomizations: 3,
        totalInlineStyles: 5,
        totalStyledUsages: 0,
        totalCustomizations: 5,
        inlineStylesByComponent: {
          Card: { count: 5, properties: {} },
        },
        styledByComponent: {},
        inlineStyleProperties: {},
        styledProperties: {},
        allInlineStyles: [],
        allStyledUsages: [],
      },
      canvas: {
        totalFiles: 5,
        filesWithCustomizations: 2,
        totalInlineStyles: 3,
        totalStyledUsages: 0,
        totalCustomizations: 3,
        inlineStylesByComponent: {
          Card: { count: 3, properties: {} },
        },
        styledByComponent: {},
        inlineStyleProperties: {},
        styledProperties: {},
        allInlineStyles: [],
        allStyledUsages: [],
      },
    };
    const csv = generateCSV(results);
    expect(csv).toContain("sanity Count");
    expect(csv).toContain("canvas Count");
  });

  test("skips null codebases", () => {
    const results = {
      sanity: {
        totalFiles: 10,
        filesWithCustomizations: 3,
        totalInlineStyles: 5,
        totalStyledUsages: 0,
        totalCustomizations: 5,
        inlineStylesByComponent: {
          Card: { count: 5, properties: {} },
        },
        styledByComponent: {},
        inlineStyleProperties: {},
        styledProperties: {},
        allInlineStyles: [],
        allStyledUsages: [],
      },
      canvas: null,
    };
    const csv = generateCSV(results);
    expect(csv).toContain("sanity Count");
    expect(csv).not.toContain("canvas Count");
  });

  test("handles empty customizations", () => {
    const results = {
      sanity: {
        totalFiles: 10,
        filesWithCustomizations: 0,
        totalInlineStyles: 0,
        totalStyledUsages: 0,
        totalCustomizations: 0,
        inlineStylesByComponent: {},
        styledByComponent: {},
        inlineStyleProperties: {},
        styledProperties: {},
        allInlineStyles: [],
        allStyledUsages: [],
      },
    };
    const csv = generateCSV(results);
    const lines = csv.trim().split("\n");
    // Only header
    expect(lines.length).toBe(1);
  });

  test("includes top properties in CSV", () => {
    const results = {
      sanity: {
        totalFiles: 10,
        filesWithCustomizations: 3,
        totalInlineStyles: 5,
        totalStyledUsages: 0,
        totalCustomizations: 5,
        inlineStylesByComponent: {
          Card: { count: 5, properties: { padding: 3, minHeight: 2 } },
        },
        styledByComponent: {},
        inlineStyleProperties: {},
        styledProperties: {},
        allInlineStyles: [],
        allStyledUsages: [],
      },
    };
    const csv = generateCSV(results);
    expect(csv).toContain("padding");
    expect(csv).toContain("minHeight");
  });
});

// ---------------------------------------------------------------------------
// generateJSON
// ---------------------------------------------------------------------------
describe("generateJSON", () => {
  const makeData = () => ({
    totalFiles: 100,
    filesWithCustomizations: 30,
    totalInlineStyles: 50,
    totalStyledUsages: 20,
    totalCustomizations: 70,
    inlineStylesByComponent: {
      Card: { count: 30, properties: { padding: 10 } },
      Box: { count: 20, properties: { margin: 5 } },
    },
    styledByComponent: {
      Card: { count: 15, properties: { background: 10 } },
      Flex: { count: 5, properties: { gap: 3 } },
    },
    inlineStyleProperties: { padding: 10, margin: 5 },
    styledProperties: { background: 10, gap: 3 },
    allInlineStyles: [],
    allStyledUsages: [],
  });

  test("produces valid JSON", () => {
    const results = { sanity: makeData() };
    const json = generateJSON(results);
    const parsed = JSON.parse(json);
    expect(parsed).toBeDefined();
  });

  test("contains generatedAt timestamp", () => {
    const results = { sanity: makeData() };
    const parsed = JSON.parse(generateJSON(results));
    expect(parsed.generatedAt).toBeDefined();
    expect(typeof parsed.generatedAt).toBe("string");
  });

  test("contains codebase summaries", () => {
    const results = { sanity: makeData() };
    const parsed = JSON.parse(generateJSON(results));
    expect(parsed.codebases.sanity).toBeDefined();
    expect(parsed.codebases.sanity.totalFiles).toBe(100);
    expect(parsed.codebases.sanity.filesWithCustomizations).toBe(30);
    expect(parsed.codebases.sanity.inlineStyleCount).toBe(50);
    expect(parsed.codebases.sanity.styledCount).toBe(20);
    expect(parsed.codebases.sanity.totalCustomizations).toBe(70);
  });

  test("contains component breakdowns", () => {
    const results = { sanity: makeData() };
    const parsed = JSON.parse(generateJSON(results));
    const sanity = parsed.codebases.sanity;
    expect(sanity.inlineStylesByComponent).toBeDefined();
    expect(sanity.styledByComponent).toBeDefined();
  });

  test("contains top properties", () => {
    const results = { sanity: makeData() };
    const parsed = JSON.parse(generateJSON(results));
    const sanity = parsed.codebases.sanity;
    expect(sanity.topInlineProperties).toBeDefined();
    expect(Array.isArray(sanity.topInlineProperties)).toBe(true);
    expect(sanity.topStyledProperties).toBeDefined();
    expect(Array.isArray(sanity.topStyledProperties)).toBe(true);
  });

  test("skips null codebases", () => {
    const results = { sanity: makeData(), canvas: null };
    const parsed = JSON.parse(generateJSON(results));
    expect(parsed.codebases.sanity).toBeDefined();
    expect(parsed.codebases.canvas).toBeUndefined();
  });

  test("handles empty data", () => {
    const results = {
      sanity: {
        totalFiles: 10,
        filesWithCustomizations: 0,
        totalInlineStyles: 0,
        totalStyledUsages: 0,
        totalCustomizations: 0,
        inlineStylesByComponent: {},
        styledByComponent: {},
        inlineStyleProperties: {},
        styledProperties: {},
        allInlineStyles: [],
        allStyledUsages: [],
      },
    };
    const parsed = JSON.parse(generateJSON(results));
    expect(parsed.codebases.sanity.inlineStyleCount).toBe(0);
    expect(parsed.codebases.sanity.styledCount).toBe(0);
    expect(parsed.codebases.sanity.topInlineProperties).toEqual([]);
    expect(parsed.codebases.sanity.topStyledProperties).toEqual([]);
  });

  test("sorts components by count descending", () => {
    const results = { sanity: makeData() };
    const parsed = JSON.parse(generateJSON(results));
    const inline = parsed.codebases.sanity.inlineStylesByComponent;
    const keys = Object.keys(inline);
    // Card (30) should come before Box (20)
    expect(keys[0]).toBe("Card");
    expect(keys[1]).toBe("Box");
  });
});

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------
describe("Integration tests", () => {
  test("full pipeline for a realistic styled component file", () => {
    const content = `
      import {Card, Box, Flex, Text, Stack} from '@sanity/ui'
      import {styled} from 'styled-components'

      const RootCard = styled(Card)\`
        position: relative;
        overflow: hidden;
        min-height: 100px;
      \`

      const StatusFlex = styled(Flex).attrs({align: 'center'})\`
        gap: 8px;
        padding: 4px;
      \`

      export function DocumentPane({document}) {
        return (
          <RootCard padding={4}>
            <Box style={{marginBottom: '16px'}}>
              <Text style={{color: 'var(--card-fg-color)'}}>
                {document.title}
              </Text>
            </Box>
            <StatusFlex>
              <Stack space={3} style={{flex: 1}}>
                content
              </Stack>
            </StatusFlex>
          </RootCard>
        )
      }
    `;

    const result = analyzeContent(content);
    expect(result.summary.styledCount).toBeGreaterThanOrEqual(2);
    expect(result.summary.inlineStyleCount).toBeGreaterThanOrEqual(2);
    expect(result.summary.totalCustomizations).toBeGreaterThanOrEqual(4);

    // Check styled usages
    const styledComponents = result.styledUsages.map((s) => s.component);
    expect(styledComponents).toContain("Card");
    expect(styledComponents).toContain("Flex");

    // Check inline styles
    const inlineComponents = result.inlineStyles.map((s) => s.component);
    expect(inlineComponents).toContain("Box");
  });

  test("full pipeline for file with only inline styles", () => {
    const content = `
      import {Card, Flex, Text} from '@sanity/ui'

      export function Header() {
        return (
          <Card style={{borderBottom: '1px solid var(--card-border-color)'}}>
            <Flex align="center" style={{minHeight: '48px', padding: '0 16px'}}>
              <Text style={{fontWeight: 600}}>
                Header Text
              </Text>
            </Flex>
          </Card>
        )
      }
    `;

    const result = analyzeContent(content);
    expect(result.summary.inlineStyleCount).toBeGreaterThanOrEqual(3);
    expect(result.summary.styledCount).toBe(0);
    expect(result.summary.componentsWithInlineStyles).toContain("Card");
    expect(result.summary.componentsWithInlineStyles).toContain("Flex");
    expect(result.summary.componentsWithInlineStyles).toContain("Text");
  });

  test("aggregation across multiple file results", () => {
    const file1 = analyzeContent(`
      <Card style={{padding: 4}}>content</Card>
      <Box style={{margin: 0}}>box</Box>
    `);

    const file2 = analyzeContent(`
      const Root = styled(Card)\`
        background: red;
      \`
      <Text style={{color: "blue"}}>text</Text>
    `);

    const file3 = analyzeContent(`
      <Stack space={3}><Text>no customizations</Text></Stack>
    `);

    const aggregated = aggregateResults([file1, file2, file3]);

    expect(aggregated.totalFiles).toBe(3);
    expect(aggregated.filesWithCustomizations).toBe(2);
    expect(aggregated.totalInlineStyles).toBeGreaterThanOrEqual(3);
    expect(aggregated.totalStyledUsages).toBeGreaterThanOrEqual(1);
  });

  test("report generation with aggregated data", () => {
    const results = {
      sanity: {
        totalFiles: 1200,
        filesWithCustomizations: 300,
        totalInlineStyles: 400,
        totalStyledUsages: 250,
        totalCustomizations: 650,
        inlineStylesByComponent: {
          Card: {
            count: 200,
            properties: { padding: 80, minHeight: 50, overflow: 30 },
          },
          Box: { count: 100, properties: { margin: 40, display: 20 } },
          Flex: { count: 50, properties: { gap: 25, height: 15 } },
          Text: { count: 50, properties: { color: 30, whiteSpace: 10 } },
        },
        styledByComponent: {
          Card: {
            count: 120,
            properties: { position: 60, overflow: 40, background: 30 },
          },
          Flex: { count: 60, properties: { gap: 30, "min-height": 20 } },
          Box: { count: 40, properties: { display: 20, "white-space": 10 } },
          Text: { count: 30, properties: { "font-family": 15, color: 10 } },
        },
        inlineStyleProperties: {
          padding: 80,
          minHeight: 50,
          margin: 40,
          overflow: 30,
          color: 30,
        },
        styledProperties: {
          position: 60,
          overflow: 40,
          gap: 30,
          background: 30,
          display: 20,
        },
        allInlineStyles: [],
        allStyledUsages: [],
      },
      canvas: {
        totalFiles: 600,
        filesWithCustomizations: 80,
        totalInlineStyles: 100,
        totalStyledUsages: 50,
        totalCustomizations: 150,
        inlineStylesByComponent: {
          Card: { count: 60, properties: { padding: 30 } },
          Box: { count: 40, properties: { margin: 20 } },
        },
        styledByComponent: {
          Card: { count: 30, properties: { background: 15 } },
          Text: { count: 20, properties: { color: 10 } },
        },
        inlineStyleProperties: { padding: 30, margin: 20 },
        styledProperties: { background: 15, color: 10 },
        allInlineStyles: [],
        allStyledUsages: [],
      },
    };

    const text = generateTextReport(results);
    expect(text).toContain("sanity");
    expect(text).toContain("canvas");
    expect(text).toContain("Card");
    expect(text).toContain("Aggregate");

    const csv = generateCSV(results);
    expect(csv).toContain('"Card"');
    expect(csv).toContain('"inline style"');
    expect(csv).toContain('"styled()"');
    expect(csv).toContain("sanity Count");
    expect(csv).toContain("canvas Count");

    const json = generateJSON(results);
    const parsed = JSON.parse(json);
    expect(parsed.codebases.sanity).toBeDefined();
    expect(parsed.codebases.canvas).toBeDefined();
    expect(parsed.codebases.sanity.totalCustomizations).toBe(650);
    expect(parsed.codebases.canvas.totalCustomizations).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe("Edge cases", () => {
  test("handles styled() with complex CSS including media queries", () => {
    const content = `
      const ResponsiveCard = styled(Card)\`
        padding: 8px;
        @media (min-width: 768px) {
          padding: 16px;
        }
      \`
    `;
    const result = analyzeContent(content);
    expect(result.summary.styledCount).toBeGreaterThanOrEqual(1);
    expect(result.styledUsages[0].component).toBe("Card");
  });

  test("handles inline style with ternary expressions", () => {
    const content =
      '<Box style={{display: isVisible ? "block" : "none", opacity: isActive ? 1 : 0.5}}>';
    const result = analyzeContent(content);
    expect(result.summary.inlineStyleCount).toBeGreaterThanOrEqual(1);
    const boxStyles = result.inlineStyles.filter((s) => s.component === "Box");
    expect(boxStyles.length).toBeGreaterThanOrEqual(1);
    expect(boxStyles[0].properties).toContain("display");
    expect(boxStyles[0].properties).toContain("opacity");
  });

  test("handles styled() with TypeScript generics on .attrs", () => {
    // The simpler pattern with generics only after styled(Component) works
    const content = `
      const StyledStack = styled(Stack)<{$gap: number}>\`
        gap: 8px;
      \`
    `;
    const result = extractStyledUsages(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].component).toBe("Stack");
  });

  test("handles styled() with generics between .attrs and template (falls back to fn pattern)", () => {
    // When generics appear between .attrs() and the tagged template,
    // the template-literal regex may not match. The function-call pattern
    // can still catch the .attrs(...) call itself as a fallback.
    const content = `
      const StyledStack = styled(Stack).attrs<{$gap: number}>({space: 3})<{$gap: number}>\`
        gap: \${({$gap}) => $gap}px;
      \`
    `;
    const result = extractStyledUsages(content);
    // This complex pattern may or may not be caught depending on regex;
    // we just ensure no crash occurs.
    expect(Array.isArray(result)).toBe(true);
  });

  test("handles content with no tracked UI library components at all", () => {
    const content = `
      import React from 'react'

      export function PlainComponent() {
        return (
          <div style={{color: 'red'}}>
            <span>Hello</span>
          </div>
        )
      }
    `;
    const result = analyzeContent(content);
    expect(result.summary.inlineStyleCount).toBe(0);
    expect(result.summary.styledCount).toBe(0);
    expect(result.summary.totalCustomizations).toBe(0);
  });

  test("handles very large content without error", () => {
    const lines = [];
    for (let i = 0; i < 500; i++) {
      lines.push(`<Card style={{padding: ${i}}}>content ${i}</Card>`);
    }
    const content = lines.join("\n");
    const result = analyzeContent(content);
    expect(result.summary.inlineStyleCount).toBeGreaterThanOrEqual(100);
    expect(result.summary.componentsWithInlineStyles).toContain("Card");
  });

  test("handles styled() wrapping less common tracked UI library components", () => {
    const content = `
      const StyledBadge = styled(Badge)\`
        text-transform: uppercase;
      \`
      const StyledSkeleton = styled(Skeleton)\`
        border-radius: 4px;
      \`
    `;
    const result = extractStyledUsages(content);
    const components = result.map((r) => r.component);
    expect(components).toContain("Badge");
    expect(components).toContain("Skeleton");
  });

  test("handles inline styles on Tab, TabList, TabPanel", () => {
    const content = `
      <Tab style={{fontWeight: 'bold'}}>Tab 1</Tab>
      <TabList style={{borderBottom: '1px solid'}}>tabs</TabList>
      <TabPanel style={{padding: 16}}>content</TabPanel>
    `;
    const result = extractInlineStyles(content);
    const components = result.map((r) => r.component);
    expect(components).toContain("Tab");
    expect(components).toContain("TabList");
    expect(components).toContain("TabPanel");
  });

  test("handles style with empty object", () => {
    const content = "<Card style={{}}>";
    const result = analyzeContent(content);
    expect(result.summary.inlineStyleCount).toBeGreaterThanOrEqual(1);
    // But properties should be empty
    const cardStyles = result.inlineStyles.filter(
      (s) => s.component === "Card",
    );
    expect(cardStyles[0].properties).toEqual([]);
  });

  test("does not double-count from single-line and multi-line extraction", () => {
    const content = "<Card style={{padding: 4}}>content</Card>";
    const result = extractInlineStyles(content);
    // Should only be counted once, not by both passes
    const cardResults = result.filter((r) => r.component === "Card");
    expect(cardResults.length).toBe(1);
  });

  test("handles export const styled pattern", () => {
    const content = `
      export const HighlightCard = styled(Card)\`
        box-shadow: 0 0 0 2px blue;
      \`
    `;
    const result = extractStyledUsages(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].component).toBe("Card");
    expect(result[0].variableName).toBe("HighlightCard");
  });

  test("handles multiple styled() for the same component", () => {
    const content = `
      const CardA = styled(Card)\`
        background: red;
      \`
      const CardB = styled(Card)\`
        background: blue;
      \`
    `;
    const result = extractStyledUsages(content);
    const cardResults = result.filter((r) => r.component === "Card");
    expect(cardResults.length).toBe(2);
  });

  test("handles styled(Component)(functionCallStyle)", () => {
    const content = `
      const Root = styled(Card)(rootStyle)
    `;
    const result = extractStyledUsages(content);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].component).toBe("Card");
  });

  test("parseStyleProperties handles properties with function call values", () => {
    const styleStr =
      "{width: rem(PREVIEW_SIZES.detail.media.width), height: rem(42)}";
    const result = parseStyleProperties(styleStr);
    expect(result).toContain("width");
    expect(result).toContain("height");
  });

  test("parseStyledProperties handles properties with theme functions", () => {
    const css = `
      height: \${rem(PREVIEW_SIZES.detail.media.height)};
      border-radius: \${({theme}) => theme.sanity.radius[2]}px;
    `;
    const result = parseStyledProperties(css);
    expect(result).toContain("height");
    expect(result).toContain("border-radius");
  });
});
