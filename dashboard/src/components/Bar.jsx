import { Box, Flex, Text, Tooltip } from "@sanity/ui";

const TONE_COLORS = {
  primary: "#2276fc",
  positive: "#43d675",
  caution: "#f3c948",
  critical: "#f76d6a",
  default: "#8690a0",
  purple: "#b565e0",
  magenta: "#e568a1",
  cyan: "#22bce0",
};

/**
 * A single horizontal bar segment used inside BarChart.
 *
 * @param {object} props
 * @param {number} props.percent  - Width as a percentage (0–100).
 * @param {string} [props.color]  - CSS colour override.
 * @param {string} [props.tone]   - Named tone (looked up in TONE_COLORS).
 * @param {string} [props.label]  - Tooltip / aria label.
 */
function BarSegment({ percent, color, tone, label }) {
  const bg = color || TONE_COLORS[tone] || TONE_COLORS.default;

  const bar = (
    <Box
      style={{
        width: `${Math.max(percent, 0.4)}%`,
        height: 20,
        borderRadius: 2,
        backgroundColor: bg,
        transition: "width 0.3s ease",
      }}
    />
  );

  if (label) {
    return (
      <Tooltip
        content={
          <Box padding={2}>
            <Text size={1}>{label}</Text>
          </Box>
        }
        placement="top"
      >
        {bar}
      </Tooltip>
    );
  }

  return bar;
}

/**
 * A stacked horizontal bar chart built from Sanity UI primitives.
 *
 * Each segment represents a category with a percentage width, colour,
 * and optional label.  Segments are stacked left-to-right inside a
 * rounded container.
 *
 * @example
 *   <BarChart
 *     segments={[
 *       { label: "Sanity UI (54%)", percent: 54, tone: "primary" },
 *       { label: "Internal (36%)",  percent: 36, tone: "caution" },
 *       { label: "HTML (10%)",      percent: 10, tone: "critical" },
 *     ]}
 *   />
 *
 * @param {object} props
 * @param {Array<{ label?: string, percent: number, tone?: string, color?: string }>} props.segments
 * @param {number} [props.height] - Bar height in pixels (default 20).
 */
export function BarChart({ segments, height = 20 }) {
  return (
    <Flex
      gap={1}
      style={{
        height,
        borderRadius: 4,
        overflow: "hidden",
        backgroundColor: "var(--card-border-color)",
      }}
    >
      {segments.map((seg, i) => (
        <BarSegment
          key={i}
          percent={seg.percent}
          color={seg.color}
          tone={seg.tone}
          label={seg.label}
        />
      ))}
    </Flex>
  );
}

/**
 * A labelled single-value bar with a percentage and optional count.
 *
 * Renders:
 *   Label               ████████████░░░░░  42.5%  (1,234)
 *
 * @param {object} props
 * @param {string}        props.label   - Left-side label text.
 * @param {number}        props.percent - Fill percentage (0–100).
 * @param {string}        [props.tone]  - Bar colour tone.
 * @param {string|number} [props.count] - Optional right-side count.
 */
export function LabelledBar({ label, percent, tone, count }) {
  const bg = TONE_COLORS[tone] || TONE_COLORS.default;

  return (
    <Flex gap={3} align="center">
      <Box flex={2}>
        <Text size={1} textOverflow="ellipsis">
          {label}
        </Text>
      </Box>
      <Box flex={4}>
        <Box
          style={{
            height: 14,
            borderRadius: 3,
            backgroundColor: "var(--card-border-color)",
            overflow: "hidden",
          }}
        >
          <Box
            style={{
              width: `${Math.max(percent, 0)}%`,
              height: "100%",
              borderRadius: 3,
              backgroundColor: bg,
              transition: "width 0.3s ease",
            }}
          />
        </Box>
      </Box>
      <Box flex={1} style={{ textAlign: "right", minWidth: 50 }}>
        <Text size={1} muted>
          {percent.toFixed(1)}%
        </Text>
      </Box>
      {count != null && (
        <Box style={{ textAlign: "right", minWidth: 60 }}>
          <Text size={1} muted>
            {typeof count === "number" ? count.toLocaleString() : count}
          </Text>
        </Box>
      )}
    </Flex>
  );
}

export { TONE_COLORS };
