import { Heading, Stack, Text, Badge, Flex, Card } from "@sanity/ui";
import { DataTable } from "../components/DataTable.jsx";
import { perComponentSummary, libraryNames, LIBRARY_NAME } from "../data.js";

/**
 * Components page — full sortable table of every tracked-library component.
 *
 * Columns:
 *   - Component name (clickable → detail page)
 *   - Total JSX instances
 *   - Total file imports
 *   - Unique props count
 *   - Avg props per instance
 *   - Top 5 props (abbreviated)
 *
 * @param {object} props
 * @param {(page: string) => void} props.onNavigate - Navigate to a detail page.
 */
export function Components({ onNavigate }) {
  const components = (perComponentSummary.components || []).map((c) => {
    const totalPropUsages = (c.topProps || []).reduce(
      (sum, p) => sum + p.usages,
      0,
    );
    const avgProps =
      c.totalInstances > 0
        ? (totalPropUsages / c.totalInstances).toFixed(2)
        : "0.00";

    return {
      _key: c.component,
      component: c.component,
      library: c.library || null,
      instances: c.totalInstances,
      imports: c.totalImports,
      uniqueProps: c.uniqueProps,
      avgProps: parseFloat(avgProps),
      topProps: (c.topProps || [])
        .slice(0, 5)
        .map((p) => `${p.name}(${p.usages})`)
        .join(", "),
      // Keep raw codebase data for the badge breakdown
      codebaseInstances: c.codebaseInstances || {},
    };
  });

  const totalInstances = perComponentSummary.totalInstances || 0;
  const totalImports = perComponentSummary.totalImports || 0;
  const totalComponents = perComponentSummary.totalComponents || 0;

  const showLibraryColumn = libraryNames.length > 1;

  const columns = [
    {
      key: "component",
      label: "Component",
      flex: 3,
      render: (val) => (
        <Text
          size={1}
          weight="bold"
          style={{ color: "var(--card-focus-ring-color)" }}
        >
          {val}
        </Text>
      ),
    },
    ...(showLibraryColumn
      ? [
          {
            key: "library",
            label: "Library",
            flex: 2,
            render: (val) =>
              val ? (
                <Badge tone="primary" size={0}>
                  {val}
                </Badge>
              ) : (
                <Text size={0} muted>
                  —
                </Text>
              ),
          },
        ]
      : []),
    { key: "instances", label: "Instances", numeric: true, flex: 2 },
    { key: "imports", label: "Imports", numeric: true, flex: 2 },
    { key: "uniqueProps", label: "Props", numeric: true },
    { key: "avgProps", label: "Avg Props/Use", numeric: true, flex: 2 },
    {
      key: "codebaseInstances",
      label: "Codebases",
      flex: 3,
      render: (val) => {
        if (!val || typeof val !== "object") return null;
        return (
          <Flex gap={2} wrap="wrap">
            {Object.entries(val).map(([cb, count]) => (
              <Badge key={cb} tone="primary" size={0}>
                {cb}: {count}
              </Badge>
            ))}
          </Flex>
        );
      },
    },
    {
      key: "topProps",
      label: "Top Props",
      flex: 4,
      render: (val) => (
        <Text size={0} muted textOverflow="ellipsis">
          {val || "—"}
        </Text>
      ),
    },
  ];

  return (
    <Stack space={5}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <Stack space={3}>
        <Heading size={3}>{LIBRARY_NAME} Components</Heading>
        <Text size={1} muted>
          {totalComponents} components · {totalInstances.toLocaleString()} JSX
          instances · {totalImports.toLocaleString()} file imports
        </Text>
      </Stack>

      {/* ── Summary badges ──────────────────────────────────────────── */}
      <Flex gap={3} wrap="wrap">
        <Card padding={3} radius={2} shadow={1}>
          <Flex gap={2} align="center">
            <Text size={1} muted>
              Most used:
            </Text>
            <Text size={1} weight="bold">
              {components.length > 0 ? components[0].component : "—"}
            </Text>
            {components.length > 0 && (
              <Badge tone="primary">
                {components[0].instances.toLocaleString()} instances
              </Badge>
            )}
          </Flex>
        </Card>
        <Card padding={3} radius={2} shadow={1}>
          <Flex gap={2} align="center">
            <Text size={1} muted>
              Most props:
            </Text>
            <Text size={1} weight="bold">
              {components.length > 0
                ? [...components].sort(
                    (a, b) => b.uniqueProps - a.uniqueProps,
                  )[0].component
                : "—"}
            </Text>
            {components.length > 0 && (
              <Badge tone="caution">
                {
                  [...components].sort(
                    (a, b) => b.uniqueProps - a.uniqueProps,
                  )[0].uniqueProps
                }{" "}
                props
              </Badge>
            )}
          </Flex>
        </Card>
        <Card padding={3} radius={2} shadow={1}>
          <Flex gap={2} align="center">
            <Text size={1} muted>
              Highest prop density:
            </Text>
            <Text size={1} weight="bold">
              {components.length > 0
                ? [...components]
                    .filter((c) => c.instances >= 5)
                    .sort((a, b) => b.avgProps - a.avgProps)[0]?.component ||
                  "—"
                : "—"}
            </Text>
            {components.length > 0 && (
              <Badge tone="critical">
                {[...components]
                  .filter((c) => c.instances >= 5)
                  .sort((a, b) => b.avgProps - a.avgProps)[0]
                  ?.avgProps.toFixed(2) || "0"}{" "}
                props/use
              </Badge>
            )}
          </Flex>
        </Card>
      </Flex>

      {/* ── Full table ──────────────────────────────────────────────── */}
      <DataTable
        columns={columns}
        rows={components}
        defaultSortKey="instances"
        onRowClick={(row) => onNavigate(`component/${row.component}`)}
      />
    </Stack>
  );
}
