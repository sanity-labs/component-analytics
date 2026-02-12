import { Card, Grid, Heading, Stack, Text, Badge, Flex } from "@sanity/ui";
import { StatCard } from "../components/StatCard.jsx";
import { DataTable } from "../components/DataTable.jsx";
import { LabelledBar, BarChart } from "../components/Bar.jsx";
import { htmlTagsReport } from "../data.js";

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
 * Map a tag category to a Sanity UI tone for visual consistency.
 *
 * @param {string} category
 * @returns {string}
 */
function categoryTone(category) {
  const map = {
    layout: "primary",
    text: "positive",
    form: "caution",
    media: "critical",
    list: "default",
    table: "default",
    link: "primary",
    embed: "caution",
    scripting: "critical",
    semantic: "positive",
    document: "default",
    other: "default",
  };
  return map[category] || "default";
}

/**
 * HTML Tags page — visualises native HTML/SVG tag usage across all codebases.
 *
 * Shows:
 *   1. Key stat cards (total instances, unique tags, files with HTML)
 *   2. Aggregate top tags bar chart
 *   3. Sortable table of all tags (aggregate)
 *   4. Category breakdown
 *   5. Per-codebase sections with their own tables and distributions
 */
export function HtmlTags() {
  const aggregate = htmlTagsReport.aggregate || {};
  const codebases = htmlTagsReport.codebases || {};

  const totalInstances = aggregate.totalInstances || 0;
  const uniqueTags = aggregate.uniqueTags || 0;
  const totalFiles = aggregate.totalFiles || 0;
  const topTags = aggregate.topTags || [];

  // ── Aggregate tag rows for the sortable table ─────────────────────────

  const tagRows = topTags.map((t) => ({
    _key: t.tag,
    tag: t.tag,
    count: t.count,
    category: t.category || "other",
    percent: pct(t.count, totalInstances).toFixed(1) + "%",
  }));

  // ── Category breakdown ────────────────────────────────────────────────

  const categoryTotals = {};
  for (const t of topTags) {
    const cat = t.category || "other";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + t.count;
  }
  const categoryRows = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({
      _key: category,
      category,
      count,
      percent: pct(count, totalInstances).toFixed(1) + "%",
    }));

  // ── Per-codebase data ─────────────────────────────────────────────────

  const codebaseEntries = Object.entries(codebases).sort(
    (a, b) => (b[1].totalInstances || 0) - (a[1].totalInstances || 0),
  );

  // Summary rows for the per-codebase comparison table
  const codebaseSummaryRows = codebaseEntries.map(([name, data]) => ({
    _key: name,
    codebase: name,
    files: data.fileCount || 0,
    filesWithHTML: data.filesWithHTML || 0,
    uniqueTags: data.uniqueTags || 0,
    totalInstances: data.totalInstances || 0,
    topTag:
      data.topTags && data.topTags.length > 0
        ? `<${data.topTags[0].tag}> (${data.topTags[0].count})`
        : "—",
  }));

  return (
    <Stack space={5}>
      {/* ── Title ──────────────────────────────────────────────────── */}
      <Stack space={3}>
        <Heading size={3}>HTML Tag Usage</Heading>
        <Text size={1} muted>
          Native HTML and SVG elements used in JSX across all codebases. Only
          standard tags from the HTML/SVG spec are counted — TypeScript type
          keywords and library-specific elements are excluded.
          {htmlTagsReport.generatedAt &&
            ` · Generated ${new Date(htmlTagsReport.generatedAt).toLocaleDateString()}`}
        </Text>
      </Stack>

      {/* ── Stat cards ─────────────────────────────────────────────── */}
      <Grid columns={[1, 2, 4]} gap={3}>
        <StatCard
          label="Total Tag Instances"
          value={totalInstances}
          tone="primary"
          detail={`Across ${totalFiles.toLocaleString()} files`}
        />
        <StatCard
          label="Unique Tags"
          value={uniqueTags}
          detail="Distinct HTML/SVG element names"
        />
        <StatCard
          label="Most Used Tag"
          value={topTags.length > 0 ? `<${topTags[0].tag}>` : "—"}
          tone="caution"
          detail={
            topTags.length > 0
              ? `${topTags[0].count.toLocaleString()} instances (${pct(topTags[0].count, totalInstances).toFixed(1)}%)`
              : ""
          }
        />
        <StatCard
          label="Codebases Analysed"
          value={codebaseEntries.length}
          detail={codebaseEntries.map(([n]) => n).join(", ")}
        />
      </Grid>

      {/* ── Top tags bar chart ─────────────────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>Top 15 Tags (All Codebases)</Heading>
          <Stack space={2}>
            {topTags.slice(0, 15).map((t) => (
              <LabelledBar
                key={t.tag}
                label={`<${t.tag}>`}
                percent={pct(t.count, totalInstances)}
                tone={categoryTone(t.category)}
                count={t.count}
              />
            ))}
          </Stack>
        </Stack>
      </Card>

      {/* ── Category breakdown ─────────────────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>Usage by Category</Heading>

          <BarChart
            height={24}
            segments={categoryRows.map((c) => ({
              label: `${c.category} (${c.percent})`,
              percent: pct(c.count, totalInstances),
              tone: categoryTone(c.category),
            }))}
          />

          <DataTable
            columns={[
              {
                key: "category",
                label: "Category",
                flex: 2,
                render: (val) => (
                  <Badge tone={categoryTone(val)} size={0}>
                    {val}
                  </Badge>
                ),
              },
              { key: "count", label: "Instances", numeric: true, flex: 2 },
              {
                key: "percent",
                label: "% of Total",
                numeric: true,
                flex: 2,
              },
            ]}
            rows={categoryRows}
            defaultSortKey="count"
          />
        </Stack>
      </Card>

      {/* ── Full aggregate tag table ──────────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>All Tags (Aggregate)</Heading>
          <Text size={1} muted>
            Sortable table of every HTML/SVG tag found across all codebases.
          </Text>
          <DataTable
            columns={[
              {
                key: "tag",
                label: "Tag",
                flex: 2,
                render: (val) => (
                  <Text size={1} weight="bold">
                    &lt;{val}&gt;
                  </Text>
                ),
              },
              { key: "count", label: "Instances", numeric: true, flex: 2 },
              { key: "percent", label: "% of Total", numeric: true, flex: 2 },
              {
                key: "category",
                label: "Category",
                flex: 2,
                render: (val) => (
                  <Badge tone={categoryTone(val)} size={0}>
                    {val}
                  </Badge>
                ),
              },
            ]}
            rows={tagRows}
            defaultSortKey="count"
          />
        </Stack>
      </Card>

      {/* ── Per-codebase comparison table ──────────────────────────── */}
      <Card padding={4} radius={2} shadow={1}>
        <Stack space={4}>
          <Heading size={1}>Per-Codebase Comparison</Heading>
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
              { key: "filesWithHTML", label: "Files w/ HTML", numeric: true, flex: 2 },
              { key: "uniqueTags", label: "Unique Tags", numeric: true, flex: 2 },
              { key: "totalInstances", label: "Instances", numeric: true, flex: 2 },
              { key: "topTag", label: "Most Used", flex: 3 },
            ]}
            rows={codebaseSummaryRows}
            defaultSortKey="totalInstances"
          />
        </Stack>
      </Card>

      {/* ── Per-codebase detail sections ──────────────────────────── */}
      {codebaseEntries.map(([name, data]) => {
        const cbTopTags = data.topTags || [];
        const cbTotal = data.totalInstances || 0;

        const cbTagRows = cbTopTags.map((t) => ({
          _key: t.tag,
          tag: t.tag,
          count: t.count,
          category: t.category || "other",
          percent: pct(t.count, cbTotal).toFixed(1) + "%",
        }));

        // Build category breakdown for this codebase
        const cbCatTotals = {};
        for (const t of cbTopTags) {
          const cat = t.category || "other";
          cbCatTotals[cat] = (cbCatTotals[cat] || 0) + t.count;
        }
        const cbCatSorted = Object.entries(cbCatTotals).sort(
          (a, b) => b[1] - a[1],
        );

        return (
          <Card key={name} padding={4} radius={2} shadow={1}>
            <Stack space={4}>
              <Flex gap={3} align="center">
                <Heading size={1}>{name}</Heading>
                <Badge tone="primary" size={0}>
                  {cbTotal.toLocaleString()} instances
                </Badge>
                <Badge tone="default" size={0}>
                  {(data.uniqueTags || 0)} unique tags
                </Badge>
                <Badge tone="default" size={0}>
                  {(data.filesWithHTML || 0)} files
                </Badge>
              </Flex>

              {/* Category distribution bar */}
              <BarChart
                height={18}
                segments={cbCatSorted.map(([cat, count]) => ({
                  label: `${cat} (${pct(count, cbTotal).toFixed(1)}%)`,
                  percent: pct(count, cbTotal),
                  tone: categoryTone(cat),
                }))}
              />

              {/* Top 10 tags as bars */}
              <Stack space={2}>
                {cbTopTags.slice(0, 10).map((t) => (
                  <LabelledBar
                    key={t.tag}
                    label={`<${t.tag}>`}
                    percent={pct(t.count, cbTotal)}
                    tone={categoryTone(t.category)}
                    count={t.count}
                  />
                ))}
              </Stack>

              {/* Full tag table (hidden behind a collapsible, but we'll
                  show it directly since we don't have a collapsible) */}
              <DataTable
                columns={[
                  {
                    key: "tag",
                    label: "Tag",
                    flex: 2,
                    render: (val) => (
                      <Text size={1} weight="bold">
                        &lt;{val}&gt;
                      </Text>
                    ),
                  },
                  { key: "count", label: "Instances", numeric: true, flex: 2 },
                  { key: "percent", label: "% of Total", numeric: true, flex: 2 },
                  {
                    key: "category",
                    label: "Category",
                    flex: 2,
                    render: (val) => (
                      <Badge tone={categoryTone(val)} size={0}>
                        {val}
                      </Badge>
                    ),
                  },
                ]}
                rows={cbTagRows}
                defaultSortKey="count"
                maxRows={20}
              />
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}
