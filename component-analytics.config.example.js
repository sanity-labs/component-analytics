/**
 * Component Analytics Configuration
 *
 * This is the single configuration file for the entire analysis project.
 * Customise the sections below to control which codebases are scanned,
 * which UI libraries are measured, and which components are tracked.
 *
 * After editing, re-run analyses with:
 *
 *   npm run analyze
 *
 * @type {import("./scripts/lib/config-schema").StudioAnalysisConfig}
 */
module.exports = {
  // ═══════════════════════════════════════════════════════════════════════════
  // CODEBASES
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Each entry defines a codebase to analyse.  The `name` is used in
  // report filenames and column headers.  The `path` is relative to this
  // config file (i.e. the project root).

  codebases: [

    { name: "component-analytics-dashboard", path: "./dashboard/src" },

  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // UI LIBRARIES
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Define one or more UI component libraries whose usage you want to
  // measure.  Each library specifies:
  //
  //   importSources   – package names that identify this library in
  //                     import statements (matched as substrings).
  //   excludeSources  – import paths to ignore even if they match an
  //                     importSource (e.g. theme-only sub-packages).
  //   components      – the PascalCase export names to track.
  //
  // Prop defaults are detected automatically from usage data — run
  // `npm run detect:prop-defaults` after `npm run analyze:per-component`.

  uiLibraries: [
    {
      name: "Sanity UI",
      importSources: ["@sanity/ui"],
      excludeSources: ["@sanity/ui/theme"],

      components: [
        // ── Layout ────────────────────────────────────────────────
        "Box",
        "Container",
        "Flex",
        "Grid",
        "Inline",
        "Stack",

        // ── Interactive ───────────────────────────────────────────
        "Button",
        "Card",
        "Dialog",
        "Menu",
        "MenuButton",
        "MenuDivider",
        "MenuGroup",
        "MenuItem",
        "Popover",
        "Tab",
        "TabList",
        "TabPanel",
        "Tooltip",

        // ── Form ──────────────────────────────────────────────────
        "Autocomplete",
        "Checkbox",
        "Label",
        "Radio",
        "Select",
        "Switch",
        "TextArea",
        "TextInput",

        // ── Typography ────────────────────────────────────────────
        "Badge",
        "Code",
        "Heading",
        "KBD",
        "Text",

        // ── Feedback ──────────────────────────────────────────────
        "Spinner",
        "Toast",

        // ── Data Display ──────────────────────────────────────────
        "Avatar",
        "AvatarCounter",
        "AvatarStack",
        "Skeleton",
        "TextSkeleton",
        "Tree",
        "TreeItem",

        // ── Utility / Providers ───────────────────────────────────
        "BoundaryElementProvider",
        "ErrorBoundary",
        "Layer",
        "LayerProvider",
        "Portal",
        "PortalProvider",
        "ThemeColorProvider",
        "ThemeProvider",
        "TooltipDelayGroupProvider",
      ],
    },
    {
      name: "Sanity Icons",
      importSources: ["@sanity/icons"],
      excludeSources: [],

      components: [
        "AccessDeniedIcon",
        "ActivityIcon",
        "AddCircleIcon",
        "AddIcon",
        "ApiIcon",
        "ArchiveIcon",
        "ArrowDownIcon",
        "ArrowLeftIcon",
        "ArrowRightIcon",
        "ArrowTopRightIcon",
        "ArrowUpIcon",
        "BarChartIcon",
        "BasketIcon",
        "BellIcon",
        "BillIcon",
        "BinaryDocumentIcon",
        "BlockContentIcon",
        "BlockElementIcon",
        "BlockquoteIcon",
        "BoldIcon",
        "BoltIcon",
        "BookIcon",
        "BottleIcon",
        "BulbFilledIcon",
        "BulbOutlineIcon",
        "CalendarIcon",
        "CaseIcon",
        "ChartUpwardIcon",
        "CheckmarkCircleIcon",
        "CheckmarkIcon",
        "ChevronDownIcon",
        "ChevronLeftIcon",
        "ChevronRightIcon",
        "ChevronUpIcon",
        "CircleIcon",
        "ClipboardIcon",
        "ClipboardImageIcon",
        "ClockIcon",
        "CloseCircleIcon",
        "CloseIcon",
        "CodeBlockIcon",
        "CodeIcon",
        "CogIcon",
        "CollapseIcon",
        "ColorWheelIcon",
        "CommentIcon",
        "ComposeIcon",
        "ComposeSparklesIcon",
        "ConfettiIcon",
        "ControlsIcon",
        "CopyIcon",
        "CreditCardIcon",
        "CropIcon",
        "DashboardIcon",
        "DatabaseIcon",
        "DesktopIcon",
        "DocumentIcon",
        "DocumentRemoveIcon",
        "DocumentSheetIcon",
        "DocumentTextIcon",
        "DocumentVideoIcon",
        "DocumentWordIcon",
        "DocumentZipIcon",
        "DocumentsIcon",
        "DotIcon",
        "DoubleChevronDownIcon",
        "DoubleChevronLeftIcon",
        "DoubleChevronRightIcon",
        "DoubleChevronUpIcon",
        "DownloadIcon",
        "DragHandleIcon",
        "DropIcon",
        "EarthAmericasIcon",
        "EarthGlobeIcon",
        "EditIcon",
        "EllipsisHorizontalIcon",
        "EllipsisVerticalIcon",
        "EmailIcon",
        "EnvelopeIcon",
        "EqualIcon",
        "ErrorFilledIcon",
        "ErrorOutlineIcon",
        "ExpandIcon",
        "EyeClosedIcon",
        "EyeOpenIcon",
        "FilterIcon",
        "FolderIcon",
        "GenerateIcon",
        "GridIcon",
        "HashIcon",
        "HeartFilledIcon",
        "HeartIcon",
        "HelpCircleIcon",
        "HighlightIcon",
        "HomeIcon",
        "IceCreamIcon",
        "ImageIcon",
        "ImageRemoveIcon",
        "ImagesIcon",
        "InfoFilledIcon",
        "InfoOutlineIcon",
        "InlineElementIcon",
        "InlineIcon",
        "InsertAboveIcon",
        "InsertBelowIcon",
        "ItalicIcon",
        "JoystickIcon",
        "JsonIcon",
        "LaunchIcon",
        "LeaveIcon",
        "LemonIcon",
        "LinkIcon",
        "LinkRemovedIcon",
        "ListIcon",
        "LockIcon",
        "LogoJavascriptIcon",
        "LogoTypescriptIcon",
        "MarkerIcon",
        "MasterDetailIcon",
        "MenuIcon",
        "MicrophoneIcon",
        "MobileDeviceIcon",
        "MoonIcon",
        "NumberIcon",
        "OkHandIcon",
        "OrderedListIcon",
        "OlistIcon",
        "OverflowHorizontalIcon",
        "OverflowVerticalIcon",
        "PackageIcon",
        "PanelLeftIcon",
        "PanelRightIcon",
        "PauseIcon",
        "PinIcon",
        "PinFilledIcon",
        "PlayIcon",
        "PlugIcon",
        "PublishIcon",
        "ReadOnlyIcon",
        "RedoIcon",
        "RefreshIcon",
        "RemoveCircleIcon",
        "RemoveIcon",
        "ResetIcon",
        "RestoreIcon",
        "RetryIcon",
        "RevertIcon",
        "RobotIcon",
        "RocketIcon",
        "SchemaIcon",
        "SearchIcon",
        "SelectIcon",
        "ShareIcon",
        "SortIcon",
        "SparkleIcon",
        "SparklesIcon",
        "SpinnerIcon",
        "SplitHorizontalIcon",
        "SplitVerticalIcon",
        "SquareIcon",
        "StackCompactIcon",
        "StackIcon",
        "StarFilledIcon",
        "StarIcon",
        "StrikethroughIcon",
        "StringIcon",
        "SunIcon",
        "SyncIcon",
        "TabIcon",
        "TagIcon",
        "TerminalIcon",
        "TextIcon",
        "ThLargeIcon",
        "ThListIcon",
        "TiersIcon",
        "ToggleArrowRightIcon",
        "TokenIcon",
        "TransferIcon",
        "TranslateIcon",
        "TrashIcon",
        "TrendUpwardIcon",
        "TriangleOutlineIcon",
        "TruncateIcon",
        "UnderlineIcon",
        "UndoIcon",
        "UnknownIcon",
        "UnlockIcon",
        "UnpublishIcon",
        "UploadIcon",
        "UserIcon",
        "UsersIcon",
        "WarningFilledIcon",
        "WarningOutlineIcon",
        "WrenchIcon",
      ],
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // FILE SCANNING
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Control which files are included in / excluded from analysis.

  files: {
    /** Glob pattern for component files. */
    pattern: "**/*.{tsx,jsx}",

    /** Glob patterns to ignore (applied in every codebase). */
    ignore: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/*.test.*",
      "**/*.spec.*",
      "**/__tests__/**",
      "**/*.stories.*",
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPORT CLASSIFICATION (for the sources report)
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // The sources report classifies every JSX element into a category.
  // The tracked UI library above is always the primary category.  The
  // patterns below define the "other UI" category — third-party UI
  // libraries that are neither the tracked library nor internal code.

  otherUIPatterns: [
    "@radix-ui",
    "styled-components",
    "motion/react",
    "framer-motion",
  ],


  // ═══════════════════════════════════════════════════════════════════════════
  // PROP COMBINATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Cross-tabulate prop value combinations on specific components.
  //
  // For each entry the analyser counts every unique tuple of values for
  // the listed props across all codebases.  This is useful for
  // understanding which pairings actually occur in practice — e.g. do
  // developers use `weight="bold"` together with `size={1}`, or are
  // certain combinations never used?
  //
  // Each entry needs:
  //   component  – a tracked component name (from uiLibraries above)
  //   props      – two or more prop names to combine

  propCombos: [
    { component: "Text", props: ["weight", "size"] },
    { component: "Button", props: ["tone", "mode"] },
    { component: "Button", props: ["fontSize", "padding", "radius"] },
    { component: "Card", props: ["tone", "padding", "radius"] },
    { component: "Heading", props: ["size", "as"] },
  ],

};
