import { Card, Grid, Heading, Stack, Text, Badge, Flex } from "@sanity/ui";
import { StatCard } from "../components/StatCard.jsx";
import { DataTable } from "../components/DataTable.jsx";
import { BarChart, LabelledBar } from "../components/Bar.jsx";
import { sourcesReport } from "../data.js";

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
 * Sources page — visualises the UI Component Sources report.
 *
 * Shows:
 *   1. Key stat cards (total instances, Sanity UI %, adoption %)
 *   2. Source distribution bar chart
 *   3. Per-codebase summary table
 *   4. Per-codebase distribution bars
 *   5. Top Sanity UI components across all codebases
 *   6. Internal component Sanity UI adoption metrics
 *
 * @param {object} props
 * @param {(page: string) => void} props.onNavigate - Navigate callback.
 */
export function Sources({ onNavigate }) {
  const totals = sourcesReport.totals || {};
  const codebases = sourcesReport.codebases || {};
  const topComponents = sourcesReport.topSanityUIComponents || [];

  const totalInstances = totals.totalInstances || 0;
  const sanityUI = totals.sanityUIInstances || 0;
  const internal = totals.internalInstances || 0;
  const html = totals.nativeHTMLInstances || 0;
  const otherUI = totals.otherUIInstances || 0;
  const files = totals.files || 0;
  const sanityPct = pct(sanityUI, totalInstances);
  const internalPct = pct(internal, totalInstances);
  const htmlPct = pct(html, totalInstances);
  const otherPct = pct(otherUI, totalInstances);

  const filesWithInternal = totals.filesWithInternal || 0;
  const filesWithInternalUsingSanityUI = totals.filesWithInternalUsingSanityUI || 0;
  const adoptionPct = pct(filesWithInternalUsingSanityUI, filesWithInternal);

  // ── Codebase summary rows ───────────────────────────────────────────────

  const codebaseRows = Object.entries(codebases).map(([name, data]) => {
    const sui = data.sanityUI ? data.sanityUI.instances : 0;
    const int = data.internal ? data.internal.instances : 0;
    const htm = data.nativeHTML ? data.nativeHTML.instances : 0;
    const oth = data.otherUI ? data.otherUI.instances : 0;
    const tot = data.total ? data.total.instances : 0;

    return {
      _key: name,
      codebase: name,
      files: data.fileCount || 0,
      sanityUI: sui,
      internal: int,
      html: htm,
      otherUI: oth,
      total: tot,
      sanityPct: pct(sui, tot).toFixed(1) + "%",
    };
  });

  // ── Per-codebase detail rows for the distribution section ──────────────

  const codebaseDistributions = Object.entries(codebases).map(([name, data]) => {
    const sui = data.sanityUI ? data.sanityUI.instances : 0;
    const int = data.internal ? data.internal.instances : 0;
    const htm = data.nativeHTML ? data.nativeHTML.instances : 0;
    const oth = data.otherUI ? data.otherUI.instances : 0;
    const tot = data.total ? data.total.instances : 0;

    return { name, sanityUI: sui, internal: int, html: htm, otherUI: oth, total: tot };
  });

  // ── Top Sanity UI component rows ──────────────────────────────────────

  const topComponentRows = topComponents.map((c) => ({
    _key: c.name,
    component: c.name,
    instances: c.instances,
  }));

  // ── Internal adoption rows ────────────────────────────────────────────

  const adoptionRows = Object.entries(codebases).map(([name, data]) => {
    const adoption = data.internalSanityUIAdoption || {};
    const fwi = adoption.filesWithInternal || 0;
    const fus = adoption.filesUsingSanityUI || 0;
    const ap = adoption.adoptionPercent || 0;

    return {
      _key: name,
      codebase: name,
      filesWithInternal: fwi,
      filesUsingSanityUI: fus,
      adoptionPct: ap.toFixed(1) + "%",
    };
  });

  return (
    <Stack space={5}>
      {/* ── Title ──────────────────────────────────────────────────── */}
      <Stack space={3}>
        <Heading size={3}>UI Component Sources</Heading>
        <Text size={1} muted>
          Classifies every JSX element as Sanity UI, internal, native HTML, or other UI library.
          All numbers are JSX instances, not imports.
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
          detail={`Across ${files.toLocaleString()} files`}
        />
        <StatCard
          label="Sanity UI Adoption"
          value={sanityPct.toFixed(1) + "%"}
          tone="positive"
          detail={`${sanityUI.toLocaleString()} instances`}
        />
        <StatCard
          label="Native HTML Tags"
          value={html}
          tone="caution"
          detail={`${htmlPct.toFixed(1)}% of all JSX`}
        />
        <StatCard
          label="Internal Adoption"
          value={adoptionPct.toFixed(1) + "%"}
          detail={`${filesWithInternalUsingSanityUI} of ${filesWithInternal} files`}
        />
      </Grid>

      {/* ── Aggregate source distribution ──────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>Aggregate Source Distribution</Heading>
          <BarChart
            height={28}
            segments={[
              { label: `Sanity UI (${sanityPct.toFixed(1)}%)`, percent: sanityPct, tone: "primary" },
              { label: `Internal (${internalPct.toFixed(1)}%)`, percent: internalPct, tone: "caution" },
              { label: `HTML Tags (${htmlPct.toFixed(1)}%)`, percent: htmlPct, tone: "critical" },
              { label: `Other UI (${otherPct.toFixed(1)}%)`, percent: otherPct, tone: "default" },
            ]}
          />

          <Grid columns={[2, 4]} gap={3}>
            {[
              { label: "Sanity UI", value: sanityUI, color: "#2276fc" },
              { label: "Internal", value: internal, color: "#f3c948" },
              { label: "HTML Tags", value: html, color: "#f76d6a" },
              { label: "Other UI", value: otherUI, color: "#8690a0" },
            ].map((item) => (
              <Flex key={item.label} gap={2} align="center">
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    backgroundColor: item.color,
                    flexShrink: 0,
                  }}
                />
                <Text size={1}>
                  {item.label} — {item.value.toLocaleString()}
                </Text>
              </Flex>
            ))}
          </Grid>
        </Stack>
      </Card>

      {/* ── Per-codebase summary table ────────────────────────────── */}
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
              { key: "sanityUI", label: "Sanity UI", numeric: true },
              { key: "internal", label: "Internal", numeric: true },
              { key: "html", label: "HTML Tags", numeric: true },
              { key: "otherUI", label: "Other UI", numeric: true },
              { key: "total", label: "Total", numeric: true },
              {
                key: "sanityPct",
                label: "% Sanity UI",
                numeric: true,
                flex: 2,
                render: (val) => (
                  <Badge tone="primary" size={0}>
                    {val}
                  </Badge>
                ),
              },
            ]}
            rows={codebaseRows}
            defaultSortKey="total"
          />
        </Stack>
      </Card>

      {/* ── Per-codebase distribution bars ─────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>Source Distribution by Codebase</Heading>
          {codebaseDistributions.map((cb) => (
            <Stack key={cb.name} space={3}>
              <Flex gap={2} align="center">
                <Text size={1} weight="bold">
                  {cb.name}
                </Text>
                <Text size={0} muted>
                  ({cb.total.toLocaleString()} total instances)
                </Text>
              </Flex>
              <BarChart
                height={20}
                segments={[
                  {
                    label: `Sanity UI (${pct(cb.sanityUI, cb.total).toFixed(1)}%)`,
                    percent: pct(cb.sanityUI, cb.total),
                    tone: "primary",
                  },
                  {
                    label: `Internal (${pct(cb.internal, cb.total).toFixed(1)}%)`,
                    percent: pct(cb.internal, cb.total),
                    tone: "caution",
                  },
                  {
                    label: `HTML (${pct(cb.html, cb.total).toFixed(1)}%)`,
                    percent: pct(cb.html, cb.total),
                    tone: "critical",
                  },
                  {
                    label: `Other (${pct(cb.otherUI, cb.total).toFixed(1)}%)`,
                    percent: pct(cb.otherUI, cb.total),
                    tone: "default",
                  },
                ]}
              />
            </Stack>
          ))}
        </Stack>
      </Card>

      {/* ── Top Sanity UI components ──────────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>Top Sanity UI Components (All Codebases)</Heading>
          <Text size={1} muted>
            Click a row to view the full component detail.
          </Text>
          <DataTable
            columns={[
              {
                key: "component",
                label: "Component",
                flex: 3,
                render: (val) => (
                  <Text size={1} weight="bold" style={{ color: "var(--card-focus-ring-color)" }}>
                    {val}
                  </Text>
                ),
              },
              { key: "instances", label: "Instances", numeric: true, flex: 2 },
            ]}
            rows={topComponentRows}
            defaultSortKey="instances"
            onRowClick={(row) => onNavigate(`component/${row.component}`)}
          />
        </Stack>
      </Card>

      {/* ── Internal component Sanity UI adoption ─────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>Internal Component Sanity UI Adoption</Heading>
          <Text size={1} muted>
            What percentage of files with internal/local component imports also use Sanity UI
            components, indicating Sanity UI adoption in custom code.
          </Text>

          {/* Aggregate adoption bar */}
          <LabelledBar
            label="All codebases"
            percent={adoptionPct}
            tone="primary"
            count={`${filesWithInternalUsingSanityUI} / ${filesWithInternal}`}
          />

          {/* Per-codebase adoption table */}
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
              { key: "filesWithInternal", label: "Files w/ Internal", numeric: true, flex: 2 },
              { key: "filesUsingSanityUI", label: "Also Using Sanity UI", numeric: true, flex: 2 },
              {
                key: "adoptionPct",
                label: "Adoption %",
                numeric: true,
                flex: 2,
                render: (val) => (
                  <Badge tone="positive" size={0}>
                    {val}
                  </Badge>
                ),
              },
            ]}
            rows={adoptionRows}
            defaultSortKey="filesWithInternal"
          />
        </Stack>
      </Card>
    </Stack>
  );
}
