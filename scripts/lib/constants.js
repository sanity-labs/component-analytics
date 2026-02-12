/**
 * @module lib/constants
 *
 * Shared constants used across all analysis scripts. Centralising these
 * prevents drift between scripts and makes it trivial to add a new
 * codebase or track a new Sanity UI primitive.
 */

/**
 * Codebase directory names found under `codebases/`.
 * Every analysis script iterates this list.
 *
 * @type {string[]}
 */
const CODEBASES = ["sanity", "canvas", "huey"];

/**
 * Canonical list of Sanity UI component names exported from `@sanity/ui`.
 *
 * Used by the customisation analyser to detect `style={}` props and
 * `styled()` wrappers, and by the UI-component-sources analyser to
 * classify imports.
 *
 * Keep this sorted by category so humans can scan it quickly.
 *
 * @type {string[]}
 */
const SANITY_UI_COMPONENTS = [
  // ── Layout ──────────────────────────────────────────────
  "Box",
  "Container",
  "Flex",
  "Grid",
  "Inline",
  "Stack",

  // ── Interactive ─────────────────────────────────────────
  "Button",
  "Card",
  "Dialog",
  "Menu",
  "MenuButton",
  "MenuDivider",
  "MenuGroup",
  "MenuItem",
  "Popover",
  "Tab",
  "TabList",
  "TabPanel",
  "Tooltip",

  // ── Form ────────────────────────────────────────────────
  "Autocomplete",
  "Checkbox",
  "Label",
  "Radio",
  "Select",
  "Switch",
  "TextArea",
  "TextInput",

  // ── Typography ──────────────────────────────────────────
  "Badge",
  "Code",
  "Heading",
  "KBD",
  "Text",

  // ── Feedback ────────────────────────────────────────────
  "Spinner",
  "Toast",

  // ── Data Display ────────────────────────────────────────
  "Avatar",
  "AvatarCounter",
  "AvatarStack",
  "Skeleton",
  "TextSkeleton",
  "Tree",
  "TreeItem",

  // ── Utility / Providers ─────────────────────────────────
  "BoundaryElementProvider",
  "ErrorBoundary",
  "Layer",
  "LayerProvider",
  "Portal",
  "PortalProvider",
  "ThemeColorProvider",
  "ThemeProvider",
  "TooltipDelayGroupProvider",
];

/**
 * Standard HTML tags grouped by semantic category.
 *
 * The HTML-tag analyser uses this to classify each tag it encounters.
 * Categories are intentionally broad so the report stays readable.
 *
 * @type {Object<string, string[]>}
 */
const HTML_TAG_CATEGORIES = {
  layout: [
    "article",
    "aside",
    "details",
    "dialog",
    "div",
    "figcaption",
    "figure",
    "footer",
    "header",
    "main",
    "nav",
    "section",
    "slot",
    "span",
    "summary",
    "template",
  ],

  text: [
    "abbr",
    "b",
    "bdi",
    "bdo",
    "blockquote",
    "br",
    "cite",
    "code",
    "data",
    "del",
    "dfn",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "ins",
    "kbd",
    "mark",
    "p",
    "pre",
    "q",
    "rp",
    "rt",
    "ruby",
    "s",
    "samp",
    "small",
    "strong",
    "sub",
    "sup",
    "time",
    "u",
    "var",
    "wbr",
  ],

  form: [
    "button",
    "datalist",
    "fieldset",
    "form",
    "input",
    "label",
    "legend",
    "meter",
    "optgroup",
    "option",
    "output",
    "progress",
    "select",
    "textarea",
  ],

  list: ["dd", "dl", "dt", "li", "menu", "ol", "ul"],

  table: [
    "caption",
    "col",
    "colgroup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
  ],

  media: [
    "animate",
    "animateTransform",
    "audio",
    "canvas",
    "circle",
    "clipPath",
    "defs",
    "desc",
    "ellipse",
    "feBlend",
    "feComposite",
    "feFlood",
    "feGaussianBlur",
    "feMerge",
    "feMergeNode",
    "feOffset",
    "filter",
    "foreignObject",
    "g",
    "image",
    "img",
    "line",
    "linearGradient",
    "marker",
    "mask",
    "metadata",
    "path",
    "pattern",
    "picture",
    "polygon",
    "polyline",
    "radialGradient",
    "rect",
    "set",
    "source",
    "stop",
    "svg",
    "symbol",
    "text",
    "title",
    "track",
    "tspan",
    "use",
    "video",
  ],

  link: ["a", "area", "link", "map"],

  embed: ["embed", "iframe", "object", "param", "portal"],

  scripting: ["noscript", "script"],

  semantic: ["address", "hgroup", "search"],

  document: ["html", "head", "body", "base", "meta", "style"],
};

/**
 * Flat set of every known HTML and SVG tag name, built from
 * {@link HTML_TAG_CATEGORIES}.
 *
 * Used as an allowlist — any tag the regex extracts that isn't in this
 * set is discarded as a false positive (e.g. TypeScript type keywords
 * like `string`, `boolean`, `typeof`, or library-specific JSX elements
 * like `motion`).
 *
 * @type {Set<string>}
 */
const KNOWN_TAGS = new Set(Object.values(HTML_TAG_CATEGORIES).flat());

/**
 * Glob ignore patterns shared by every analyser when scanning codebases.
 *
 * @type {string[]}
 */
const DEFAULT_GLOB_IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
  "**/*.stories.*",
];

module.exports = {
  CODEBASES,
  SANITY_UI_COMPONENTS,
  HTML_TAG_CATEGORIES,
  KNOWN_TAGS,
  DEFAULT_GLOB_IGNORE,
};
