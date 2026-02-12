#!/bin/bash

# Script to analyze icon imports (more accurate than React Scanner for icon props)

echo "Analyzing icon imports from @sanity/icons..."
echo ""

# Find all icon imports
echo "Extracting icon imports..."
grep -rh "import.*from '@sanity/icons'" sanity \
  --include="*.tsx" --include="*.ts" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude-dir=build \
  --exclude-dir=lib \
  --exclude-dir=es \
  --exclude-dir=.cache | \
  sed "s/import {//" | \
  sed "s/} from '@sanity\/icons'//" | \
  tr ',' '\n' | \
  sed 's/^[[:space:]]*//' | \
  sed 's/[[:space:]]*$//' | \
  grep -v "^$" | \
  grep -v "^type " | \
  sort | uniq -c | sort -rn > /tmp/icon-imports.txt

echo "Total unique icons imported: $(wc -l < /tmp/icon-imports.txt | xargs)"
echo ""
echo "Top 20 most imported icons:"
head -20 /tmp/icon-imports.txt
echo ""
echo "Full report saved to: reports/icons/icon-imports-analysis.txt"

cp /tmp/icon-imports.txt reports/icons/icon-imports-analysis.txt
