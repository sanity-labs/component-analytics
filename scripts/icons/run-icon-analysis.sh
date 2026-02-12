#!/bin/bash

# Comprehensive Icon Analysis Runner
# This script runs multiple analysis methods to provide complete icon usage tracking

set -e  # Exit on error

echo "========================================================================"
echo "  COMPREHENSIVE ICON ANALYSIS FOR SANITY STUDIO"
echo "========================================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Ensure reports directory exists
mkdir -p reports/icons

echo -e "${BLUE}Phase 1: React Scanner Analysis (JSX Usage)${NC}"
echo "------------------------------------------------------------------------"
echo "Running React Scanner to detect JSX icon usage patterns..."
echo ""

npx react-scanner -c config/react-scanner-icons.config.js
echo -e "${GREEN}✓ React Scanner analysis complete${NC}"
echo ""

echo -e "${BLUE}Phase 2: Enhanced React Scanner Analysis${NC}"
echo "------------------------------------------------------------------------"
echo "Running enhanced React Scanner with custom processors..."
echo ""

if [ -f "config/react-scanner-icons-enhanced.config.js" ]; then
  npx react-scanner -c config/react-scanner-icons-enhanced.config.js
  echo -e "${GREEN}✓ Enhanced React Scanner analysis complete${NC}"
else
  echo -e "${YELLOW}⚠ Enhanced config not found, skipping...${NC}"
fi
echo ""

echo -e "${BLUE}Phase 3: Custom Icon Props Analysis${NC}"
echo "------------------------------------------------------------------------"
echo "Running custom analyzer to detect icons passed as props..."
echo ""

node scripts/analyze-icon-props.js
echo -e "${GREEN}✓ Custom props analysis complete${NC}"
echo ""

echo -e "${BLUE}Phase 4: Shell-based Import Analysis${NC}"
echo "------------------------------------------------------------------------"
echo "Running shell script to analyze icon imports..."
echo ""

bash scripts/analyze-icon-imports.sh
echo -e "${GREEN}✓ Import analysis complete${NC}"
echo ""

echo -e "${BLUE}Phase 5: Generating Comparison Report${NC}"
echo "------------------------------------------------------------------------"
echo "Creating comparison analysis between different methods..."
echo ""

# Create comparison report
node <<'EOF'
const fs = require('fs');
const path = require('path');

try {
  console.log('Loading analysis results...');

  // Load different reports
  const reportsDir = './reports/icons';
  const reports = {
    reactScanner: null,
    customProps: null,
    imports: null
  };

  // React Scanner report
  try {
    const rsPath = path.join(reportsDir, 'icon-usage-report.json');
    if (fs.existsSync(rsPath)) {
      reports.reactScanner = JSON.parse(fs.readFileSync(rsPath, 'utf-8'));
    }
  } catch (e) {
    console.log('  ⚠ React Scanner report not found');
  }

  // Custom props analysis
  try {
    const customPath = path.join(reportsDir, 'icon-props-analysis-full.json');
    if (fs.existsSync(customPath)) {
      reports.customProps = JSON.parse(fs.readFileSync(customPath, 'utf-8'));
    }
  } catch (e) {
    console.log('  ⚠ Custom props report not found');
  }

  // Create comparison
  const comparison = {
    timestamp: new Date().toISOString(),
    methods: {
      reactScanner: {
        description: 'Standard React Scanner - detects JSX usage only',
        uniqueIcons: reports.reactScanner ? Object.keys(reports.reactScanner).length : 0,
        limitations: 'Cannot detect icons passed as prop references'
      },
      customPropsAnalysis: {
        description: 'Custom AST-like analysis - detects both JSX and prop usage',
        uniqueIcons: reports.customProps?.statistics?.totalUniqueIcons || 0,
        totalInstances: reports.customProps?.statistics?.totalIconInstances || 0,
        propUsages: reports.customProps?.statistics?.totalPropUsages || 0,
        jsxUsages: reports.customProps?.statistics?.totalJSXUsages || 0,
        advantages: 'Comprehensive - tracks all usage patterns'
      }
    },
    insights: []
  };

  if (reports.customProps && reports.reactScanner) {
    const customTotal = reports.customProps.statistics.totalUniqueIcons;
    const scannerTotal = Object.keys(reports.reactScanner).length;
    const coverage = ((scannerTotal / customTotal) * 100).toFixed(1);

    comparison.insights.push(
      `React Scanner detected ${scannerTotal} icons vs ${customTotal} actual unique icons (${coverage}% coverage)`
    );

    const propPercentage = ((reports.customProps.statistics.totalPropUsages /
      reports.customProps.statistics.totalIconInstances) * 100).toFixed(1);

    comparison.insights.push(
      `${propPercentage}% of icon usage is through props, explaining React Scanner's limitation`
    );
  }

  if (reports.customProps) {
    const stats = reports.customProps.statistics;
    comparison.insights.push(
      `Found ${stats.filesWithIcons} files using icons across ${stats.componentsUsingIcons} components`
    );

    if (stats.topPropNames && stats.topPropNames.length > 0) {
      comparison.insights.push(
        `Most common prop name for icons: "${stats.topPropNames[0].name}" (${stats.topPropNames[0].count} uses)`
      );
    }

    if (stats.topIcons && stats.topIcons.length > 0) {
      comparison.insights.push(
        `Most used icon: "${stats.topIcons[0].name}" (${stats.topIcons[0].total} instances)`
      );
    }
  }

  // Save comparison report
  const outputPath = path.join(reportsDir, 'analysis-comparison.json');
  fs.writeFileSync(outputPath, JSON.stringify(comparison, null, 2));
  console.log(`✓ Comparison report saved to: ${outputPath}`);

  // Create summary text file
  const summaryLines = [
    '=' .repeat(80),
    'ICON ANALYSIS COMPARISON SUMMARY',
    '='.repeat(80),
    '',
    `Generated: ${comparison.timestamp}`,
    '',
    'ANALYSIS METHODS COMPARED',
    '-'.repeat(80),
    '',
    '1. React Scanner (Standard)',
    `   Unique Icons Detected: ${comparison.methods.reactScanner.uniqueIcons}`,
    `   Method: ${comparison.methods.reactScanner.description}`,
    `   Limitation: ${comparison.methods.reactScanner.limitations}`,
    '',
    '2. Custom Props Analysis',
    `   Unique Icons Detected: ${comparison.methods.customPropsAnalysis.uniqueIcons}`,
    `   Total Icon Instances: ${comparison.methods.customPropsAnalysis.totalInstances}`,
    `   - Prop Usage: ${comparison.methods.customPropsAnalysis.propUsages}`,
    `   - JSX Usage: ${comparison.methods.customPropsAnalysis.jsxUsages}`,
    `   Method: ${comparison.methods.customPropsAnalysis.description}`,
    `   Advantage: ${comparison.methods.customPropsAnalysis.advantages}`,
    '',
    'KEY INSIGHTS',
    '-'.repeat(80),
    ...comparison.insights.map((insight, i) => `${i + 1}. ${insight}`),
    '',
    'RECOMMENDATION',
    '-'.repeat(80),
    'Use the Custom Props Analysis for accurate icon usage tracking.',
    'React Scanner is useful for JSX patterns but misses prop-based usage.',
    '',
    '='.repeat(80),
  ];

  const summaryPath = path.join(reportsDir, 'analysis-comparison-summary.txt');
  fs.writeFileSync(summaryPath, summaryLines.join('\n'));
  console.log(`✓ Summary saved to: ${summaryPath}`);

} catch (error) {
  console.error('Error generating comparison:', error.message);
  process.exit(1);
}
EOF

echo -e "${GREEN}✓ Comparison report generated${NC}"
echo ""

echo "========================================================================"
echo "  ANALYSIS COMPLETE!"
echo "========================================================================"
echo ""
echo "Reports generated in: reports/icons/"
echo ""
echo "Key files:"
echo "  • icon-props-analysis-full.json    - Complete detailed analysis"
echo "  • icon-props-statistics.json       - Statistics summary"
echo "  • icon-props-summary.txt           - Human-readable summary"
echo "  • icon-props-analysis.csv          - Spreadsheet-friendly data"
echo "  • component-icon-mapping.json      - Component-to-icon relationships"
echo "  • analysis-comparison.json         - Method comparison"
echo "  • analysis-comparison-summary.txt  - Comparison summary"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "  1. Review icon-props-summary.txt for quick insights"
echo "  2. Open CSV files in spreadsheet software for deeper analysis"
echo "  3. Use component-icon-mapping.json to understand icon distribution"
echo ""
