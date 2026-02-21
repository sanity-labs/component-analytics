import { Card, Grid, Heading, Stack, Text, Badge, Flex } from "@sanity/ui";
import { StatCard } from "../components/StatCard.jsx";
import { DataTable } from "../components/DataTable.jsx";
import { LabelledBar, BarChart } from "../components/Bar.jsx";
import { customizationsReport, PRIMARY_LIBRARY_NAME } from "../data.js";

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
 * Customizations page — visualises how often tracked-library components
 * receive inline `style` props or are wrapped with `styled()`.
 *
 * Shows:
 *   1. Key stat cards (total inline, styled, grand total)
 *   2. Inline vs styled() split bar
 *   3. Per-codebase breakdown
 *   4. Per-component tables (inline styles and styled() separately)
 *   5. Top CSS properties for both categories
 *
 * @param {object} props
 * @param {(page: string) => void} props.onNavigate - Navigate callback.
 */
export function Customizations({ onNavigate }) {
  const codebases = customizationsReport.codebases || {};

  // ── Aggregate totals ──────────────────────────────────────────────────
  let totalInline = 0;
  let totalStyled = 0;
  let totalFiles = 0;
  let totalFilesWithCustomizations = 0;

  /** @type {Object<string, number>} */
  const allInlineByComp = {};
  /** @type {Object<string, number>} */
  const allStyledByComp = {};
  /** @type {Object<string, number>} */
  const allInlineProps = {};
  /** @type {Object<string, number>} */
  const allStyledProps = {};

  for (const data of Object.values(codebases)) {
    totalInline += data.inlineStyleCount || 0;
    totalStyled += data.styledCount || 0;
    totalFiles += data.totalFiles || 0;
    totalFilesWithCustomizations += data.filesWithCustomizations || 0;

    // Aggregate inline by component
    if (data.inlineStylesByComponent) {
      for (const [comp, count] of Object.entries(
        data.inlineStylesByComponent,
      )) {
        allInlineByComp[comp] = (allInlineByComp[comp] || 0) + count;
      }
    }

    // Aggregate styled by component
    if (data.styledByComponent) {
      for (const [comp, count] of Object.entries(data.styledByComponent)) {
        allStyledByComp[comp] = (allStyledByComp[comp] || 0) + count;
      }
    }

    // Aggregate inline CSS properties
    if (data.topInlineProperties) {
      for (const item of data.topInlineProperties) {
        allInlineProps[item.property] =
          (allInlineProps[item.property] || 0) + item.count;
      }
    }

    // Aggregate styled CSS properties
    if (data.topStyledProperties) {
      for (const item of data.topStyledProperties) {
        allStyledProps[item.property] =
          (allStyledProps[item.property] || 0) + item.count;
      }
    }
  }

  const grandTotal = totalInline + totalStyled;

  // ── Inline by component rows ──────────────────────────────────────────

  const inlineCompRows = Object.entries(allInlineByComp)
    .sort((a, b) => b[1] - a[1])
    .map(([comp, count]) => ({
      _key: comp,
      component: comp,
      count,
      percent: pct(count, totalInline).toFixed(1) + "%",
    }));

  // ── Styled by component rows ──────────────────────────────────────────

  const styledCompRows = Object.entries(allStyledByComp)
    .sort((a, b) => b[1] - a[1])
    .map(([comp, count]) => ({
      _key: comp,
      component: comp,
      count,
      percent: pct(count, totalStyled).toFixed(1) + "%",
    }));

  // ── Inline property rows ──────────────────────────────────────────────

  const inlinePropRows = Object.entries(allInlineProps)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([prop, count]) => ({
      _key: prop,
      property: prop,
      count,
    }));

  // ── Styled property rows ──────────────────────────────────────────────

  const styledPropRows = Object.entries(allStyledProps)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([prop, count]) => ({
      _key: prop,
      property: prop,
      count,
    }));

  // ── Per-codebase rows ─────────────────────────────────────────────────

  const codebaseRows = Object.entries(codebases).map(([name, data]) => ({
    _key: name,
    codebase: name,
    files: data.totalFiles || 0,
    filesWithCustomizations: data.filesWithCustomizations || 0,
    inline: data.inlineStyleCount || 0,
    styled: data.styledCount || 0,
    total: data.totalCustomizations || 0,
    inlinePct:
      data.totalCustomizations > 0
        ? pct(data.inlineStyleCount || 0, data.totalCustomizations).toFixed(1) +
          "%"
        : "0.0%",
  }));

  // ── Combined component view (inline + styled side by side) ────────────

  const allComponents = new Set([
    ...Object.keys(allInlineByComp),
    ...Object.keys(allStyledByComp),
  ]);

  const combinedRows = [...allComponents]
    .map((comp) => {
      const inline = allInlineByComp[comp] || 0;
      const styled = allStyledByComp[comp] || 0;
      return {
        _key: comp,
        component: comp,
        inline,
        styled,
        total: inline + styled,
      };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <Stack space={5}>
      {/* ── Title ──────────────────────────────────────────────────── */}
      <Stack space={3}>
        <Heading size={3}>{PRIMARY_LIBRARY_NAME} Customizations</Heading>
        <Text size={1} muted>
          Measures how often {PRIMARY_LIBRARY_NAME} components receive inline{" "}
          <code>style</code> props or are wrapped with <code>styled()</code>.
          {customizationsReport.generatedAt &&
            ` · Generated ${new Date(customizationsReport.generatedAt).toLocaleDateString()}`}
        </Text>
      </Stack>

      {/* ── Stat cards ─────────────────────────────────────────────── */}
      <Grid columns={[1, 2, 4]} gap={3}>
        <StatCard
          label="Total Customizations"
          value={grandTotal}
          tone="critical"
          detail={`${totalFilesWithCustomizations} files affected`}
        />
        <StatCard
          label="Inline style= Props"
          value={totalInline}
          tone="caution"
          detail={`${pct(totalInline, grandTotal).toFixed(1)}% of all customizations`}
        />
        <StatCard
          label="styled() Wrappers"
          value={totalStyled}
          tone="primary"
          detail={`${pct(totalStyled, grandTotal).toFixed(1)}% of all customizations`}
        />
        <StatCard
          label="Files Analysed"
          value={totalFiles}
          detail={`${pct(totalFilesWithCustomizations, totalFiles).toFixed(1)}% have customizations`}
        />
      </Grid>

      {/* ── Inline vs styled() split ──────────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>Inline Styles vs styled() Distribution</Heading>
          <BarChart
            height={28}
            segments={[
              {
                label: `Inline style= (${pct(totalInline, grandTotal).toFixed(1)}%)`,
                percent: pct(totalInline, grandTotal),
                tone: "caution",
              },
              {
                label: `styled() (${pct(totalStyled, grandTotal).toFixed(1)}%)`,
                percent: pct(totalStyled, grandTotal),
                tone: "primary",
              },
            ]}
          />
          <Grid columns={[1, 2]} gap={3}>
            <Flex gap={2} align="center">
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: "#f3c948",
                  flexShrink: 0,
                }}
              />
              <Text size={1}>
                Inline style= — {totalInline.toLocaleString()} occurrences
              </Text>
            </Flex>
            <Flex gap={2} align="center">
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: "#2276fc",
                  flexShrink: 0,
                }}
              />
              <Text size={1}>
                styled() — {totalStyled.toLocaleString()} occurrences
              </Text>
            </Flex>
          </Grid>
        </Stack>
      </Card>

      {/* ── Per-codebase summary ──────────────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>Per-Codebase Summary</Heading>
          <DataTable
            columns={[
              {
                key: "codebase",
                label: "Codebase",
                flex: 2,
                render: (val) => (
                  <Text size={1} weight="bold">
                    {val}
                  </Text>
                ),
              },
              { key: "files", label: "Files", numeric: true },
              {
                key: "filesWithCustomizations",
                label: "Files Affected",
                numeric: true,
                flex: 2,
              },
              { key: "inline", label: "Inline", numeric: true },
              { key: "styled", label: "styled()", numeric: true },
              { key: "total", label: "Total", numeric: true },
              {
                key: "inlinePct",
                label: "% Inline",
                numeric: true,
                flex: 2,
              },
            ]}
            rows={codebaseRows}
            defaultSortKey="total"
          />

          {/* Per-codebase distribution bars */}
          <Stack space={3} paddingTop={2}>
            {codebaseRows.map((row) => (
              <Stack key={row.codebase} space={2}>
                <Flex gap={2} align="center">
                  <Text size={1} weight="bold">
                    {row.codebase}
                  </Text>
                  <Text size={0} muted>
                    ({row.total.toLocaleString()} total)
                  </Text>
                </Flex>
                <BarChart
                  height={16}
                  segments={[
                    {
                      label: `Inline (${pct(row.inline, row.total).toFixed(1)}%)`,
                      percent: pct(row.inline, row.total),
                      tone: "caution",
                    },
                    {
                      label: `styled() (${pct(row.styled, row.total).toFixed(1)}%)`,
                      percent: pct(row.styled, row.total),
                      tone: "primary",
                    },
                  ]}
                />
              </Stack>
            ))}
          </Stack>
        </Stack>
      </Card>

      {/* ── Combined component table ──────────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>Customizations by Component</Heading>
          <Text size={1} muted>
            Click a component name to view its full detail page.
          </Text>
          <DataTable
            columns={[
              {
                key: "component",
                label: "Component",
                flex: 3,
                render: (val) => (
                  <Text
                    size={1}
                    weight="bold"
                    style={{
                      color: "var(--card-focus-ring-color)",
                      cursor: "pointer",
                    }}
                  >
                    {val}
                  </Text>
                ),
              },
              { key: "inline", label: "Inline style=", numeric: true, flex: 2 },
              { key: "styled", label: "styled()", numeric: true, flex: 2 },
              { key: "total", label: "Total", numeric: true, flex: 2 },
            ]}
            rows={combinedRows}
            defaultSortKey="total"
            onRowClick={(row) => onNavigate(`component/${row.component}`)}
          />
        </Stack>
      </Card>

      {/* ── Inline styles by component (bars) ─────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>Inline style= by Component</Heading>
          {inlineCompRows.length === 0 ? (
            <Text size={1} muted>
              No inline styles found.
            </Text>
          ) : (
            <Stack space={2}>
              {inlineCompRows.slice(0, 15).map((row) => (
                <LabelledBar
                  key={row.component}
                  label={row.component}
                  percent={pct(row.count, totalInline)}
                  tone="caution"
                  count={row.count}
                />
              ))}
              {inlineCompRows.length > 15 && (
                <Text size={1} muted>
                  … and {inlineCompRows.length - 15} more components
                </Text>
              )}
            </Stack>
          )}
        </Stack>
      </Card>

      {/* ── styled() by component (bars) ──────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>styled() by Component</Heading>
          {styledCompRows.length === 0 ? (
            <Text size={1} muted>
              No styled() wrappers found.
            </Text>
          ) : (
            <Stack space={2}>
              {styledCompRows.slice(0, 15).map((row) => (
                <LabelledBar
                  key={row.component}
                  label={row.component}
                  percent={pct(row.count, totalStyled)}
                  tone="primary"
                  count={row.count}
                />
              ))}
              {styledCompRows.length > 15 && (
                <Text size={1} muted>
                  … and {styledCompRows.length - 15} more components
                </Text>
              )}
            </Stack>
          )}
        </Stack>
      </Card>

      {/* ── Top inline CSS properties ─────────────────────────────── */}
      <Grid columns={[1, 1, 2]} gap={4}>
        <Card padding={4} radius={2} shadow={1}>
          <Stack space={4}>
            <Heading size={1}>Top Inline Style Properties</Heading>
            {inlinePropRows.length === 0 ? (
              <Text size={1} muted>
                No inline style properties found.
              </Text>
            ) : (
              <>
                <Stack space={2}>
                  {inlinePropRows.slice(0, 10).map((row) => (
                    <LabelledBar
                      key={row.property}
                      label={row.property}
                      percent={pct(row.count, inlinePropRows[0].count)}
                      tone="caution"
                      count={row.count}
                    />
                  ))}
                </Stack>
                <DataTable
                  columns={[
                    {
                      key: "property",
                      label: "Property",
                      flex: 3,
                      render: (val) => (
                        <Text size={1}>
                          <code>{val}</code>
                        </Text>
                      ),
                    },
                    { key: "count", label: "Count", numeric: true, flex: 2 },
                  ]}
                  rows={inlinePropRows}
                  defaultSortKey="count"
                />
              </>
            )}
          </Stack>
        </Card>

        {/* ── Top styled() CSS properties ─────────────────────────── */}
        <Card padding={4} radius={2} shadow={1}>
          <Stack space={4}>
            <Heading size={1}>Top styled() CSS Properties</Heading>
            {styledPropRows.length === 0 ? (
              <Text size={1} muted>
                No styled() CSS properties found.
              </Text>
            ) : (
              <>
                <Stack space={2}>
                  {styledPropRows.slice(0, 10).map((row) => (
                    <LabelledBar
                      key={row.property}
                      label={row.property}
                      percent={pct(row.count, styledPropRows[0].count)}
                      tone="primary"
                      count={row.count}
                    />
                  ))}
                </Stack>
                <DataTable
                  columns={[
                    {
                      key: "property",
                      label: "Property",
                      flex: 3,
                      render: (val) => (
                        <Text size={1}>
                          <code>{val}</code>
                        </Text>
                      ),
                    },
                    { key: "count", label: "Count", numeric: true, flex: 2 },
                  ]}
                  rows={styledPropRows}
                  defaultSortKey="count"
                />
              </>
            )}
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}
