import { useState, useCallback, useEffect } from "react";
import { Layout } from "./components/Layout.jsx";
import { Overview } from "./pages/Overview.jsx";
import { Components } from "./pages/Components.jsx";
import { ComponentDetail } from "./pages/ComponentDetail.jsx";
import { Sources } from "./pages/Sources.jsx";
import { HtmlTags } from "./pages/HtmlTags.jsx";
import { Customizations } from "./pages/Customizations.jsx";
import { Icons } from "./pages/Icons.jsx";

/**
 * Parse the current hash into a page key.
 *
 * Examples:
 *   ""                     → "overview"
 *   "#overview"            → "overview"
 *   "#components"          → "components"
 *   "#component/Button"    → "component/Button"
 *   "#html-tags"           → "html-tags"
 *
 * @returns {string} The page key derived from `window.location.hash`.
 */
function getPageFromHash() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  return raw || "overview";
}

/**
 * Root application component.
 *
 * Uses hash-based routing (`#overview`, `#components`, `#component/Card`,
 * etc.) so the dashboard works as a static site with no server-side
 * routing needed.  The `Layout` component provides the sidebar
 * navigation, and this component swaps the page content based on the
 * current hash.
 */
export function App() {
  const [page, setPage] = useState(getPageFromHash);

  // Listen for hash changes (browser back/forward buttons)
  useEffect(() => {
    function onHashChange() {
      setPage(getPageFromHash());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  /**
   * Navigate to a page by updating the hash.
   *
   * @param {string} key - Page key (e.g. "overview", "component/Button").
   */
  const navigate = useCallback((key) => {
    window.location.hash = `#${key}`;
    // State is updated by the hashchange listener, but we also set it
    // immediately so the UI responds without waiting for the event loop.
    setPage(key);
    // Scroll to top when navigating
    const main = document.querySelector("[data-main-scroll]");
    if (main) {
      main.scrollTop = 0;
    } else {
      window.scrollTo(0, 0);
    }
  }, []);

  /**
   * Render the active page based on the current route key.
   *
   * @returns {React.ReactNode}
   */
  function renderPage() {
    // ── Component detail route: "component/<Name>" ─────────────────
    if (page.startsWith("component/")) {
      const componentName = page.slice("component/".length);
      return (
        <ComponentDetail
          componentName={componentName}
          onNavigate={navigate}
        />
      );
    }

    // ── Top-level routes ───────────────────────────────────────────
    switch (page) {
      case "overview":
        return <Overview onNavigate={navigate} />;

      case "components":
        return <Components onNavigate={navigate} />;

      case "sources":
        return <Sources onNavigate={navigate} />;

      case "html-tags":
        return <HtmlTags />;

      case "customizations":
        return <Customizations onNavigate={navigate} />;

      case "icons":
        return <Icons />;

      default:
        return <Overview onNavigate={navigate} />;
    }
  }

  return (
    <Layout activePage={page} onNavigate={navigate}>
      {renderPage()}
    </Layout>
  );
}
