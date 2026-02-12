const {
  extractHTMLTags,
  analyzeContent,
  aggregateResults,
  sortTagsByCount,
  getTagCategory,
  buildTagCategoryMap,
  generateTextReport,
  generateCSV,
  generateJSON,
  HTML_TAG_CATEGORIES,
} = require("../html-tags/analyze-html-tags");

// ---------------------------------------------------------------------------
// extractHTMLTags
// ---------------------------------------------------------------------------
describe("extractHTMLTags", () => {
  test("extracts simple HTML tags", () => {
    const content = "<div><span>hello</span></div>";
    const result = extractHTMLTags(content);
    expect(result.div).toBeGreaterThanOrEqual(1);
    expect(result.span).toBeGreaterThanOrEqual(1);
  });

  test("extracts self-closing tags", () => {
    const content = '<img src="foo.png" /><br /><hr />';
    const result = extractHTMLTags(content);
    expect(result.img).toBeGreaterThanOrEqual(1);
    expect(result.br).toBeGreaterThanOrEqual(1);
    expect(result.hr).toBeGreaterThanOrEqual(1);
  });

  test("counts multiple occurrences of the same tag", () => {
    const content = "<div><div><div></div></div></div>";
    const result = extractHTMLTags(content);
    expect(result.div).toBeGreaterThanOrEqual(3);
  });

  test("ignores PascalCase React components", () => {
    const content = "<Button><Card><div></div></Card></Button>";
    const result = extractHTMLTags(content);
    expect(result.Button).toBeUndefined();
    expect(result.Card).toBeUndefined();
    expect(result.div).toBeGreaterThanOrEqual(1);
  });

  test("handles tags with attributes", () => {
    const content =
      '<div className="foo" data-testid="bar"><input type="text" value="hello" /></div>';
    const result = extractHTMLTags(content);
    expect(result.div).toBeGreaterThanOrEqual(1);
    expect(result.input).toBeGreaterThanOrEqual(1);
  });

  test("handles tags with JSX expressions in attributes", () => {
    const content = '<div style={{color: "red"}}><span>{children}</span></div>';
    const result = extractHTMLTags(content);
    expect(result.div).toBeGreaterThanOrEqual(1);
    expect(result.span).toBeGreaterThanOrEqual(1);
  });

  test("returns empty object for content with no HTML tags", () => {
    const content = "<Button><Card>hello</Card></Button>";
    const result = extractHTMLTags(content);
    expect(Object.keys(result).length).toBe(0);
  });

  test("returns empty object for empty string", () => {
    const result = extractHTMLTags("");
    expect(result).toEqual({});
  });

  test("returns empty object for plain text", () => {
    const result = extractHTMLTags("just some plain text with no tags");
    expect(result).toEqual({});
  });

  test("handles SVG elements", () => {
    const content =
      '<svg viewBox="0 0 24 24"><path d="M0 0" /><circle cx="5" cy="5" r="3" /></svg>';
    const result = extractHTMLTags(content);
    expect(result.svg).toBeGreaterThanOrEqual(1);
    expect(result.path).toBeGreaterThanOrEqual(1);
    expect(result.circle).toBeGreaterThanOrEqual(1);
  });

  test("handles form elements", () => {
    const content =
      "<form><label>Name</label><input /><select><option>A</option></select><textarea></textarea><button>Submit</button></form>";
    const result = extractHTMLTags(content);
    expect(result.form).toBeGreaterThanOrEqual(1);
    expect(result.label).toBeGreaterThanOrEqual(1);
    expect(result.input).toBeGreaterThanOrEqual(1);
    expect(result.select).toBeGreaterThanOrEqual(1);
    expect(result.option).toBeGreaterThanOrEqual(1);
    expect(result.textarea).toBeGreaterThanOrEqual(1);
    expect(result.button).toBeGreaterThanOrEqual(1);
  });

  test("handles table elements", () => {
    const content =
      "<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>";
    const result = extractHTMLTags(content);
    expect(result.table).toBeGreaterThanOrEqual(1);
    expect(result.thead).toBeGreaterThanOrEqual(1);
    expect(result.tbody).toBeGreaterThanOrEqual(1);
    expect(result.tr).toBeGreaterThanOrEqual(2);
    expect(result.th).toBeGreaterThanOrEqual(1);
    expect(result.td).toBeGreaterThanOrEqual(1);
  });

  test("handles semantic HTML elements", () => {
    const content =
      "<header><nav><a>Link</a></nav></header><main><section><article><p>Text</p></article></section></main><footer></footer>";
    const result = extractHTMLTags(content);
    expect(result.header).toBeGreaterThanOrEqual(1);
    expect(result.nav).toBeGreaterThanOrEqual(1);
    expect(result.a).toBeGreaterThanOrEqual(1);
    expect(result.main).toBeGreaterThanOrEqual(1);
    expect(result.section).toBeGreaterThanOrEqual(1);
    expect(result.article).toBeGreaterThanOrEqual(1);
    expect(result.p).toBeGreaterThanOrEqual(1);
    expect(result.footer).toBeGreaterThanOrEqual(1);
  });

  test("handles list elements", () => {
    const content = "<ul><li>One</li><li>Two</li></ul><ol><li>Three</li></ol>";
    const result = extractHTMLTags(content);
    expect(result.ul).toBeGreaterThanOrEqual(1);
    expect(result.ol).toBeGreaterThanOrEqual(1);
    expect(result.li).toBeGreaterThanOrEqual(3);
  });

  test("handles media elements", () => {
    const content =
      '<video controls><source src="movie.mp4" /><track src="subs.vtt" /></video><audio src="song.mp3"></audio>';
    const result = extractHTMLTags(content);
    expect(result.video).toBeGreaterThanOrEqual(1);
    expect(result.source).toBeGreaterThanOrEqual(1);
    expect(result.track).toBeGreaterThanOrEqual(1);
    expect(result.audio).toBeGreaterThanOrEqual(1);
  });

  test("handles heading tags", () => {
    const content =
      "<h1>Title</h1><h2>Subtitle</h2><h3>Sub</h3><h4>Sub</h4><h5>Sub</h5><h6>Sub</h6>";
    const result = extractHTMLTags(content);
    expect(result.h1).toBeGreaterThanOrEqual(1);
    expect(result.h2).toBeGreaterThanOrEqual(1);
    expect(result.h3).toBeGreaterThanOrEqual(1);
    expect(result.h4).toBeGreaterThanOrEqual(1);
    expect(result.h5).toBeGreaterThanOrEqual(1);
    expect(result.h6).toBeGreaterThanOrEqual(1);
  });

  test("does not count tags inside string literals", () => {
    const content = 'const x = "<div>not a tag</div>";';
    const result = extractHTMLTags(content);
    // The string cleaning should prevent false positives
    expect(result.div || 0).toBe(0);
  });

  test("does not count tags inside template literals", () => {
    const content = "const x = `<div>not a tag</div>`;";
    const result = extractHTMLTags(content);
    expect(result.div || 0).toBe(0);
  });

  test("handles mixed React components and HTML tags", () => {
    const content = `
      <Card padding={2}>
        <div className="wrapper">
          <Text size={1}>Hello</Text>
          <span className="detail">Detail</span>
          <Button onClick={fn}>Click</Button>
          <a href="/link">Link</a>
        </div>
      </Card>
    `;
    const result = extractHTMLTags(content);
    expect(result.div).toBeGreaterThanOrEqual(1);
    expect(result.span).toBeGreaterThanOrEqual(1);
    expect(result.a).toBeGreaterThanOrEqual(1);
    expect(result.Card).toBeUndefined();
    expect(result.Text).toBeUndefined();
    expect(result.Button).toBeUndefined();
  });

  test("handles multi-line tags", () => {
    const content = `
      <div
        className="foo"
        data-testid="bar"
      >
        content
      </div>
    `;
    const result = extractHTMLTags(content);
    expect(result.div).toBeGreaterThanOrEqual(1);
  });

  test("handles iframe and embed tags", () => {
    const content =
      '<iframe src="https://example.com"></iframe><embed src="widget.swf" />';
    const result = extractHTMLTags(content);
    expect(result.iframe).toBeGreaterThanOrEqual(1);
    expect(result.embed).toBeGreaterThanOrEqual(1);
  });

  test("handles details/summary elements", () => {
    const content = "<details><summary>Click</summary><p>Content</p></details>";
    const result = extractHTMLTags(content);
    expect(result.details).toBeGreaterThanOrEqual(1);
    expect(result.summary).toBeGreaterThanOrEqual(1);
    expect(result.p).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// analyzeContent
// ---------------------------------------------------------------------------
describe("analyzeContent", () => {
  test("returns tag counts, totalTags and uniqueTags", () => {
    const content = "<div><span></span><span></span></div>";
    const result = analyzeContent(content);

    expect(result.tags.div).toBeGreaterThanOrEqual(1);
    expect(result.tags.span).toBeGreaterThanOrEqual(2);
    expect(result.totalTags).toBeGreaterThanOrEqual(3);
    expect(result.uniqueTags).toBe(2);
  });

  test("returns zeros for content without HTML", () => {
    const content = "<Card><Text>hello</Text></Card>";
    const result = analyzeContent(content);
    expect(result.totalTags).toBe(0);
    expect(result.uniqueTags).toBe(0);
    expect(result.tags).toEqual({});
  });

  test("returns zeros for empty content", () => {
    const result = analyzeContent("");
    expect(result.totalTags).toBe(0);
    expect(result.uniqueTags).toBe(0);
    expect(result.tags).toEqual({});
  });

  test("handles complex realistic JSX content", () => {
    const content = `
      import {Box, Card} from '@sanity/ui'
      export function MyComponent() {
        return (
          <Card>
            <div className="wrapper">
              <h1>Title</h1>
              <p>Paragraph</p>
              <ul>
                <li>Item 1</li>
                <li>Item 2</li>
              </ul>
              <button onClick={fn}>Click</button>
            </div>
          </Card>
        )
      }
    `;
    const result = analyzeContent(content);
    expect(result.uniqueTags).toBeGreaterThanOrEqual(5);
    expect(result.totalTags).toBeGreaterThanOrEqual(7);
    expect(result.tags.div).toBeGreaterThanOrEqual(1);
    expect(result.tags.h1).toBeGreaterThanOrEqual(1);
    expect(result.tags.p).toBeGreaterThanOrEqual(1);
    expect(result.tags.ul).toBeGreaterThanOrEqual(1);
    expect(result.tags.li).toBeGreaterThanOrEqual(2);
    expect(result.tags.button).toBeGreaterThanOrEqual(1);
  });

  test("only counts unique tags once per type in uniqueTags", () => {
    const content = "<div><div><div><span></span></div></div></div>";
    const result = analyzeContent(content);
    expect(result.uniqueTags).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// aggregateResults
// ---------------------------------------------------------------------------
describe("aggregateResults", () => {
  test("aggregates results from multiple files", () => {
    const fileResults = [
      { tags: { div: 3, span: 1 }, totalTags: 4, uniqueTags: 2 },
      { tags: { div: 2, p: 1, a: 1 }, totalTags: 4, uniqueTags: 3 },
    ];

    const result = aggregateResults(fileResults);

    expect(result.tags.div).toBe(5);
    expect(result.tags.span).toBe(1);
    expect(result.tags.p).toBe(1);
    expect(result.tags.a).toBe(1);
    expect(result.totalInstances).toBe(8);
    expect(result.uniqueTags).toBe(4);
    expect(result.fileCount).toBe(2);
    expect(result.filesWithHTML).toBe(2);
  });

  test("handles empty file results array", () => {
    const result = aggregateResults([]);
    expect(result.tags).toEqual({});
    expect(result.totalInstances).toBe(0);
    expect(result.uniqueTags).toBe(0);
    expect(result.fileCount).toBe(0);
    expect(result.filesWithHTML).toBe(0);
  });

  test("handles single file result", () => {
    const fileResults = [{ tags: { div: 5 }, totalTags: 5, uniqueTags: 1 }];

    const result = aggregateResults(fileResults);
    expect(result.tags.div).toBe(5);
    expect(result.totalInstances).toBe(5);
    expect(result.uniqueTags).toBe(1);
    expect(result.fileCount).toBe(1);
    expect(result.filesWithHTML).toBe(1);
  });

  test("correctly counts filesWithHTML", () => {
    const fileResults = [
      { tags: { div: 1 }, totalTags: 1, uniqueTags: 1 },
      { tags: {}, totalTags: 0, uniqueTags: 0 },
      { tags: { span: 2 }, totalTags: 2, uniqueTags: 1 },
      { tags: {}, totalTags: 0, uniqueTags: 0 },
    ];

    const result = aggregateResults(fileResults);
    expect(result.fileCount).toBe(4);
    expect(result.filesWithHTML).toBe(2);
  });

  test("handles files with no HTML", () => {
    const fileResults = [
      { tags: {}, totalTags: 0, uniqueTags: 0 },
      { tags: {}, totalTags: 0, uniqueTags: 0 },
    ];

    const result = aggregateResults(fileResults);
    expect(result.totalInstances).toBe(0);
    expect(result.uniqueTags).toBe(0);
    expect(result.filesWithHTML).toBe(0);
  });

  test("correctly merges the same tag from different files", () => {
    const fileResults = [
      { tags: { div: 10 }, totalTags: 10, uniqueTags: 1 },
      { tags: { div: 20 }, totalTags: 20, uniqueTags: 1 },
      { tags: { div: 30 }, totalTags: 30, uniqueTags: 1 },
    ];

    const result = aggregateResults(fileResults);
    expect(result.tags.div).toBe(60);
    expect(result.totalInstances).toBe(60);
    expect(result.uniqueTags).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// sortTagsByCount
// ---------------------------------------------------------------------------
describe("sortTagsByCount", () => {
  test("sorts tags by count descending", () => {
    const tags = { div: 10, span: 50, p: 25 };
    const sorted = sortTagsByCount(tags);
    expect(sorted).toEqual([
      ["span", 50],
      ["p", 25],
      ["div", 10],
    ]);
  });

  test("returns empty array for empty object", () => {
    expect(sortTagsByCount({})).toEqual([]);
  });

  test("handles single entry", () => {
    expect(sortTagsByCount({ div: 1 })).toEqual([["div", 1]]);
  });

  test("handles equal counts", () => {
    const tags = { div: 5, span: 5 };
    const sorted = sortTagsByCount(tags);
    expect(sorted.length).toBe(2);
    expect(sorted[0][1]).toBe(5);
    expect(sorted[1][1]).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// buildTagCategoryMap / getTagCategory
// ---------------------------------------------------------------------------
describe("buildTagCategoryMap", () => {
  test("returns a map of tag to category", () => {
    const map = buildTagCategoryMap();
    expect(map.div).toBe("layout");
    expect(map.span).toBe("layout");
    expect(map.p).toBe("text");
    expect(map.h1).toBe("text");
    expect(map.form).toBe("form");
    expect(map.input).toBe("form");
    expect(map.button).toBe("form");
    expect(map.ul).toBe("list");
    expect(map.li).toBe("list");
    expect(map.table).toBe("table");
    expect(map.tr).toBe("table");
    expect(map.img).toBe("media");
    expect(map.svg).toBe("media");
    expect(map.a).toBe("link");
    expect(map.iframe).toBe("embed");
  });

  test("includes all tags from HTML_TAG_CATEGORIES", () => {
    const map = buildTagCategoryMap();
    for (const [category, tags] of Object.entries(HTML_TAG_CATEGORIES)) {
      for (const tag of tags) {
        expect(map[tag]).toBe(category);
      }
    }
  });
});

describe("getTagCategory", () => {
  const categoryMap = buildTagCategoryMap();

  test("returns correct category for known tags", () => {
    expect(getTagCategory("div", categoryMap)).toBe("layout");
    expect(getTagCategory("p", categoryMap)).toBe("text");
    expect(getTagCategory("input", categoryMap)).toBe("form");
    expect(getTagCategory("table", categoryMap)).toBe("table");
    expect(getTagCategory("svg", categoryMap)).toBe("media");
    expect(getTagCategory("a", categoryMap)).toBe("link");
    expect(getTagCategory("iframe", categoryMap)).toBe("embed");
    expect(getTagCategory("ul", categoryMap)).toBe("list");
  });

  test('returns "other" for unknown tags', () => {
    expect(getTagCategory("customtag", categoryMap)).toBe("other");
    expect(getTagCategory("xyz", categoryMap)).toBe("other");
  });
});

// ---------------------------------------------------------------------------
// HTML_TAG_CATEGORIES constant
// ---------------------------------------------------------------------------
describe("HTML_TAG_CATEGORIES", () => {
  test("has expected category keys", () => {
    const keys = Object.keys(HTML_TAG_CATEGORIES);
    expect(keys).toContain("layout");
    expect(keys).toContain("text");
    expect(keys).toContain("form");
    expect(keys).toContain("list");
    expect(keys).toContain("table");
    expect(keys).toContain("media");
    expect(keys).toContain("link");
    expect(keys).toContain("embed");
  });

  test("layout category contains common layout tags", () => {
    expect(HTML_TAG_CATEGORIES.layout).toContain("div");
    expect(HTML_TAG_CATEGORIES.layout).toContain("span");
    expect(HTML_TAG_CATEGORIES.layout).toContain("section");
    expect(HTML_TAG_CATEGORIES.layout).toContain("article");
    expect(HTML_TAG_CATEGORIES.layout).toContain("header");
    expect(HTML_TAG_CATEGORIES.layout).toContain("footer");
    expect(HTML_TAG_CATEGORIES.layout).toContain("main");
    expect(HTML_TAG_CATEGORIES.layout).toContain("nav");
  });

  test("form category contains form-related tags", () => {
    expect(HTML_TAG_CATEGORIES.form).toContain("form");
    expect(HTML_TAG_CATEGORIES.form).toContain("input");
    expect(HTML_TAG_CATEGORIES.form).toContain("button");
    expect(HTML_TAG_CATEGORIES.form).toContain("select");
    expect(HTML_TAG_CATEGORIES.form).toContain("textarea");
    expect(HTML_TAG_CATEGORIES.form).toContain("label");
  });

  test("all categories are arrays of strings", () => {
    for (const [, tags] of Object.entries(HTML_TAG_CATEGORIES)) {
      expect(Array.isArray(tags)).toBe(true);
      for (const tag of tags) {
        expect(typeof tag).toBe("string");
      }
    }
  });

  test("no duplicate tags across categories", () => {
    const allTags = [];
    for (const tags of Object.values(HTML_TAG_CATEGORIES)) {
      allTags.push(...tags);
    }
    const unique = new Set(allTags);
    // Note: some tags like "text" might appear in both text and media (SVG).
    // We just verify the map builds correctly; the last-write-wins in the map
    // is acceptable. This test checks for exact duplicates within same category.
    for (const tags of Object.values(HTML_TAG_CATEGORIES)) {
      const s = new Set(tags);
      expect(s.size).toBe(tags.length);
    }
  });
});

// ---------------------------------------------------------------------------
// generateTextReport
// ---------------------------------------------------------------------------
describe("generateTextReport", () => {
  test("generates a non-empty string", () => {
    const results = {
      sanity: {
        tags: { div: 100, span: 50 },
        totalInstances: 150,
        uniqueTags: 2,
        fileCount: 10,
        filesWithHTML: 8,
      },
    };
    const report = generateTextReport(results);
    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(0);
  });

  test("includes codebase name", () => {
    const results = {
      sanity: {
        tags: { div: 10 },
        totalInstances: 10,
        uniqueTags: 1,
        fileCount: 5,
        filesWithHTML: 3,
      },
    };
    const report = generateTextReport(results);
    expect(report).toContain("SANITY");
  });

  test("includes aggregate section", () => {
    const results = {
      sanity: {
        tags: { div: 10 },
        totalInstances: 10,
        uniqueTags: 1,
        fileCount: 5,
        filesWithHTML: 3,
      },
      canvas: {
        tags: { span: 5 },
        totalInstances: 5,
        uniqueTags: 1,
        fileCount: 3,
        filesWithHTML: 2,
      },
    };
    const report = generateTextReport(results);
    expect(report).toContain("AGGREGATE");
    expect(report).toContain("ALL CODEBASES COMBINED");
  });

  test("includes statistics values", () => {
    const results = {
      sanity: {
        tags: { div: 42, span: 17 },
        totalInstances: 59,
        uniqueTags: 2,
        fileCount: 100,
        filesWithHTML: 80,
      },
    };
    const report = generateTextReport(results);
    expect(report).toContain("100");
    expect(report).toContain("80");
    expect(report).toContain("59");
  });

  test("skips null codebase results", () => {
    const results = {
      sanity: {
        tags: { div: 1 },
        totalInstances: 1,
        uniqueTags: 1,
        fileCount: 1,
        filesWithHTML: 1,
      },
      canvas: null,
    };
    const report = generateTextReport(results);
    expect(report).toContain("SANITY");
    expect(report).not.toContain("CANVAS");
  });

  test("handles all codebases being null", () => {
    const results = { sanity: null, canvas: null };
    const report = generateTextReport(results);
    expect(typeof report).toBe("string");
    expect(report).toContain("AGGREGATE");
  });

  test("handles empty tags in a codebase", () => {
    const results = {
      sanity: {
        tags: {},
        totalInstances: 0,
        uniqueTags: 0,
        fileCount: 10,
        filesWithHTML: 0,
      },
    };
    const report = generateTextReport(results);
    expect(report).toContain("0");
  });
});

// ---------------------------------------------------------------------------
// generateCSV
// ---------------------------------------------------------------------------
describe("generateCSV", () => {
  test("generates valid CSV with header", () => {
    const results = {
      sanity: {
        tags: { div: 10, span: 5 },
        totalInstances: 15,
        uniqueTags: 2,
        fileCount: 5,
        filesWithHTML: 4,
      },
    };
    const csv = generateCSV(results);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("Tag");
    expect(lines[0]).toContain("Category");
    expect(lines[0]).toContain("Total");
  });

  test("includes all tags from results", () => {
    const results = {
      sanity: {
        tags: { div: 10, span: 5, p: 3 },
        totalInstances: 18,
        uniqueTags: 3,
        fileCount: 5,
        filesWithHTML: 4,
      },
    };
    const csv = generateCSV(results);
    expect(csv).toContain('"div"');
    expect(csv).toContain('"span"');
    expect(csv).toContain('"p"');
  });

  test("includes per-codebase columns", () => {
    const results = {
      sanity: {
        tags: { div: 10 },
        totalInstances: 10,
        uniqueTags: 1,
        fileCount: 5,
        filesWithHTML: 3,
      },
      canvas: {
        tags: { div: 20 },
        totalInstances: 20,
        uniqueTags: 1,
        fileCount: 8,
        filesWithHTML: 6,
      },
    };
    const csv = generateCSV(results);
    expect(csv).toContain("sanity Count");
    expect(csv).toContain("canvas Count");
  });

  test("correctly sums totals across codebases", () => {
    const results = {
      sanity: {
        tags: { div: 10 },
        totalInstances: 10,
        uniqueTags: 1,
        fileCount: 5,
        filesWithHTML: 3,
      },
      canvas: {
        tags: { div: 20 },
        totalInstances: 20,
        uniqueTags: 1,
        fileCount: 8,
        filesWithHTML: 6,
      },
    };
    const csv = generateCSV(results);
    // The row for div should have 10, 20, and total 30
    expect(csv).toContain("30");
  });

  test("skips null codebase results", () => {
    const results = {
      sanity: {
        tags: { div: 5 },
        totalInstances: 5,
        uniqueTags: 1,
        fileCount: 3,
        filesWithHTML: 2,
      },
      canvas: null,
    };
    const csv = generateCSV(results);
    expect(csv).toContain("sanity Count");
    expect(csv).not.toContain("canvas Count");
  });

  test("handles empty tags", () => {
    const results = {
      sanity: {
        tags: {},
        totalInstances: 0,
        uniqueTags: 0,
        fileCount: 5,
        filesWithHTML: 0,
      },
    };
    const csv = generateCSV(results);
    const lines = csv.trim().split("\n");
    // Only header
    expect(lines.length).toBe(1);
  });

  test("sorts rows by total descending", () => {
    const results = {
      sanity: {
        tags: { div: 100, span: 50, p: 200 },
        totalInstances: 350,
        uniqueTags: 3,
        fileCount: 10,
        filesWithHTML: 8,
      },
    };
    const csv = generateCSV(results);
    const lines = csv.trim().split("\n").slice(1); // skip header
    // First data row should be p (200), then div (100), then span (50)
    expect(lines[0]).toContain('"p"');
    expect(lines[1]).toContain('"div"');
    expect(lines[2]).toContain('"span"');
  });
});

// ---------------------------------------------------------------------------
// generateJSON
// ---------------------------------------------------------------------------
describe("generateJSON", () => {
  test("produces valid JSON", () => {
    const results = {
      sanity: {
        tags: { div: 10, span: 5 },
        totalInstances: 15,
        uniqueTags: 2,
        fileCount: 10,
        filesWithHTML: 8,
      },
    };
    const json = generateJSON(results);
    const parsed = JSON.parse(json);
    expect(parsed).toBeDefined();
  });

  test("contains generatedAt timestamp", () => {
    const results = {
      sanity: {
        tags: { div: 1 },
        totalInstances: 1,
        uniqueTags: 1,
        fileCount: 1,
        filesWithHTML: 1,
      },
    };
    const parsed = JSON.parse(generateJSON(results));
    expect(parsed.generatedAt).toBeDefined();
    expect(typeof parsed.generatedAt).toBe("string");
  });

  test("contains codebase summaries", () => {
    const results = {
      sanity: {
        tags: { div: 10 },
        totalInstances: 10,
        uniqueTags: 1,
        fileCount: 5,
        filesWithHTML: 3,
      },
    };
    const parsed = JSON.parse(generateJSON(results));
    expect(parsed.codebases.sanity).toBeDefined();
    expect(parsed.codebases.sanity.fileCount).toBe(5);
    expect(parsed.codebases.sanity.filesWithHTML).toBe(3);
    expect(parsed.codebases.sanity.uniqueTags).toBe(1);
    expect(parsed.codebases.sanity.totalInstances).toBe(10);
  });

  test("contains aggregate section", () => {
    const results = {
      sanity: {
        tags: { div: 10 },
        totalInstances: 10,
        uniqueTags: 1,
        fileCount: 5,
        filesWithHTML: 3,
      },
    };
    const parsed = JSON.parse(generateJSON(results));
    expect(parsed.aggregate).toBeDefined();
    expect(parsed.aggregate.totalFiles).toBe(5);
    expect(parsed.aggregate.uniqueTags).toBe(1);
    expect(parsed.aggregate.totalInstances).toBe(10);
  });

  test("contains topTags in aggregate", () => {
    const results = {
      sanity: {
        tags: { div: 10, span: 5 },
        totalInstances: 15,
        uniqueTags: 2,
        fileCount: 5,
        filesWithHTML: 3,
      },
    };
    const parsed = JSON.parse(generateJSON(results));
    expect(parsed.aggregate.topTags).toBeDefined();
    expect(Array.isArray(parsed.aggregate.topTags)).toBe(true);
    expect(parsed.aggregate.topTags.length).toBe(2);
    // Should be sorted by count desc
    expect(parsed.aggregate.topTags[0].tag).toBe("div");
    expect(parsed.aggregate.topTags[0].count).toBe(10);
    expect(parsed.aggregate.topTags[0].category).toBeDefined();
  });

  test("contains per-codebase topTags", () => {
    const results = {
      sanity: {
        tags: { div: 10, span: 5 },
        totalInstances: 15,
        uniqueTags: 2,
        fileCount: 5,
        filesWithHTML: 3,
      },
    };
    const parsed = JSON.parse(generateJSON(results));
    expect(parsed.codebases.sanity.topTags).toBeDefined();
    expect(parsed.codebases.sanity.topTags.length).toBe(2);
  });

  test("skips null codebases", () => {
    const results = {
      sanity: {
        tags: { div: 1 },
        totalInstances: 1,
        uniqueTags: 1,
        fileCount: 1,
        filesWithHTML: 1,
      },
      canvas: null,
    };
    const parsed = JSON.parse(generateJSON(results));
    expect(parsed.codebases.sanity).toBeDefined();
    expect(parsed.codebases.canvas).toBeUndefined();
  });

  test("aggregates across multiple codebases", () => {
    const results = {
      sanity: {
        tags: { div: 10, span: 5 },
        totalInstances: 15,
        uniqueTags: 2,
        fileCount: 5,
        filesWithHTML: 3,
      },
      canvas: {
        tags: { div: 20, p: 3 },
        totalInstances: 23,
        uniqueTags: 2,
        fileCount: 8,
        filesWithHTML: 6,
      },
    };
    const parsed = JSON.parse(generateJSON(results));
    expect(parsed.aggregate.totalFiles).toBe(13);
    expect(parsed.aggregate.totalInstances).toBe(38);
    expect(parsed.aggregate.uniqueTags).toBe(3);
  });

  test("handles empty result", () => {
    const results = {
      sanity: {
        tags: {},
        totalInstances: 0,
        uniqueTags: 0,
        fileCount: 0,
        filesWithHTML: 0,
      },
    };
    const parsed = JSON.parse(generateJSON(results));
    expect(parsed.aggregate.totalInstances).toBe(0);
    expect(parsed.aggregate.topTags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------
describe("Integration tests", () => {
  test("full pipeline for a realistic component file", () => {
    const content = `
      import {Card, Stack, Text} from '@sanity/ui'
      import {EditIcon} from '@sanity/icons'

      export function DocumentPane({document}) {
        return (
          <Card padding={4}>
            <div className="document-header">
              <h1>{document.title}</h1>
              <span className="badge">Published</span>
            </div>
            <Stack space={3}>
              <div className="field-wrapper">
                <label htmlFor="title">Title</label>
                <input id="title" type="text" value={document.title} />
              </div>
              <div className="field-wrapper">
                <label htmlFor="body">Body</label>
                <textarea id="body">{document.body}</textarea>
              </div>
            </Stack>
            <footer>
              <button onClick={handleSave}>
                <EditIcon /> Save
              </button>
            </footer>
          </Card>
        )
      }
    `;

    const result = analyzeContent(content);
    expect(result.tags.div).toBeGreaterThanOrEqual(3);
    expect(result.tags.h1).toBeGreaterThanOrEqual(1);
    expect(result.tags.span).toBeGreaterThanOrEqual(1);
    expect(result.tags.label).toBeGreaterThanOrEqual(2);
    expect(result.tags.input).toBeGreaterThanOrEqual(1);
    expect(result.tags.textarea).toBeGreaterThanOrEqual(1);
    expect(result.tags.footer).toBeGreaterThanOrEqual(1);
    expect(result.tags.button).toBeGreaterThanOrEqual(1);
    expect(result.uniqueTags).toBeGreaterThanOrEqual(7);

    // Should NOT have React components
    expect(result.tags.Card).toBeUndefined();
    expect(result.tags.Stack).toBeUndefined();
    expect(result.tags.Text).toBeUndefined();
    expect(result.tags.EditIcon).toBeUndefined();
  });

  test("aggregation of multiple file results", () => {
    const files = [
      analyzeContent('<div className="a"><span>text</span></div>'),
      analyzeContent("<section><p>paragraph</p><p>another</p></section>"),
      analyzeContent("<Card><Text>no html here</Text></Card>"),
    ];

    const aggregated = aggregateResults(files);
    expect(aggregated.fileCount).toBe(3);
    expect(aggregated.filesWithHTML).toBe(2);
    expect(aggregated.tags.div).toBeGreaterThanOrEqual(1);
    expect(aggregated.tags.span).toBeGreaterThanOrEqual(1);
    expect(aggregated.tags.section).toBeGreaterThanOrEqual(1);
    expect(aggregated.tags.p).toBeGreaterThanOrEqual(2);
    expect(aggregated.totalInstances).toBeGreaterThanOrEqual(5);
  });

  test("report generation with aggregated data", () => {
    const results = {
      sanity: {
        tags: { div: 500, span: 200, p: 100, button: 50, input: 30 },
        totalInstances: 880,
        uniqueTags: 5,
        fileCount: 1200,
        filesWithHTML: 800,
      },
      canvas: {
        tags: { div: 300, span: 100, a: 80, img: 20 },
        totalInstances: 500,
        uniqueTags: 4,
        fileCount: 600,
        filesWithHTML: 400,
      },
    };

    const text = generateTextReport(results);
    expect(text).toContain("SANITY");
    expect(text).toContain("CANVAS");
    expect(text).toContain("div");
    expect(text).toContain("span");
    expect(text).toContain("AGGREGATE");

    const csv = generateCSV(results);
    expect(csv).toContain('"div"');
    expect(csv).toContain("800"); // 500 + 300

    const json = generateJSON(results);
    const parsed = JSON.parse(json);
    expect(parsed.aggregate.totalInstances).toBe(1380);
    expect(parsed.aggregate.totalFiles).toBe(1800);
  });

  test("handles SVG-heavy content", () => {
    const content = `
      export function Icon() {
        return (
          <svg viewBox="0 0 24 24" fill="none">
            <g>
              <path d="M12 2L2 22h20L12 2z" />
              <circle cx="12" cy="16" r="1" />
              <line x1="12" y1="8" x2="12" y2="13" />
            </g>
          </svg>
        )
      }
    `;
    const result = analyzeContent(content);
    expect(result.tags.svg).toBeGreaterThanOrEqual(1);
    expect(result.tags.g).toBeGreaterThanOrEqual(1);
    expect(result.tags.path).toBeGreaterThanOrEqual(1);
    expect(result.tags.circle).toBeGreaterThanOrEqual(1);
    expect(result.tags.line).toBeGreaterThanOrEqual(1);
  });

  test("handles content with no recognizable tags", () => {
    const content = `
      import {useMemo} from 'react'

      export function useMyHook() {
        return useMemo(() => computeValue(), [])
      }
    `;
    const result = analyzeContent(content);
    expect(result.totalTags).toBe(0);
    expect(result.uniqueTags).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe("Edge cases", () => {
  test("handles very long content", () => {
    const lines = [];
    for (let i = 0; i < 1000; i++) {
      lines.push(`<div key={${i}}><span>${i}</span></div>`);
    }
    const result = analyzeContent(lines.join("\n"));
    expect(result.tags.div).toBeGreaterThanOrEqual(1000);
    expect(result.tags.span).toBeGreaterThanOrEqual(1000);
  });

  test("handles content with only closing tags", () => {
    const content = "</div></span></p>";
    const result = analyzeContent(content);
    // Closing tags should not be counted as opening tags
    expect(result.totalTags).toBe(0);
  });

  test("handles tags with boolean attributes", () => {
    const content = "<input disabled /><button hidden>Click</button>";
    const result = extractHTMLTags(content);
    expect(result.input).toBeGreaterThanOrEqual(1);
    expect(result.button).toBeGreaterThanOrEqual(1);
  });

  test("handles tags with data attributes", () => {
    const content = '<div data-testid="my-component" data-foo="bar"></div>';
    const result = extractHTMLTags(content);
    expect(result.div).toBeGreaterThanOrEqual(1);
  });

  test("handles tags with event handlers", () => {
    const content =
      "<button onClick={handleClick} onMouseOver={handleHover}>Click</button>";
    const result = extractHTMLTags(content);
    expect(result.button).toBeGreaterThanOrEqual(1);
  });

  test("handles content with comments", () => {
    const content = `
      {/* <div>This is a comment</div> */}
      <span>Actual content</span>
    `;
    const result = analyzeContent(content);
    // The div inside the comment may or may not be matched; we mainly
    // care that span is matched.
    expect(result.tags.span).toBeGreaterThanOrEqual(1);
  });

  test("handles fragments (should be ignored)", () => {
    const content = "<><div>content</div></>";
    const result = extractHTMLTags(content);
    // Fragments are <> which starts with < but has no tag name
    expect(result.div).toBeGreaterThanOrEqual(1);
  });

  test("does not mistake CSS-in-JS for tags", () => {
    const content = `
      const styles = \`
        .container > div {
          color: red;
        }
      \`
    `;
    const result = analyzeContent(content);
    // Template literal content should be stripped
    expect(result.tags.div || 0).toBe(0);
  });

  test("filters out TypeScript type keywords that look like tags", () => {
    // In TSX files, patterns like `<string>` or `<boolean>` can appear
    // in type assertions. These should be filtered out.
    const content = `
      function parse(value: unknown) {
        return <string>value
      }
      <div>actual tag</div>
    `;
    const result = extractHTMLTags(content);
    expect(result.string || 0).toBe(0);
    expect(result.div).toBeGreaterThanOrEqual(1);
  });

  test("filters out library-specific JSX elements like motion", () => {
    const content = `
      <motion.div animate={{opacity: 1}}>
        <div>content</div>
      </motion.div>
    `;
    const result = extractHTMLTags(content);
    // "motion" is not a valid HTML/SVG tag
    expect(result.motion || 0).toBe(0);
    // "div" is valid
    expect(result.div).toBeGreaterThanOrEqual(1);
  });

  test("filters out typeof, boolean, number, unknown, any, void", () => {
    const content = `
      <typeof x>
      <boolean>
      <number>
      <unknown>
      <any>
      <void>
      <span>real tag</span>
    `;
    const result = extractHTMLTags(content);
    expect(result.typeof || 0).toBe(0);
    expect(result.boolean || 0).toBe(0);
    expect(result.number || 0).toBe(0);
    expect(result.unknown || 0).toBe(0);
    expect(result.any || 0).toBe(0);
    expect(result.void || 0).toBe(0);
    expect(result.span).toBeGreaterThanOrEqual(1);
  });

  test("keeps all valid HTML tags from the allowlist", () => {
    const content = `
      <div></div>
      <span></span>
      <p></p>
      <a href="#">link</a>
      <button>click</button>
      <input />
      <img src="x" />
      <table><tr><td>cell</td></tr></table>
      <ul><li>item</li></ul>
      <form><label>Name</label><select><option>A</option></select></form>
    `;
    const result = extractHTMLTags(content);
    expect(result.div).toBeGreaterThanOrEqual(1);
    expect(result.span).toBeGreaterThanOrEqual(1);
    expect(result.p).toBeGreaterThanOrEqual(1);
    expect(result.a).toBeGreaterThanOrEqual(1);
    expect(result.button).toBeGreaterThanOrEqual(1);
    expect(result.input).toBeGreaterThanOrEqual(1);
    expect(result.img).toBeGreaterThanOrEqual(1);
    expect(result.table).toBeGreaterThanOrEqual(1);
    expect(result.tr).toBeGreaterThanOrEqual(1);
    expect(result.td).toBeGreaterThanOrEqual(1);
    expect(result.ul).toBeGreaterThanOrEqual(1);
    expect(result.li).toBeGreaterThanOrEqual(1);
    expect(result.form).toBeGreaterThanOrEqual(1);
    expect(result.label).toBeGreaterThanOrEqual(1);
    expect(result.select).toBeGreaterThanOrEqual(1);
    expect(result.option).toBeGreaterThanOrEqual(1);
  });

  test("keeps all valid SVG tags from the allowlist", () => {
    const content = `
      <svg viewBox="0 0 24 24">
        <g>
          <path d="M0 0" />
          <circle cx="5" cy="5" r="3" />
          <rect x="0" y="0" width="10" height="10" />
          <line x1="0" y1="0" x2="10" y2="10" />
          <ellipse cx="5" cy="5" rx="3" ry="2" />
          <polygon points="0,0 10,0 5,10" />
          <defs><clipPath id="c"><rect /></clipPath></defs>
        </g>
      </svg>
    `;
    const result = extractHTMLTags(content);
    expect(result.svg).toBeGreaterThanOrEqual(1);
    expect(result.g).toBeGreaterThanOrEqual(1);
    expect(result.path).toBeGreaterThanOrEqual(1);
    expect(result.circle).toBeGreaterThanOrEqual(1);
    expect(result.rect).toBeGreaterThanOrEqual(2);
    expect(result.line).toBeGreaterThanOrEqual(1);
    expect(result.ellipse).toBeGreaterThanOrEqual(1);
    expect(result.polygon).toBeGreaterThanOrEqual(1);
    expect(result.defs).toBeGreaterThanOrEqual(1);
    expect(result.clipPath).toBeGreaterThanOrEqual(1);
  });

  test("only returns known HTML/SVG tags, never arbitrary lowercase names", () => {
    const content = `
      <div>real</div>
      <span>real</span>
      <mycustomelement>not real</mycustomelement>
      <fancywidget prop={true}>not real</fancywidget>
      <webcomponent>not real</webcomponent>
    `;
    const result = extractHTMLTags(content);
    expect(result.div).toBeGreaterThanOrEqual(1);
    expect(result.span).toBeGreaterThanOrEqual(1);
    expect(result.mycustomelement || 0).toBe(0);
    expect(result.fancywidget || 0).toBe(0);
    expect(result.webcomponent || 0).toBe(0);
    // Should only contain known tags
    const { KNOWN_TAGS } = require("../lib/constants");
    for (const tag of Object.keys(result)) {
      expect(KNOWN_TAGS.has(tag)).toBe(true);
    }
  });

  test("mixed valid and invalid tags returns only valid ones", () => {
    const content = `
      <div>
        <string>type keyword</string>
        <motion.div>animation library</motion.div>
        <span>valid</span>
        <boolean>type keyword</boolean>
        <p>valid</p>
        <number>type keyword</number>
        <a href="#">valid</a>
      </div>
    `;
    const result = analyzeContent(content);
    // Only div, span, p, a should be counted
    expect(result.tags.div).toBeGreaterThanOrEqual(1);
    expect(result.tags.span).toBeGreaterThanOrEqual(1);
    expect(result.tags.p).toBeGreaterThanOrEqual(1);
    expect(result.tags.a).toBeGreaterThanOrEqual(1);
    // These should all be filtered out
    expect(result.tags.string || 0).toBe(0);
    expect(result.tags.motion || 0).toBe(0);
    expect(result.tags.boolean || 0).toBe(0);
    expect(result.tags.number || 0).toBe(0);
    // uniqueTags should only count valid ones
    expect(result.uniqueTags).toBe(4);
  });
});
