import { useState, useMemo, useCallback } from "react";
import { Box, Card, Flex, Text, Stack } from "@sanity/ui";
import { ChevronDownIcon, ChevronUpIcon } from "@sanity/icons";

/**
 * @typedef {object} Column
 * @property {string}              key       - Field name in the row data.
 * @property {string}              label     - Column header text.
 * @property {boolean}             [numeric] - Right-align and sort numerically.
 * @property {(value: any, row: object) => React.ReactNode} [render] - Custom cell renderer.
 * @property {number}              [flex]    - Flex weight for the column (default 1).
 */

/**
 * A sortable data table built entirely from Sanity UI primitives.
 *
 * Features:
 *   - Click any column header to sort ascending; click again for descending.
 *   - Optional custom cell renderers via the `render` property on a column.
 *   - Optional `onRowClick` callback for drill-down navigation.
 *   - Optional `maxRows` to cap displayed rows (useful for top-N previews).
 *
 * @param {object} props
 * @param {Column[]}         props.columns     - Column definitions.
 * @param {object[]}         props.rows        - Data rows (plain objects keyed by column `key`).
 * @param {string}           [props.defaultSortKey]  - Initial sort column key.
 * @param {boolean}          [props.defaultSortDesc] - Initial sort direction (default true).
 * @param {(row: object) => void} [props.onRowClick] - Row click handler.
 * @param {number}           [props.maxRows]   - Maximum rows to display.
 * @param {string}           [props.emptyText] - Text shown when there are no rows.
 */
export function DataTable({
  columns,
  rows,
  defaultSortKey,
  defaultSortDesc = true,
  onRowClick,
  maxRows,
  emptyText = "No data",
}) {
  const [sortKey, setSortKey] = useState(defaultSortKey || (columns[0] && columns[0].key));
  const [sortDesc, setSortDesc] = useState(defaultSortDesc);

  const handleSort = useCallback(
    (key) => {
      if (key === sortKey) {
        setSortDesc((prev) => !prev);
      } else {
        setSortKey(key);
        setSortDesc(true);
      }
    },
    [sortKey],
  );

  const sorted = useMemo(() => {
    if (!sortKey) return rows;

    const col = columns.find((c) => c.key === sortKey);
    const numeric = col && col.numeric;

    const copy = [...rows];
    copy.sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];

      if (av == null) av = numeric ? 0 : "";
      if (bv == null) bv = numeric ? 0 : "";

      if (numeric) {
        av = typeof av === "number" ? av : parseFloat(av) || 0;
        bv = typeof bv === "number" ? bv : parseFloat(bv) || 0;
        return sortDesc ? bv - av : av - bv;
      }

      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return sortDesc ? 1 : -1;
      if (as > bs) return sortDesc ? -1 : 1;
      return 0;
    });

    return copy;
  }, [rows, sortKey, sortDesc, columns]);

  const visible = maxRows ? sorted.slice(0, maxRows) : sorted;

  return (
    <Card radius={2} shadow={1} overflow="auto">
      <Stack>
        {/* ── Header row ────────────────────────────────────────────── */}
        <Card borderBottom padding={2} tone="transparent">
          <Flex gap={2} align="center">
            {columns.map((col) => (
              <Box
                key={col.key}
                flex={col.flex || 1}
                style={{ cursor: "pointer", userSelect: "none" }}
                onClick={() => handleSort(col.key)}
              >
                <Flex gap={1} align="center" justify={col.numeric ? "flex-end" : "flex-start"}>
                  <Text size={1} weight="bold" muted>
                    {col.label}
                  </Text>
                  {sortKey === col.key &&
                    (sortDesc ? (
                      <Text size={0} muted>
                        <ChevronDownIcon />
                      </Text>
                    ) : (
                      <Text size={0} muted>
                        <ChevronUpIcon />
                      </Text>
                    ))}
                </Flex>
              </Box>
            ))}
          </Flex>
        </Card>

        {/* ── Data rows ─────────────────────────────────────────────── */}
        {visible.length === 0 && (
          <Box padding={4}>
            <Text size={1} muted align="center">
              {emptyText}
            </Text>
          </Box>
        )}

        {visible.map((row, idx) => (
          <Card
            key={row._key || idx}
            borderBottom
            padding={2}
            tone="default"
            style={onRowClick ? { cursor: "pointer" } : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            <Flex gap={2} align="center">
              {columns.map((col) => {
                const raw = row[col.key];
                const rendered = col.render ? col.render(raw, row) : raw;
                const display =
                  rendered != null && typeof rendered !== "object"
                    ? col.numeric && typeof rendered === "number"
                      ? rendered.toLocaleString()
                      : String(rendered)
                    : rendered;

                return (
                  <Box key={col.key} flex={col.flex || 1}>
                    {typeof display === "string" || typeof display === "number" ? (
                      <Text
                        size={1}
                        style={col.numeric ? { textAlign: "right", display: "block" } : undefined}
                      >
                        {display}
                      </Text>
                    ) : (
                      display
                    )}
                  </Box>
                );
              })}
            </Flex>
          </Card>
        ))}

        {/* ── Truncation notice ──────────────────────────────────────── */}
        {maxRows && sorted.length > maxRows && (
          <Box padding={3}>
            <Text size={1} muted align="center">
              Showing {maxRows} of {sorted.length} rows
            </Text>
          </Box>
        )}
      </Stack>
    </Card>
  );
}
