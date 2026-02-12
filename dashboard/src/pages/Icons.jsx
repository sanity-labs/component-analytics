import { Card, Heading, Stack, Text } from "@sanity/ui";
import { IceCreamIcon } from "@sanity/icons";

/**
 * Icons page — placeholder for icon analysis data.
 *
 * The icon analysis reports are generated in CSV format by the
 * comprehensive icon analyser.  This page provides a landing spot
 * in the navigation and can be expanded when JSON icon reports
 * are available.
 */
export function Icons() {
  return (
    <Stack space={5}>
      <Stack space={3}>
        <Heading size={3}>Icon Usage</Heading>
        <Text size={1} muted>
          Analysis of @sanity/icons usage across all codebases.
        </Text>
      </Stack>

      <Card padding={5} radius={2} shadow={1} tone="transparent">
        <Stack space={4} style={{ textAlign: "center" }}>
          <Text size={4} muted>
            <IceCreamIcon />
          </Text>
          <Heading size={2} muted>
            Icon reports available as CSV
          </Heading>
          <Text size={1} muted>
            The icon analysis produces CSV and TXT reports in{" "}
            <code>reports/icon-analysis-aggregate.csv</code> and per-codebase
            under <code>reports/&lbrace;codebase&rbrace;/icons/</code>.
          </Text>
          <Text size={1} muted>
            To visualise icon data here, run{" "}
            <code>npm run analyze:icons</code> and convert the aggregate
            report to JSON format.
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}
