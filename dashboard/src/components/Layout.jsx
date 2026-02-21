import { Box, Card, Flex, Stack, Text, Heading } from "@sanity/ui";
import {
  ComponentIcon,
  BarChartIcon,
  CodeIcon,
  DocumentsIcon,
  ControlsIcon,
} from "@sanity/icons";

/**
 * Navigation items for the sidebar.
 *
 * Each entry maps a route key to a label and icon.
 *
 * @type {Array<{ key: string, label: string, icon: React.ComponentType }>}
 */
const NAV_ITEMS = [
  { key: "overview", label: "Overview", icon: BarChartIcon },
  { key: "components", label: "Components", icon: ComponentIcon },
  { key: "sources", label: "Sources", icon: DocumentsIcon },
  { key: "html-tags", label: "HTML Tags", icon: CodeIcon },
  { key: "customizations", label: "Customizations", icon: ControlsIcon },
];

/**
 * A single navigation item in the sidebar.
 *
 * Renders as a Card that highlights when active and responds to clicks.
 *
 * @param {object} props
 * @param {string}  props.label    - Display text.
 * @param {React.ComponentType} props.icon - Icon component from @sanity/icons.
 * @param {boolean} props.active   - Whether this item is currently selected.
 * @param {() => void} props.onClick - Click handler.
 */
function NavItem({ label, icon: Icon, active, onClick }) {
  return (
    <Card
      as="button"
      padding={3}
      radius={2}
      tone={active ? "primary" : "default"}
      onClick={onClick}
      style={{
        cursor: "pointer",
        border: "none",
        width: "100%",
        textAlign: "left",
        background: active ? undefined : "transparent",
      }}
    >
      <Flex gap={3} align="center">
        <Text size={1}>
          <Icon />
        </Text>
        <Text size={1} weight={active ? "bold" : "regular"}>
          {label}
        </Text>
      </Flex>
    </Card>
  );
}

/**
 * Top-level layout shell with a sidebar navigation and content area.
 *
 * The sidebar lists all report sections.  Clicking one calls `onNavigate`
 * with the route key.  The `children` prop is rendered in the main
 * content area to the right.
 *
 * If `activePage` starts with `"component/"` (i.e. a detail view), the
 * "Components" nav item is highlighted.
 *
 * @param {object} props
 * @param {string}            props.activePage  - Current route key (e.g. "overview", "components", "component/Button").
 * @param {(key: string) => void} props.onNavigate - Called when a nav item is clicked.
 * @param {React.ReactNode}   props.children    - Page content.
 */
export function Layout({ activePage, onNavigate, children }) {
  // Highlight "components" when viewing a component detail page
  const activeKey = activePage.startsWith("component/")
    ? "components"
    : activePage;

  return (
    <Flex style={{ height: "100vh", overflow: "hidden" }}>
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <Card
        borderRight
        style={{ width: 220, flexShrink: 0, overflowY: "auto" }}
        padding={3}
      >
        <Stack space={4}>
          <Box paddingX={2} paddingY={3}>
            <Stack space={2}>
              <Heading size={1}>Component Analytics</Heading>
              <Text size={0} muted>
                Dashboard
              </Text>
            </Stack>
          </Box>

          <Stack space={1}>
            {NAV_ITEMS.map((item) => (
              <NavItem
                key={item.key}
                label={item.label}
                icon={item.icon}
                active={activeKey === item.key}
                onClick={() => onNavigate(item.key)}
              />
            ))}
          </Stack>
        </Stack>
      </Card>

      {/* ── Main content ────────────────────────────────────────────── */}
      <Box flex={1} style={{ overflowY: "auto" }} padding={4}>
        {children}
      </Box>
    </Flex>
  );
}

export { NAV_ITEMS };
