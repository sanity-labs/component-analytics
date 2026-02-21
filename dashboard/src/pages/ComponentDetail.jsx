import { useState, useMemo } from "react";
import {
  Box,
  Card,
  Flex,
  Grid,
  Heading,
  Stack,
  Text,
  Badge,
  Button,
} from "@sanity/ui";
import { ArrowLeftIcon } from "@sanity/icons";
import { StatCard } from "../components/StatCard.jsx";
import { DataTable } from "../components/DataTable.jsx";
import { LabelledBar } from "../components/Bar.jsx";
import { getComponentDetail, LIBRARY_NAME, libraryNames } from "../data.js";

/**
 * Compute a percentage safely.
 *
 * @param {number} n
 * @param {number} d
 * @returns {number}
 */
function pct(n, d) {
  return d === 0 ? 0 : (n / d) * 100;
}

/**
 * Detail page for a single Sanity UI component.
 *
 * Shows:
 *   1. Header with component name + key stats
 *   2. Per-codebase instance breakdown
 *   3. Prop usage table (sortable, with value drill-down)
 *   4. Prop value breakdown for a selected prop
 *   5. References table (file path + line number for every instance)
 *
 * @param {object} props
 * @param {string} props.componentName - PascalCase component name (e.g. "Button").
 * @param {(page: string) => void} props.onNavigate - Navigate callback.
 */
export function ComponentDetail({ componentName, onNavigate }) {
  const data = getComponentDetail(componentName);
  const [selectedProp, setSelectedProp] = useState(null);
  const [refsPage, setRefsPage] = useState(0);

  const REFS_PER_PAGE = 50;

  if (!data) {
    return (
      <Stack space={4}>
        <Button
          icon={ArrowLeftIcon}
          text="Back to Components"
          mode="ghost"
          onClick={() => onNavigate("components")}
        />
        <Card padding={5} radius={2} shadow={1} tone="caution">
          <Stack space={3}>
            <Heading size={2}>Component not found</Heading>
            <Text size={1} muted>
              No report data found for "{componentName}".
            </Text>
          </Stack>
        </Card>
      </Stack>
    );
  }

  // ── Prop table rows ───────────────────────────────────────────────────────

  const propRows = useMemo(() => {
    if (!data.props) return [];
    return Object.entries(data.props)
      .map(([name, info]) => {
        const topValues = Object.entries(info.values || {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([v, c]) => `${v}(${c})`)
          .join(", ");

        const uniqueValues = Object.keys(info.values || {}).length;

        return {
          _key: name,
          name,
          usages: info.totalUsages,
          pctOfInstances:
            pct(info.totalUsages, data.totalInstances).toFixed(1) + "%",
          uniqueValues,
          topValues,
        };
      })
      .sort((a, b) => b.usages - a.usages);
  }, [data]);

  // ── Selected prop value rows ──────────────────────────────────────────────

  const valueRows = useMemo(() => {
    if (!selectedProp || !data.props[selectedProp]) return [];
    const info = data.props[selectedProp];
    const total = info.totalUsages || 0;

    return Object.entries(info.values || {})
      .map(([value, count]) => ({
        _key: value,
        value,
        count,
        percent: pct(count, total).toFixed(1) + "%",
      }))
      .sort((a, b) => b.count - a.count);
  }, [selectedProp, data]);

  // ── References (paginated) ────────────────────────────────────────────────

  const references = data.references || [];
  const totalRefPages = Math.ceil(references.length / REFS_PER_PAGE);
  const visibleRefs = references.slice(
    refsPage * REFS_PER_PAGE,
    (refsPage + 1) * REFS_PER_PAGE,
  );

  const refRows = visibleRefs.map((ref, idx) => ({
    _key: `${ref.codebase}:${ref.file}:${ref.line}:${idx}`,
    codebase: ref.codebase,
    file: ref.file,
    line: ref.line,
  }));

  // ── Codebase breakdown ────────────────────────────────────────────────────

  const codebaseEntries = Object.entries(data.codebaseInstances || {}).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <Stack space={5}>
      {/* ── Back button + Title ──────────────────────────────────────── */}
      <Flex gap={3} align="center">
        <Button
          icon={ArrowLeftIcon}
          mode="ghost"
          onClick={() => onNavigate("components")}
          aria-label="Back to Components"
        />
        <Stack space={2}>
          <Heading size={3}>&lt;{data.component} /&gt;</Heading>
          <Text size={1} muted>
            {data.library || LIBRARY_NAME} · {data.uniqueProps} unique props ·{" "}
            {data.avgPropsPerInstance} avg props per use
          </Text>
        </Stack>
      </Flex>

      {/* ── Key stats ────────────────────────────────────────────────── */}
      <Grid columns={[1, 2, 4]} gap={3}>
        <StatCard
          label="File Imports"
          value={data.totalImports}
          detail="Files that import this component"
        />
        <StatCard
          label="JSX Instances"
          value={data.totalInstances}
          tone="primary"
          detail="Total <Component> occurrences"
        />
        <StatCard
          label="Unique Props"
          value={data.uniqueProps}
          detail="Distinct prop names used"
        />
        <StatCard
          label="Avg Props / Instance"
          value={data.avgPropsPerInstance}
          detail="Average prop count per render"
        />
      </Grid>

      {/* ── Per-codebase breakdown ────────────────────────────────────── */}
      {codebaseEntries.length > 0 && (
        <Card padding={4} radius={2} shadow={1}>
          <Stack space={4}>
            <Heading size={1}>Instances by Codebase</Heading>
            <Stack space={2}>
              {codebaseEntries.map(([cb, count]) => (
                <LabelledBar
                  key={cb}
                  label={cb}
                  percent={pct(count, data.totalInstances)}
                  tone="primary"
                  count={count}
                />
              ))}
            </Stack>
            {data.codebaseImports && (
              <Flex gap={2} wrap="wrap">
                {Object.entries(data.codebaseImports)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cb, count]) => (
                    <Badge key={cb} tone="default" size={0}>
                      {cb}: {count} imports
                    </Badge>
                  ))}
              </Flex>
            )}
          </Stack>
        </Card>
      )}

      {/* ── Prop usage table ──────────────────────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>Prop Usage</Heading>
          <Text size={1} muted>
            Click a row to see the value distribution for that prop.
          </Text>
          <DataTable
            columns={[
              {
                key: "name",
                label: "Prop",
                flex: 3,
                render: (val, row) => (
                  <Flex gap={2} align="center">
                    <Text
                      size={1}
                      weight={selectedProp === val ? "bold" : "regular"}
                    >
                      {val}
                    </Text>
                    {selectedProp === val && (
                      <Badge tone="primary" size={0}>
                        selected
                      </Badge>
                    )}
                  </Flex>
                ),
              },
              { key: "usages", label: "Usages", numeric: true, flex: 2 },
              {
                key: "pctOfInstances",
                label: "% of Instances",
                numeric: true,
                flex: 2,
              },
              {
                key: "uniqueValues",
                label: "Unique Values",
                numeric: true,
                flex: 2,
              },
              {
                key: "topValues",
                label: "Top Values",
                flex: 5,
                render: (val) => (
                  <Text size={0} muted textOverflow="ellipsis">
                    {val || "—"}
                  </Text>
                ),
              },
            ]}
            rows={propRows}
            defaultSortKey="usages"
            onRowClick={(row) =>
              setSelectedProp(selectedProp === row.name ? null : row.name)
            }
            emptyText="No props recorded"
          />
        </Stack>
      </Card>

      {/* ── Prop value detail (when a prop is selected) ───────────────── */}
      {selectedProp && (
        <Card padding={4} radius={2} shadow={1} tone="primary">
          <Stack space={4}>
            <Flex justify="space-between" align="center">
              <Stack space={2}>
                <Heading size={1}>
                  Values for <code>{selectedProp}</code>
                </Heading>
                <Text size={1} muted>
                  {data.props[selectedProp].totalUsages} total usages across{" "}
                  {valueRows.length} distinct values
                </Text>
              </Stack>
              <Button
                text="Close"
                mode="ghost"
                tone="default"
                onClick={() => setSelectedProp(null)}
              />
            </Flex>

            <Stack space={2}>
              {valueRows.slice(0, 20).map((row) => (
                <LabelledBar
                  key={row.value}
                  label={row.value}
                  percent={pct(row.count, data.props[selectedProp].totalUsages)}
                  tone="primary"
                  count={row.count}
                />
              ))}
              {valueRows.length > 20 && (
                <Text size={1} muted>
                  … and {valueRows.length - 20} more distinct values
                </Text>
              )}
            </Stack>

            {/* Also show as a sortable table for precise numbers */}
            <DataTable
              columns={[
                {
                  key: "value",
                  label: "Value",
                  flex: 4,
                  render: (val) => (
                    <Text size={1}>
                      <code>{val}</code>
                    </Text>
                  ),
                },
                { key: "count", label: "Count", numeric: true, flex: 2 },
                {
                  key: "percent",
                  label: "% of Usages",
                  numeric: true,
                  flex: 2,
                },
              ]}
              rows={valueRows}
              defaultSortKey="count"
            />
          </Stack>
        </Card>
      )}

      {/* ── References table (file + line) ────────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Stack space={2}>
            <Heading size={1}>References</Heading>
            <Text size={1} muted>
              Every JSX instance of &lt;{data.component}&gt; with file path and
              line number.
              {references.length > 0 && ` ${references.length} total.`}
            </Text>
          </Stack>

          <DataTable
            columns={[
              {
                key: "codebase",
                label: "Codebase",
                flex: 2,
                render: (val) => (
                  <Badge tone="primary" size={0}>
                    {val}
                  </Badge>
                ),
              },
              {
                key: "file",
                label: "File",
                flex: 8,
                render: (val) => (
                  <Text
                    size={1}
                    style={{ fontFamily: "monospace", fontSize: 12 }}
                    textOverflow="ellipsis"
                  >
                    {val}
                  </Text>
                ),
              },
              {
                key: "line",
                label: "Line",
                numeric: true,
                flex: 1,
                render: (val) => (
                  <Text size={1} style={{ fontFamily: "monospace" }}>
                    {val}
                  </Text>
                ),
              },
            ]}
            rows={refRows}
            defaultSortKey="file"
            defaultSortDesc={false}
            emptyText="No references recorded"
          />

          {/* ── Pagination ──────────────────────────────────────────── */}
          {totalRefPages > 1 && (
            <Flex gap={2} justify="center" align="center" paddingTop={2}>
              <Button
                text="← Prev"
                mode="ghost"
                disabled={refsPage === 0}
                onClick={() => setRefsPage((p) => Math.max(0, p - 1))}
              />
              <Text size={1} muted>
                Page {refsPage + 1} of {totalRefPages}
              </Text>
              <Button
                text="Next →"
                mode="ghost"
                disabled={refsPage >= totalRefPages - 1}
                onClick={() =>
                  setRefsPage((p) => Math.min(totalRefPages - 1, p + 1))
                }
              />
            </Flex>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
