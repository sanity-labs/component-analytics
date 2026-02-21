import { Box, Card, Flex, Grid, Heading, Stack, Text, Badge } from "@sanity/ui";
import { StatCard } from "../components/StatCard.jsx";
import { DataTable } from "../components/DataTable.jsx";
import { BarChart, LabelledBar, TONE_COLORS } from "../components/Bar.jsx";
import {
  perComponentSummary,
  sourcesReport,
  htmlTagsReport,
  customizationsReport,
  libraryNames,
  LIBRARY_NAME,
  PRIMARY_LIBRARY_NAME,
} from "../data.js";

/**
 * Compute a percentage safely, returning 0 when the denominator is 0.
 *
 * @param {number} n - Numerator.
 * @param {number} d - Denominator.
 * @returns {number}
 */
function pct(n, d) {
  return d === 0 ? 0 : (n / d) * 100;
}

/**
 * Overview page — the landing page of the dashboard.
 *
 * Displays:
 *   1. High-level stat cards (files, components, instances, etc.)
 *   2. Source distribution bar chart (per-library vs Internal vs HTML vs Other)
 *   3. Top 15 components by JSX instances (sortable table)
 *   4. Customization summary (inline styles vs styled())
 *   5. Per-codebase breakdown
 *
 * @param {object} props
 * @param {(page: string) => void} props.onNavigate - Navigate to another page.
 */
export function Overview({ onNavigate }) {
  const LIBRARY_TONES = ["primary", "positive", "purple", "cyan", "magenta"];
  const libTone = (idx) => LIBRARY_TONES[idx % LIBRARY_TONES.length];
  const libColor = (idx) => TONE_COLORS[libTone(idx)] || TONE_COLORS.default;

  const totals = sourcesReport.totals || {};
  const totalInstances = totals.totalInstances || 0;
  const libInstances = totals.libraryInstances || {};
  const totalLibrary = totals.totalLibraryInstances || 0;
  const internal = totals.internalInstances || 0;
  const html = totals.nativeHTMLInstances || 0;
  const otherUI = totals.otherUIInstances || 0;

  const libPcts = libraryNames.map((name) => ({
    name,
    instances: libInstances[name] || 0,
    pct: pct(libInstances[name] || 0, totalInstances),
  }));
  const totalLibraryPct = pct(totalLibrary, totalInstances);
  const internalPct = pct(internal, totalInstances);
  const htmlPct = pct(html, totalInstances);
  const otherPct = pct(otherUI, totalInstances);

  // Customization totals
  let totalInline = 0;
  let totalStyled = 0;
  if (customizationsReport && customizationsReport.codebases) {
    for (const cb of Object.values(customizationsReport.codebases)) {
      totalInline += cb.inlineStyleCount || 0;
      totalStyled += cb.styledCount || 0;
    }
  }

  // HTML tag total
  const htmlAggregate = htmlTagsReport.aggregate || {};
  const totalHTMLInstances = htmlAggregate.totalInstances || 0;
  const uniqueTags = htmlAggregate.uniqueTags || 0;

  // Per-component data for the top table
  const components = (perComponentSummary.components || []).map((c) => ({
    _key: c.component,
    component: c.component,
    instances: c.totalInstances,
    imports: c.totalImports,
    uniqueProps: c.uniqueProps,
    topProps: (c.topProps || [])
      .slice(0, 3)
      .map((p) => `${p.name}(${p.usages})`)
      .join(", "),
  }));

  // Codebase breakdown rows
  const codebaseRows = Object.entries(sourcesReport.codebases || {}).map(
    ([name, data]) => {
      const row = {
        _key: name,
        codebase: name,
        files: data.fileCount,
        internal: data.internal ? data.internal.instances : 0,
        html: data.nativeHTML ? data.nativeHTML.instances : 0,
        total: data.total ? data.total.instances : 0,
      };
      let libTotal = 0;
      for (const libName of libraryNames) {
        const count = data.libraries?.[libName]?.instances || 0;
        row[`lib_${libName}`] = count;
        libTotal += count;
      }
      row.libTotal = libTotal;
      row.libPct =
        row.total > 0
          ? ((libTotal / row.total) * 100).toFixed(1) + "%"
          : "0.0%";
      return row;
    },
  );

  return (
    <Stack space={5}>
      {/* ── Title ──────────────────────────────────────────────────── */}
      <Stack space={3}>
        <Heading size={3}>Overview</Heading>
        <Text size={1} muted>
          High-level analysis across{" "}
          {Object.keys(sourcesReport.codebases || {}).length} codebases
          {sourcesReport.generatedAt &&
            ` · Generated ${new Date(sourcesReport.generatedAt).toLocaleDateString()}`}
        </Text>
      </Stack>

      {/* ── Stat cards ─────────────────────────────────────────────── */}
      <Grid columns={[1, 2, 4]} gap={3}>
        <StatCard
          label="Total JSX Instances"
          value={totalInstances}
          tone="primary"
          detail={`${perComponentSummary.totalComponents || 0} unique ${LIBRARY_NAME} components`}
        />
        {libPcts.map((lib, idx) => (
          <StatCard
            key={lib.name}
            label={`${lib.name} Instances`}
            value={lib.instances}
            tone={libTone(idx)}
            detail={`${lib.pct.toFixed(1)}% of all JSX`}
          />
        ))}
        <StatCard
          label="Native HTML Tags"
          value={totalHTMLInstances}
          tone="caution"
          detail={`${uniqueTags} unique tags`}
        />
        <StatCard
          label="Customizations"
          value={totalInline + totalStyled}
          tone="critical"
          detail={`${totalInline} inline · ${totalStyled} styled()`}
        />
      </Grid>

      {/* ── Source Distribution ─────────────────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>JSX Element Source Distribution</Heading>

          <BarChart
            height={28}
            segments={[
              ...libPcts.map((lib, idx) => ({
                label: `${lib.name} (${lib.pct.toFixed(1)}%)`,
                percent: lib.pct,
                tone: libTone(idx),
              })),
              {
                label: `Internal (${internalPct.toFixed(1)}%)`,
                percent: internalPct,
                tone: "caution",
              },
              {
                label: `HTML (${htmlPct.toFixed(1)}%)`,
                percent: htmlPct,
                tone: "critical",
              },
              {
                label: `Other (${otherPct.toFixed(1)}%)`,
                percent: otherPct,
                tone: "default",
              },
            ]}
          />

          <Grid columns={[2, 4]} gap={3}>
            {libPcts.map((lib, idx) => (
              <Flex key={lib.name} gap={2} align="center">
                <Box
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    backgroundColor: libColor(idx),
                  }}
                />
                <Text size={1}>
                  {lib.name} — {lib.instances.toLocaleString()}
                </Text>
              </Flex>
            ))}
            <Flex gap={2} align="center">
              <Box
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: TONE_COLORS.caution,
                }}
              />
              <Text size={1}>Internal — {internal.toLocaleString()}</Text>
            </Flex>
            <Flex gap={2} align="center">
              <Box
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: TONE_COLORS.critical,
                }}
              />
              <Text size={1}>HTML — {html.toLocaleString()}</Text>
            </Flex>
            <Flex gap={2} align="center">
              <Box
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: TONE_COLORS.default,
                }}
              />
              <Text size={1}>Other — {otherUI.toLocaleString()}</Text>
            </Flex>
          </Grid>
        </Stack>
      </Card>

      {/* ── Per-Codebase Breakdown ─────────────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>Per-Codebase Breakdown</Heading>
          <DataTable
            columns={[
              { key: "codebase", label: "Codebase", flex: 2 },
              { key: "files", label: "Files", numeric: true },
              ...libraryNames.map((libName) => ({
                key: `lib_${libName}`,
                label: libName,
                numeric: true,
              })),
              { key: "internal", label: "Internal", numeric: true },
              { key: "html", label: "HTML Tags", numeric: true },
              { key: "total", label: "Total", numeric: true },
              {
                key: "libPct",
                label: `% ${LIBRARY_NAME}`,
                numeric: true,
              },
            ]}
            rows={codebaseRows}
            defaultSortKey="total"
          />
        </Stack>
      </Card>

      {/* ── Top Components ─────────────────────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Flex justify="space-between" align="center">
            <Heading size={1}>Top 15 Components by Instances</Heading>
            <Card
              as="button"
              padding={2}
              radius={2}
              tone="primary"
              onClick={() => onNavigate("components")}
              style={{
                cursor: "pointer",
                border: "none",
                background: "transparent",
              }}
            >
              <Text
                size={1}
                weight="bold"
                style={{ color: "var(--card-focus-ring-color)" }}
              >
                View all →
              </Text>
            </Card>
          </Flex>
          <DataTable
            columns={[
              {
                key: "component",
                label: "Component",
                flex: 2,
                render: (val) => (
                  <Text size={1} weight="bold">
                    {val}
                  </Text>
                ),
              },
              { key: "instances", label: "Instances", numeric: true },
              { key: "imports", label: "Imports", numeric: true },
              { key: "uniqueProps", label: "Unique Props", numeric: true },
              { key: "topProps", label: "Top Props", flex: 3 },
            ]}
            rows={components}
            defaultSortKey="instances"
            maxRows={15}
            onRowClick={(row) => onNavigate(`component/${row.component}`)}
          />
        </Stack>
      </Card>

      {/* ── Customizations Quick View ─────────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Flex justify="space-between" align="center">
            <Heading size={1}>{LIBRARY_NAME} Customizations</Heading>
            <Card
              as="button"
              padding={2}
              radius={2}
              onClick={() => onNavigate("customizations")}
              style={{
                cursor: "pointer",
                border: "none",
                background: "transparent",
              }}
            >
              <Text
                size={1}
                weight="bold"
                style={{ color: "var(--card-focus-ring-color)" }}
              >
                View details →
              </Text>
            </Card>
          </Flex>
          <Grid columns={[1, 2]} gap={3}>
            <StatCard label="Inline style= props" value={totalInline} />
            <StatCard label="styled() wrappers" value={totalStyled} />
          </Grid>
          <LabelledBar
            label="Inline styles"
            percent={pct(totalInline, totalInline + totalStyled)}
            tone="caution"
            count={totalInline}
          />
          <LabelledBar
            label="styled() wrappers"
            percent={pct(totalStyled, totalInline + totalStyled)}
            tone="critical"
            count={totalStyled}
          />
        </Stack>
      </Card>

      {/* ── HTML Tags Quick View ───────────────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Flex justify="space-between" align="center">
            <Heading size={1}>Top HTML Tags</Heading>
            <Card
              as="button"
              padding={2}
              radius={2}
              onClick={() => onNavigate("html-tags")}
              style={{
                cursor: "pointer",
                border: "none",
                background: "transparent",
              }}
            >
              <Text
                size={1}
                weight="bold"
                style={{ color: "var(--card-focus-ring-color)" }}
              >
                View all →
              </Text>
            </Card>
          </Flex>
          <Stack space={2}>
            {(htmlAggregate.topTags || []).slice(0, 10).map((t) => (
              <LabelledBar
                key={t.tag}
                label={`<${t.tag}>`}
                percent={pct(t.count, totalHTMLInstances)}
                tone="default"
                count={t.count}
              />
            ))}
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}
