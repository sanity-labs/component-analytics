/**
 * Central data loader for the dashboard.
 *
 * Imports every report JSON via Vite's static JSON import support.
 * The @reports alias is configured in vite.config.js to point at ../reports.
 *
 * Library names are derived from the sources report, which records the
 * `libraryNames` array that was active when the analysis ran.  This
 * keeps the dashboard in sync with whatever libraries the user
 * configured — no build-time injection needed.
 *
 * Component detail files are discovered automatically with import.meta.glob
 * so no manual import list is needed when tracked components change.
 */

// ── Source analysis (loaded first — library names live here) ──────────────────

import sourcesReport from "@reports/sources/report.json";

// ── Library names (derived from the report) ───────────────────────────────────

/**
 * Ordered list of tracked UI library names exactly as they appeared in
 * the project configuration when the analysis was run.
 *
 * @type {string[]}
 */
export const libraryNames = sourcesReport.libraryNames || [];

/**
 * Human-readable label covering ALL tracked UI libraries.
 *
 * When a single library is configured this is just its name
 * (e.g. `"Sanity UI"`).  When multiple libraries are configured the
 * names are joined with " & " (e.g. `"Sanity UI & Sanity Icons"`).
 *
 * Falls back to `"Tracked Library"` if the report has no library names.
 *
 * @type {string}
 */
export const LIBRARY_NAME =
  libraryNames.length > 0 ? libraryNames.join(" & ") : "Tracked Library";

/**
 * The name of the first (primary) UI library.
 *
 * Useful for short labels where the full combined name would be too
 * long (e.g. column headers, badges).
 *
 * @type {string}
 */
export const PRIMARY_LIBRARY_NAME = libraryNames[0] || "Tracked Library";

// ── Per-component reports ─────────────────────────────────────────────────────

import perComponentSummary from "@reports/components/summary.json";

/**
 * Eagerly import every component detail JSON in the reports directory.
 *
 * Vite resolves these at build time so no manual import list is required.
 * When a new component appears in the reports after a re-analysis the
 * dashboard picks it up automatically on the next build.
 *
 * @type {Record<string, { default: object }>}
 */
const detailModules = import.meta.glob("@reports/components/detail/*.json", {
  eager: true,
});

/**
 * Map of component name → full detail JSON (props, values, references).
 * Only includes components that had at least one import or instance.
 *
 * @type {Record<string, object>}
 */
export const componentDetails = {};

for (const [path, mod] of Object.entries(detailModules)) {
  const match = path.match(/\/([^/]+)\.json$/);
  if (match) {
    componentDetails[match[1]] = mod.default ?? mod;
  }
}

// ── HTML tags ─────────────────────────────────────────────────────────────────

import htmlTagsReport from "@reports/html-tags/report.json";

// ── Customizations ────────────────────────────────────────────────────────────

import customizationsReport from "@reports/customizations/report.json";

// ── Re-exports ────────────────────────────────────────────────────────────────

export {
  perComponentSummary,
  sourcesReport,
  htmlTagsReport,
  customizationsReport,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Look up a single component's detail by name.
 *
 * @param {string} name - PascalCase component name (e.g. "Button").
 * @returns {object | undefined}
 */
export function getComponentDetail(name) {
  return componentDetails[name];
}

/**
 * Get the list of all component names that have detail reports.
 *
 * @returns {string[]}
 */
export function getComponentNames() {
  return Object.keys(componentDetails);
}
