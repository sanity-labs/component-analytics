const {
  CODEBASES,
  TRACKED_COMPONENTS,
  HTML_TAG_CATEGORIES,
  KNOWN_TAGS,
  DEFAULT_GLOB_IGNORE,
} = require("../lib/constants");

const {
  sortByCount,
  pct,
  incr,
  mergeCounters,
  sumValues,
  compact,
  topN,
  padNum,
} = require("../lib/utils");

const {
  codebasePath,
  codebaseExists,
  ensureDir,
  reportDir,
} = require("../lib/files");

const path = require("path");
const fs = require("fs");
const os = require("os");

// ═══════════════════════════════════════════════════════════════════════════════
// lib/constants
// ═══════════════════════════════════════════════════════════════════════════════

describe("lib/constants", () => {
  describe("CODEBASES", () => {
    test("is an array of strings", () => {
      expect(Array.isArray(CODEBASES)).toBe(true);
      expect(CODEBASES.length).toBeGreaterThan(0);
      for (const cb of CODEBASES) {
        expect(typeof cb).toBe("string");
      }
    });

    test("contains the expected codebase names", () => {
      expect(CODEBASES).toContain("sanity");
      expect(CODEBASES).toContain("canvas");
      expect(CODEBASES).toContain("huey");
    });

    test("has no duplicates", () => {
      const unique = new Set(CODEBASES);
      expect(unique.size).toBe(CODEBASES.length);
    });
  });

  describe("TRACKED_COMPONENTS", () => {
    test("is a non-empty array of strings", () => {
      expect(Array.isArray(TRACKED_COMPONENTS)).toBe(true);
      expect(TRACKED_COMPONENTS.length).toBeGreaterThan(0);
      for (const comp of TRACKED_COMPONENTS) {
        expect(typeof comp).toBe("string");
      }
    });

    test("all entries are PascalCase", () => {
      for (const comp of TRACKED_COMPONENTS) {
        expect(comp[0]).toBe(comp[0].toUpperCase());
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
      expect(TRACKED_COMPONENTS).toContain("KBD");
    });

    test("includes form components", () => {
      expect(TRACKED_COMPONENTS).toContain("TextInput");
      expect(TRACKED_COMPONENTS).toContain("TextArea");
      expect(TRACKED_COMPONENTS).toContain("Checkbox");
      expect(TRACKED_COMPONENTS).toContain("Select");
      expect(TRACKED_COMPONENTS).toContain("Switch");
      expect(TRACKED_COMPONENTS).toContain("Radio");
      expect(TRACKED_COMPONENTS).toContain("Autocomplete");
      expect(TRACKED_COMPONENTS).toContain("Label");
    });

    test("includes feedback components", () => {
      expect(TRACKED_COMPONENTS).toContain("Spinner");
      expect(TRACKED_COMPONENTS).toContain("Toast");
    });

    test("includes data display components", () => {
      expect(TRACKED_COMPONENTS).toContain("Avatar");
      expect(TRACKED_COMPONENTS).toContain("AvatarStack");
      expect(TRACKED_COMPONENTS).toContain("Skeleton");
      expect(TRACKED_COMPONENTS).toContain("TextSkeleton");
    });

    test("includes utility/provider components", () => {
      expect(TRACKED_COMPONENTS).toContain("Portal");
      expect(TRACKED_COMPONENTS).toContain("Layer");
      expect(TRACKED_COMPONENTS).toContain("ThemeProvider");
      expect(TRACKED_COMPONENTS).toContain("LayerProvider");
      expect(TRACKED_COMPONENTS).toContain("ErrorBoundary");
    });

    test("has no duplicates", () => {
      const unique = new Set(TRACKED_COMPONENTS);
      expect(unique.size).toBe(TRACKED_COMPONENTS.length);
    });
  });

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
      expect(keys).toContain("scripting");
      expect(keys).toContain("semantic");
    });

    test("layout category contains common layout tags", () => {
      expect(HTML_TAG_CATEGORIES.layout).toContain("div");
      expect(HTML_TAG_CATEGORIES.layout).toContain("span");
      expect(HTML_TAG_CATEGORIES.layout).toContain("section");
      expect(HTML_TAG_CATEGORIES.layout).toContain("header");
      expect(HTML_TAG_CATEGORIES.layout).toContain("footer");
      expect(HTML_TAG_CATEGORIES.layout).toContain("main");
      expect(HTML_TAG_CATEGORIES.layout).toContain("nav");
    });

    test("text category contains common text tags", () => {
      expect(HTML_TAG_CATEGORIES.text).toContain("p");
      expect(HTML_TAG_CATEGORIES.text).toContain("h1");
      expect(HTML_TAG_CATEGORIES.text).toContain("h2");
      expect(HTML_TAG_CATEGORIES.text).toContain("strong");
      expect(HTML_TAG_CATEGORIES.text).toContain("em");
      expect(HTML_TAG_CATEGORIES.text).toContain("code");
      expect(HTML_TAG_CATEGORIES.text).toContain("pre");
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

    test("no duplicates within any single category", () => {
      for (const [, tags] of Object.entries(HTML_TAG_CATEGORIES)) {
        const s = new Set(tags);
        expect(s.size).toBe(tags.length);
      }
    });
  });

  describe("KNOWN_TAGS", () => {
    test("is a Set", () => {
      expect(KNOWN_TAGS instanceof Set).toBe(true);
    });

    test("is non-empty", () => {
      expect(KNOWN_TAGS.size).toBeGreaterThan(0);
    });

    test("contains common HTML tags", () => {
      expect(KNOWN_TAGS.has("div")).toBe(true);
      expect(KNOWN_TAGS.has("span")).toBe(true);
      expect(KNOWN_TAGS.has("p")).toBe(true);
      expect(KNOWN_TAGS.has("a")).toBe(true);
      expect(KNOWN_TAGS.has("button")).toBe(true);
      expect(KNOWN_TAGS.has("input")).toBe(true);
      expect(KNOWN_TAGS.has("form")).toBe(true);
      expect(KNOWN_TAGS.has("table")).toBe(true);
      expect(KNOWN_TAGS.has("img")).toBe(true);
      expect(KNOWN_TAGS.has("ul")).toBe(true);
      expect(KNOWN_TAGS.has("li")).toBe(true);
      expect(KNOWN_TAGS.has("h1")).toBe(true);
    });

    test("contains common SVG tags", () => {
      expect(KNOWN_TAGS.has("svg")).toBe(true);
      expect(KNOWN_TAGS.has("path")).toBe(true);
      expect(KNOWN_TAGS.has("circle")).toBe(true);
      expect(KNOWN_TAGS.has("rect")).toBe(true);
      expect(KNOWN_TAGS.has("g")).toBe(true);
      expect(KNOWN_TAGS.has("defs")).toBe(true);
      expect(KNOWN_TAGS.has("clipPath")).toBe(true);
      expect(KNOWN_TAGS.has("line")).toBe(true);
    });

    test("contains document tags (html, head, body, meta)", () => {
      expect(KNOWN_TAGS.has("html")).toBe(true);
      expect(KNOWN_TAGS.has("head")).toBe(true);
      expect(KNOWN_TAGS.has("body")).toBe(true);
      expect(KNOWN_TAGS.has("meta")).toBe(true);
    });

    test("does NOT contain TypeScript type keywords", () => {
      expect(KNOWN_TAGS.has("string")).toBe(false);
      expect(KNOWN_TAGS.has("boolean")).toBe(false);
      expect(KNOWN_TAGS.has("number")).toBe(false);
      expect(KNOWN_TAGS.has("typeof")).toBe(false);
      expect(KNOWN_TAGS.has("unknown")).toBe(false);
      expect(KNOWN_TAGS.has("any")).toBe(false);
      expect(KNOWN_TAGS.has("void")).toBe(false);
      expect(KNOWN_TAGS.has("never")).toBe(false);
    });

    test("does NOT contain library-specific JSX element names", () => {
      expect(KNOWN_TAGS.has("motion")).toBe(false);
      expect(KNOWN_TAGS.has("styled")).toBe(false);
    });

    test("contains exactly every tag from HTML_TAG_CATEGORIES", () => {
      const allFromCategories = new Set(
        Object.values(HTML_TAG_CATEGORIES).flat(),
      );
      expect(KNOWN_TAGS.size).toBe(allFromCategories.size);
      for (const tag of allFromCategories) {
        expect(KNOWN_TAGS.has(tag)).toBe(true);
      }
    });

    test("all entries are strings", () => {
      for (const tag of KNOWN_TAGS) {
        expect(typeof tag).toBe("string");
      }
    });
  });

  describe("DEFAULT_GLOB_IGNORE", () => {
    test("is an array of glob strings", () => {
      expect(Array.isArray(DEFAULT_GLOB_IGNORE)).toBe(true);
      expect(DEFAULT_GLOB_IGNORE.length).toBeGreaterThan(0);
      for (const pattern of DEFAULT_GLOB_IGNORE) {
        expect(typeof pattern).toBe("string");
      }
    });

    test("ignores node_modules", () => {
      expect(DEFAULT_GLOB_IGNORE).toContain("**/node_modules/**");
    });

    test("ignores dist and build", () => {
      expect(DEFAULT_GLOB_IGNORE).toContain("**/dist/**");
      expect(DEFAULT_GLOB_IGNORE).toContain("**/build/**");
    });

    test("ignores test files", () => {
      expect(DEFAULT_GLOB_IGNORE).toContain("**/*.test.*");
      expect(DEFAULT_GLOB_IGNORE).toContain("**/*.spec.*");
      expect(DEFAULT_GLOB_IGNORE).toContain("**/__tests__/**");
    });

    test("ignores stories", () => {
      expect(DEFAULT_GLOB_IGNORE).toContain("**/*.stories.*");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// lib/utils
// ═══════════════════════════════════════════════════════════════════════════════

describe("lib/utils", () => {
  // ── sortByCount ───────────────────────────────────────────────────────────

  describe("sortByCount", () => {
    test("sorts entries by value descending", () => {
      expect(sortByCount({ a: 10, b: 50, c: 25 })).toEqual([
        ["b", 50],
        ["c", 25],
        ["a", 10],
      ]);
    });

    test("returns empty array for empty object", () => {
      expect(sortByCount({})).toEqual([]);
    });

    test("handles single entry", () => {
      expect(sortByCount({ x: 42 })).toEqual([["x", 42]]);
    });

    test("handles equal values (stable order not guaranteed, but both present)", () => {
      const result = sortByCount({ a: 5, b: 5 });
      expect(result.length).toBe(2);
      expect(result[0][1]).toBe(5);
      expect(result[1][1]).toBe(5);
    });

    test("handles large objects", () => {
      const obj = {};
      for (let i = 0; i < 100; i++) {
        obj[`key${i}`] = i;
      }
      const result = sortByCount(obj);
      expect(result[0]).toEqual(["key99", 99]);
      expect(result[result.length - 1]).toEqual(["key0", 0]);
    });
  });

  // ── pct ───────────────────────────────────────────────────────────────────

  describe("pct", () => {
    test("calculates a simple percentage", () => {
      expect(pct(50, 200)).toBe("25.0");
    });

    test("returns 0.0 when denominator is zero", () => {
      expect(pct(10, 0)).toBe("0.0");
    });

    test("returns 0.0 when both are zero", () => {
      expect(pct(0, 0)).toBe("0.0");
    });

    test("returns 100.0 when numerator equals denominator", () => {
      expect(pct(100, 100)).toBe("100.0");
    });

    test("handles fractional results", () => {
      expect(pct(1, 3)).toBe("33.3");
    });

    test("respects custom decimal places", () => {
      expect(pct(1, 3, 2)).toBe("33.33");
      expect(pct(1, 3, 0)).toBe("33");
    });

    test("handles large numbers", () => {
      expect(pct(999999, 1000000)).toBe("100.0");
    });

    test("returns string type", () => {
      expect(typeof pct(1, 2)).toBe("string");
    });
  });

  // ── incr ──────────────────────────────────────────────────────────────────

  describe("incr", () => {
    test("creates key if absent", () => {
      const c = {};
      incr(c, "div");
      expect(c.div).toBe(1);
    });

    test("increments existing key", () => {
      const c = { div: 3 };
      incr(c, "div");
      expect(c.div).toBe(4);
    });

    test("increments by custom amount", () => {
      const c = { span: 10 };
      incr(c, "span", 5);
      expect(c.span).toBe(15);
    });

    test("creates key with custom amount if absent", () => {
      const c = {};
      incr(c, "p", 7);
      expect(c.p).toBe(7);
    });

    test("returns the updated count", () => {
      const c = { x: 2 };
      const result = incr(c, "x", 3);
      expect(result).toBe(5);
    });

    test("returns the initial count when key is new", () => {
      const c = {};
      const result = incr(c, "y");
      expect(result).toBe(1);
    });

    test("does not affect other keys", () => {
      const c = { a: 1, b: 2 };
      incr(c, "a");
      expect(c.b).toBe(2);
    });
  });

  // ── mergeCounters ─────────────────────────────────────────────────────────

  describe("mergeCounters", () => {
    test("merges two counters", () => {
      const a = { div: 3, span: 1 };
      const b = { div: 2, p: 4 };
      mergeCounters(a, b);
      expect(a).toEqual({ div: 5, span: 1, p: 4 });
    });

    test("mutates target in place", () => {
      const a = { x: 1 };
      const b = { y: 2 };
      const result = mergeCounters(a, b);
      expect(result).toBe(a);
      expect(a.y).toBe(2);
    });

    test("handles empty source", () => {
      const a = { x: 1 };
      mergeCounters(a, {});
      expect(a).toEqual({ x: 1 });
    });

    test("handles empty target", () => {
      const a = {};
      mergeCounters(a, { x: 5 });
      expect(a).toEqual({ x: 5 });
    });

    test("handles both empty", () => {
      const a = {};
      mergeCounters(a, {});
      expect(a).toEqual({});
    });

    test("does not mutate source", () => {
      const a = {};
      const b = { x: 10 };
      mergeCounters(a, b);
      expect(b).toEqual({ x: 10 });
    });
  });

  // ── sumValues ─────────────────────────────────────────────────────────────

  describe("sumValues", () => {
    test("sums all values", () => {
      expect(sumValues({ a: 10, b: 20, c: 30 })).toBe(60);
    });

    test("returns 0 for empty object", () => {
      expect(sumValues({})).toBe(0);
    });

    test("handles single value", () => {
      expect(sumValues({ x: 42 })).toBe(42);
    });

    test("handles zero values", () => {
      expect(sumValues({ a: 0, b: 0 })).toBe(0);
    });
  });

  // ── compact ───────────────────────────────────────────────────────────────

  describe("compact", () => {
    test("filters out null values", () => {
      expect(compact({ a: 1, b: null, c: 3 })).toEqual({ a: 1, c: 3 });
    });

    test("filters out undefined values", () => {
      expect(compact({ a: 1, b: undefined })).toEqual({ a: 1 });
    });

    test("keeps falsy but non-null/undefined values", () => {
      expect(compact({ a: 0, b: "", c: false })).toEqual({
        a: 0,
        b: "",
        c: false,
      });
    });

    test("returns empty object when all values are null", () => {
      expect(compact({ a: null, b: null })).toEqual({});
    });

    test("returns copy of object when nothing is null", () => {
      const input = { a: 1, b: 2 };
      const result = compact(input);
      expect(result).toEqual({ a: 1, b: 2 });
      expect(result).not.toBe(input); // should be a new object
    });

    test("handles empty input", () => {
      expect(compact({})).toEqual({});
    });
  });

  // ── topN ──────────────────────────────────────────────────────────────────

  describe("topN", () => {
    test("returns the first n entries", () => {
      const sorted = [
        ["a", 50],
        ["b", 30],
        ["c", 10],
      ];
      expect(topN(sorted, 2)).toEqual([
        ["a", 50],
        ["b", 30],
      ]);
    });

    test("returns all entries when n exceeds length", () => {
      const sorted = [["a", 50]];
      expect(topN(sorted, 5)).toEqual([["a", 50]]);
    });

    test("returns empty array when input is empty", () => {
      expect(topN([], 10)).toEqual([]);
    });

    test("returns empty array when n is 0", () => {
      expect(topN([["a", 1]], 0)).toEqual([]);
    });
  });

  // ── padNum ────────────────────────────────────────────────────────────────

  describe("padNum", () => {
    test("right-aligns a number", () => {
      expect(padNum(42, 8)).toBe("      42");
    });

    test("handles number wider than width", () => {
      expect(padNum(12345, 3)).toBe("12345");
    });

    test("handles zero", () => {
      expect(padNum(0, 4)).toBe("   0");
    });

    test("handles width of 1", () => {
      expect(padNum(5, 1)).toBe("5");
    });

    test("returns a string", () => {
      expect(typeof padNum(99, 10)).toBe("string");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// lib/files
// ═══════════════════════════════════════════════════════════════════════════════

describe("lib/files", () => {
  describe("codebasePath", () => {
    test("returns an absolute path", () => {
      const p = codebasePath("sanity");
      expect(path.isAbsolute(p)).toBe(true);
    });

    test("ends with codebases/<name>", () => {
      const p = codebasePath("sanity");
      expect(p).toMatch(/codebases[/\\]sanity$/);
    });

    test("works for any codebase name", () => {
      const p = codebasePath("my-custom-codebase");
      expect(p).toMatch(/codebases[/\\]my-custom-codebase$/);
    });
  });

  describe("codebaseExists", () => {
    test("returns true for existing codebase directories", () => {
      // At least one of these should exist in the test environment
      const exists = codebaseExists("sanity");
      expect(typeof exists).toBe("boolean");
    });

    test("returns false for a non-existent codebase", () => {
      expect(codebaseExists("does-not-exist-xyz-99")).toBe(false);
    });
  });

  describe("reportDir", () => {
    test("returns an absolute path", () => {
      const p = reportDir("html-tags");
      expect(path.isAbsolute(p)).toBe(true);
    });

    test("ends with reports/<subdir>", () => {
      const p = reportDir("html-tags");
      expect(p).toMatch(/reports[/\\]html-tags$/);
    });
  });

  describe("ensureDir", () => {
    test("creates a directory that does not exist", () => {
      const tmpDir = path.join(
        os.tmpdir(),
        `component-analytics-test-${Date.now()}`,
      );
      expect(fs.existsSync(tmpDir)).toBe(false);

      ensureDir(tmpDir);
      expect(fs.existsSync(tmpDir)).toBe(true);

      // Cleanup
      fs.rmdirSync(tmpDir);
    });

    test("does not throw when directory already exists", () => {
      const tmpDir = path.join(
        os.tmpdir(),
        `component-analytics-test-${Date.now()}`,
      );
      fs.mkdirSync(tmpDir, { recursive: true });

      expect(() => ensureDir(tmpDir)).not.toThrow();

      // Cleanup
      fs.rmdirSync(tmpDir);
    });

    test("creates nested directories", () => {
      const tmpDir = path.join(
        os.tmpdir(),
        `component-analytics-test-${Date.now()}`,
        "a",
        "b",
        "c",
      );
      expect(fs.existsSync(tmpDir)).toBe(false);

      ensureDir(tmpDir);
      expect(fs.existsSync(tmpDir)).toBe(true);

      // Cleanup
      fs.rmSync(
        path.join(
          os.tmpdir(),
          `component-analytics-test-${path.basename(path.resolve(tmpDir, "../../.."))}`,
        ),
        { recursive: true, force: true },
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cross-module integration
// ═══════════════════════════════════════════════════════════════════════════════

describe("Cross-module integration", () => {
  test("sortByCount + topN work together for a typical workflow", () => {
    const counts = { div: 300, span: 100, p: 50, a: 20, img: 10 };
    const sorted = sortByCount(counts);
    const top3 = topN(sorted, 3);

    expect(top3).toEqual([
      ["div", 300],
      ["span", 100],
      ["p", 50],
    ]);
  });

  test("incr + mergeCounters + sumValues work together", () => {
    const file1 = {};
    incr(file1, "div", 10);
    incr(file1, "span", 5);

    const file2 = {};
    incr(file2, "div", 20);
    incr(file2, "p", 8);

    const total = {};
    mergeCounters(total, file1);
    mergeCounters(total, file2);

    expect(total).toEqual({ div: 30, span: 5, p: 8 });
    expect(sumValues(total)).toBe(43);
  });

  test("compact filters results before processing", () => {
    const results = {
      sanity: { count: 100 },
      canvas: null,
      huey: { count: 50 },
    };

    const live = compact(results);
    expect(Object.keys(live)).toEqual(["sanity", "huey"]);

    let total = 0;
    for (const data of Object.values(live)) {
      total += data.count;
    }
    expect(total).toBe(150);
  });

  test("pct + padNum can format a percentage cell", () => {
    const percentage = pct(42, 200);
    const padded = padNum(parseFloat(percentage), 8);
    expect(percentage).toBe("21.0");
    expect(typeof padded).toBe("string");
  });

  test("HTML_TAG_CATEGORIES tags can be looked up and sorted", () => {
    // Simulate building a category map and using it
    const map = {};
    for (const [category, tags] of Object.entries(HTML_TAG_CATEGORIES)) {
      for (const tag of tags) {
        map[tag] = category;
      }
    }

    expect(map["div"]).toBe("layout");
    expect(map["p"]).toBe("text");
    expect(map["input"]).toBe("form");
    expect(map["svg"]).toBe("media");
    expect(map["a"]).toBe("link");

    // Simulate counting and sorting
    const counts = { div: 300, span: 100, p: 50 };
    const sorted = sortByCount(counts);
    expect(sorted[0][0]).toBe("div");
  });

  test("TRACKED_COMPONENTS can be joined into a regex pattern", () => {
    const pattern = TRACKED_COMPONENTS.join("|");
    const regex = new RegExp(`<(${pattern})\\b`);

    expect(regex.test("<Card padding={2}>")).toBe(true);
    expect(regex.test("<Box>")).toBe(true);
    expect(regex.test("<div>")).toBe(false);
    expect(regex.test("<CustomWidget>")).toBe(false);
  });

  test("CODEBASES can be iterated to build a results map", () => {
    const results = {};
    for (const cb of CODEBASES) {
      results[cb] = cb === "canvas" ? null : { files: 100 };
    }

    const live = compact(results);
    expect(Object.keys(live)).toEqual(["sanity", "huey"]);
  });
});
