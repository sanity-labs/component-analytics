import { Card, Grid, Heading, Stack, Text, Badge, Flex, Box } from "@sanity/ui";
import { StatCard } from "../components/StatCard.jsx";
import { DataTable } from "../components/DataTable.jsx";
import { BarChart, LabelledBar, TONE_COLORS } from "../components/Bar.jsx";
import { sourcesReport, libraryNames, LIBRARY_NAME } from "../data.js";

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
 * Assign a tone to each library by index so colours are stable.
 *
 * @type {string[]}
 */
const LIBRARY_TONES = ["primary", "positive", "purple", "cyan", "magenta"];

/**
 * Return a tone for the given library index.
 *
 * @param {number} idx
 * @returns {string}
 */
function libTone(idx) {
  return LIBRARY_TONES[idx % LIBRARY_TONES.length];
}

/**
 * Return the CSS colour for a library tone.
 *
 * @param {number} idx
 * @returns {string}
 */
function libColor(idx) {
  return TONE_COLORS[libTone(idx)] || TONE_COLORS.default;
}

/**
 * Sources page — visualises the UI Component Sources report.
 *
 * Shows:
 *   1. Key stat cards (total instances, per-library instances, adoption %)
 *   2. Source distribution bar chart (one segment per library + internal + HTML + other)
 *   3. Per-codebase summary table
 *   4. Per-codebase distribution bars
 *   5. Top components for each library
 *   6. Internal component adoption metrics per library
 *
 * @param {object} props
 * @param {(page: string) => void} props.onNavigate - Navigate callback.
 */
export function Sources({ onNavigate }) {
  const totals = sourcesReport.totals || {};
  const codebases = sourcesReport.codebases || {};
  const topByLibrary = sourcesReport.topComponentsByLibrary || {};

  const totalInstances = totals.totalInstances || 0;
  const totalLibrary = totals.totalLibraryInstances || 0;
  const libInstances = totals.libraryInstances || {};
  const internal = totals.internalInstances || 0;
  const html = totals.nativeHTMLInstances || 0;
  const otherUI = totals.otherUIInstances || 0;
  const files = totals.files || 0;

  const totalLibraryPct = pct(totalLibrary, totalInstances);
  const internalPct = pct(internal, totalInstances);
  const htmlPct = pct(html, totalInstances);
  const otherPct = pct(otherUI, totalInstances);

  const filesWithInternal = totals.filesWithInternal || 0;
  const filesWithInternalUsingAny =
    totals.filesWithInternalUsingAnyLibrary || 0;
  const overallAdoptionPct = pct(filesWithInternalUsingAny, filesWithInternal);

  // ── Per-library percentage of totalInstances ────────────────────────
  const libPcts = libraryNames.map((name) => ({
    name,
    instances: libInstances[name] || 0,
    pct: pct(libInstances[name] || 0, totalInstances),
  }));

  // ── Codebase summary rows ─────────────────────────────────────────
  const codebaseRows = Object.entries(codebases).map(([name, data]) => {
    const row = {
      _key: name,
      codebase: name,
      files: data.fileCount || 0,
      internal: data.internal ? data.internal.instances : 0,
      html: data.nativeHTML ? data.nativeHTML.instances : 0,
      otherUI: data.otherUI ? data.otherUI.instances : 0,
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
      row.total > 0 ? ((libTotal / row.total) * 100).toFixed(1) + "%" : "0.0%";
    return row;
  });

  // ── Per-codebase distribution data ────────────────────────────────
  const codebaseDistributions = Object.entries(codebases).map(
    ([name, data]) => {
      const libs = {};
      for (const libName of libraryNames) {
        libs[libName] = data.libraries?.[libName]?.instances || 0;
      }
      return {
        name,
        libs,
        internal: data.internal ? data.internal.instances : 0,
        html: data.nativeHTML ? data.nativeHTML.instances : 0,
        otherUI: data.otherUI ? data.otherUI.instances : 0,
        total: data.total ? data.total.instances : 0,
      };
    },
  );

  // ── Adoption rows (per library) ───────────────────────────────────
  const adoptionRows = Object.entries(codebases).map(([name, data]) => {
    const row = {
      _key: name,
      codebase: name,
      filesWithInternal: data.internalAdoption
        ? Object.values(data.internalAdoption)[0]?.filesWithInternal || 0
        : 0,
    };
    for (const libName of libraryNames) {
      const adoption = data.internalAdoption?.[libName] || {};
      row[`adopt_${libName}`] = adoption.filesUsingLibrary || 0;
      row[`adoptPct_${libName}`] =
        (adoption.adoptionPercent || 0).toFixed(1) + "%";
    }
    return row;
  });

  return (
    <Stack space={5}>
      {/* ── Title ──────────────────────────────────────────────────── */}
      <Stack space={3}>
        <Heading size={3}>UI Component Sources</Heading>
        <Text size={1} muted>
          Classifies every JSX element by library, internal, native HTML, or
          other UI. All numbers are JSX instances, not imports.
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
        {libPcts.map((lib, idx) => (
          <StatCard
            key={lib.name}
            label={`${lib.name}`}
            value={lib.instances}
            tone={libTone(idx)}
            detail={`${lib.pct.toFixed(1)}% of all JSX`}
          />
        ))}
        <StatCard
          label="Native HTML Tags"
          value={html}
          tone="caution"
          detail={`${htmlPct.toFixed(1)}% of all JSX`}
        />
        <StatCard
          label="Internal Adoption"
          value={overallAdoptionPct.toFixed(1) + "%"}
          detail={`${filesWithInternalUsingAny} of ${filesWithInternal} files`}
        />
      </Grid>

      {/* ── Aggregate source distribution ──────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>Aggregate Source Distribution</Heading>
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
                label: `HTML Tags (${htmlPct.toFixed(1)}%)`,
                percent: htmlPct,
                tone: "critical",
              },
              {
                label: `Other UI (${otherPct.toFixed(1)}%)`,
                percent: otherPct,
                tone: "default",
              },
            ]}
          />

          <Grid columns={[2, 4]} gap={3}>
            {libPcts.map((lib, idx) => (
              <Flex key={lib.name} gap={2} align="center">
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    backgroundColor: libColor(idx),
                    flexShrink: 0,
                  }}
                />
                <Text size={1}>
                  {lib.name} — {lib.instances.toLocaleString()}
                </Text>
              </Flex>
            ))}
            <Flex gap={2} align="center">
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: TONE_COLORS.caution,
                  flexShrink: 0,
                }}
              />
              <Text size={1}>Internal — {internal.toLocaleString()}</Text>
            </Flex>
            <Flex gap={2} align="center">
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: TONE_COLORS.critical,
                  flexShrink: 0,
                }}
              />
              <Text size={1}>HTML Tags — {html.toLocaleString()}</Text>
            </Flex>
            <Flex gap={2} align="center">
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: TONE_COLORS.default,
                  flexShrink: 0,
                }}
              />
              <Text size={1}>Other UI — {otherUI.toLocaleString()}</Text>
            </Flex>
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
              ...libraryNames.map((libName) => ({
                key: `lib_${libName}`,
                label: libName,
                numeric: true,
              })),
              { key: "internal", label: "Internal", numeric: true },
              { key: "html", label: "HTML Tags", numeric: true },
              { key: "otherUI", label: "Other UI", numeric: true },
              { key: "total", label: "Total", numeric: true },
              {
                key: "libPct",
                label: `% ${LIBRARY_NAME}`,
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
                  ...libraryNames.map((libName, idx) => ({
                    label: `${libName} (${pct(cb.libs[libName] || 0, cb.total).toFixed(1)}%)`,
                    percent: pct(cb.libs[libName] || 0, cb.total),
                    tone: libTone(idx),
                  })),
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

      {/* ── Top components per library ─────────────────────────────── */}
      {libraryNames.map((libName, idx) => {
        const topComponents = topByLibrary[libName] || [];
        if (topComponents.length === 0) return null;

        const topRows = topComponents.map((c) => ({
          _key: c.name,
          component: c.name,
          instances: c.instances,
        }));

        return (
          <Card key={libName} padding={4} radius={2} shadow={1}>
            <Stack space={4}>
              <Flex gap={3} align="center">
                <Heading size={1}>Top {libName} Components</Heading>
                <Badge tone={libTone(idx)} size={0}>
                  {(libInstances[libName] || 0).toLocaleString()} instances
                </Badge>
              </Flex>
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
                      <Text
                        size={1}
                        weight="bold"
                        style={{ color: "var(--card-focus-ring-color)" }}
                      >
                        {val}
                      </Text>
                    ),
                  },
                  {
                    key: "instances",
                    label: "Instances",
                    numeric: true,
                    flex: 2,
                  },
                ]}
                rows={topRows}
                defaultSortKey="instances"
                onRowClick={(row) => onNavigate(`component/${row.component}`)}
              />
            </Stack>
          </Card>
        );
      })}

      {/* ── Internal component adoption per library ────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>Internal Component Library Adoption</Heading>
          <Text size={1} muted>
            What percentage of files with internal/local component imports also
            use each tracked library, indicating library adoption in custom
            code.
          </Text>

          {/* Aggregate adoption bars per library */}
          <Stack space={2}>
            {libraryNames.map((libName, idx) => {
              const adoption = totals.internalAdoption?.[libName] || {};
              const filesUsing = adoption.filesUsingLibrary || 0;
              const adoptPct = pct(filesUsing, filesWithInternal);
              return (
                <LabelledBar
                  key={libName}
                  label={libName}
                  percent={adoptPct}
                  tone={libTone(idx)}
                  count={`${filesUsing} / ${filesWithInternal}`}
                />
              );
            })}
          </Stack>

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
              {
                key: "filesWithInternal",
                label: "Files w/ Internal",
                numeric: true,
                flex: 2,
              },
              ...libraryNames.flatMap((libName, idx) => [
                {
                  key: `adopt_${libName}`,
                  label: `Using ${libName}`,
                  numeric: true,
                  flex: 2,
                },
                {
                  key: `adoptPct_${libName}`,
                  label: `% ${libName}`,
                  numeric: true,
                  flex: 2,
                  render: (val) => (
                    <Badge tone={libTone(idx)} size={0}>
                      {val}
                    </Badge>
                  ),
                },
              ]),
            ]}
            rows={adoptionRows}
            defaultSortKey="filesWithInternal"
          />
        </Stack>
      </Card>
    </Stack>
  );
}
