/**
 * Central data loader for the dashboard.
 *
 * Imports every report JSON via Vite's static JSON import support.
 * The @reports alias is configured in vite.config.js to point at ../reports.
 *
 * Each export is the parsed JSON object, ready for use in React components.
 */

// ── Per-component reports ─────────────────────────────────────────────────────

import perComponentSummary from "@reports/per-component/per-component-summary.json";

// Individual component detail files
import Autocomplete from "@reports/per-component/components/Autocomplete.json";
import Avatar from "@reports/per-component/components/Avatar.json";
import AvatarCounter from "@reports/per-component/components/AvatarCounter.json";
import AvatarStack from "@reports/per-component/components/AvatarStack.json";
import Badge from "@reports/per-component/components/Badge.json";
import BoundaryElementProvider from "@reports/per-component/components/BoundaryElementProvider.json";
import Box from "@reports/per-component/components/Box.json";
import Button from "@reports/per-component/components/Button.json";
import Card from "@reports/per-component/components/Card.json";
import Checkbox from "@reports/per-component/components/Checkbox.json";
import Code from "@reports/per-component/components/Code.json";
import Container from "@reports/per-component/components/Container.json";
import Dialog from "@reports/per-component/components/Dialog.json";
import ErrorBoundary from "@reports/per-component/components/ErrorBoundary.json";
import Flex from "@reports/per-component/components/Flex.json";
import Grid from "@reports/per-component/components/Grid.json";
import Heading from "@reports/per-component/components/Heading.json";
import Inline from "@reports/per-component/components/Inline.json";
import KBD from "@reports/per-component/components/KBD.json";
import Label from "@reports/per-component/components/Label.json";
import Layer from "@reports/per-component/components/Layer.json";
import LayerProvider from "@reports/per-component/components/LayerProvider.json";
import Menu from "@reports/per-component/components/Menu.json";
import MenuButton from "@reports/per-component/components/MenuButton.json";
import MenuDivider from "@reports/per-component/components/MenuDivider.json";
import MenuGroup from "@reports/per-component/components/MenuGroup.json";
import MenuItem from "@reports/per-component/components/MenuItem.json";
import Popover from "@reports/per-component/components/Popover.json";
import Portal from "@reports/per-component/components/Portal.json";
import PortalProvider from "@reports/per-component/components/PortalProvider.json";
import Radio from "@reports/per-component/components/Radio.json";
import Select from "@reports/per-component/components/Select.json";
import Skeleton from "@reports/per-component/components/Skeleton.json";
import Spinner from "@reports/per-component/components/Spinner.json";
import Stack from "@reports/per-component/components/Stack.json";
import Switch from "@reports/per-component/components/Switch.json";
import Tab from "@reports/per-component/components/Tab.json";
import TabList from "@reports/per-component/components/TabList.json";
import TabPanel from "@reports/per-component/components/TabPanel.json";
import Text from "@reports/per-component/components/Text.json";
import TextArea from "@reports/per-component/components/TextArea.json";
import TextInput from "@reports/per-component/components/TextInput.json";
import TextSkeleton from "@reports/per-component/components/TextSkeleton.json";
import ThemeColorProvider from "@reports/per-component/components/ThemeColorProvider.json";
import ThemeProvider from "@reports/per-component/components/ThemeProvider.json";
import Tooltip from "@reports/per-component/components/Tooltip.json";
import TooltipDelayGroupProvider from "@reports/per-component/components/TooltipDelayGroupProvider.json";

/**
 * Map of component name → full detail JSON (props, values, references).
 * Only includes components that had at least one import or instance.
 *
 * @type {Object<string, object>}
 */
export const componentDetails = {
  Autocomplete,
  Avatar,
  AvatarCounter,
  AvatarStack,
  Badge,
  BoundaryElementProvider,
  Box,
  Button,
  Card,
  Checkbox,
  Code,
  Container,
  Dialog,
  ErrorBoundary,
  Flex,
  Grid,
  Heading,
  Inline,
  KBD,
  Label,
  Layer,
  LayerProvider,
  Menu,
  MenuButton,
  MenuDivider,
  MenuGroup,
  MenuItem,
  Popover,
  Portal,
  PortalProvider,
  Radio,
  Select,
  Skeleton,
  Spinner,
  Stack,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Text,
  TextArea,
  TextInput,
  TextSkeleton,
  ThemeColorProvider,
  ThemeProvider,
  Tooltip,
  TooltipDelayGroupProvider,
};

// ── Source analysis ────────────────────────────────────────────────────────────

import sourcesReport from "@reports/ui-component-sources/ui-component-sources-report.json";

// ── HTML tags ─────────────────────────────────────────────────────────────────

import htmlTagsReport from "@reports/html-tags/html-tags-report.json";

// ── Customizations ────────────────────────────────────────────────────────────

import customizationsReport from "@reports/sanity-ui-customizations/sanity-ui-customizations-report.json";

// ── Re-exports ────────────────────────────────────────────────────────────────

export { perComponentSummary, sourcesReport, htmlTagsReport, customizationsReport };

/**
 * Look up a single component's detail by name.
 *
 * @param {string} name - PascalCase component name (e.g. "Button").
 * @returns {object | undefined}
 */
export function getComponentDetail(name) {
  return componentDetails[name];
}

/**
 * Get the list of all component names that have detail reports.
 *
 * @returns {string[]}
 */
export function getComponentNames() {
  return Object.keys(componentDetails);
}
