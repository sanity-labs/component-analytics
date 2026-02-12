import { Card, Stack, Text, Heading } from "@sanity/ui";

/**
 * A small card that displays a single numeric stat with a label.
 *
 * @param {object} props
 * @param {string} props.label   - Short description (e.g. "Total Instances").
 * @param {string|number} props.value - The stat value to display.
 * @param {string} [props.tone]  - Sanity UI tone ("primary", "positive", "caution", "critical").
 * @param {string} [props.detail] - Optional secondary text below the value.
 */
export function StatCard({ label, value, tone, detail }) {
  return (
    <Card padding={4} radius={2} shadow={1} tone={tone}>
      <Stack space={3}>
        <Text size={1} muted>
          {label}
        </Text>
        <Heading size={3}>{typeof value === "number" ? value.toLocaleString() : value}</Heading>
        {detail && (
          <Text size={1} muted>
            {detail}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
