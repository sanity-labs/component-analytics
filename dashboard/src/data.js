/**
 * Central data loader for the dashboard.
 *
 * Imports every report JSON via Vite's static JSON import support.
 * The @reports alias is configured in vite.config.js to point at ../reports.
 *
 * Each export is the parsed JSON object, ready for use in React components.
 */

// ── Per-component reports ─────────────────────────────────────────────────────

import perComponentSummary from "@reports/components/summary.json";

// Individual component detail files
import Autocomplete from "@reports/components/detail/Autocomplete.json";
import Avatar from "@reports/components/detail/Avatar.json";
import AvatarCounter from "@reports/components/detail/AvatarCounter.json";
import AvatarStack from "@reports/components/detail/AvatarStack.json";
import Badge from "@reports/components/detail/Badge.json";
import BoundaryElementProvider from "@reports/components/detail/BoundaryElementProvider.json";
import Box from "@reports/components/detail/Box.json";
import Button from "@reports/components/detail/Button.json";
import Card from "@reports/components/detail/Card.json";
import Checkbox from "@reports/components/detail/Checkbox.json";
import Code from "@reports/components/detail/Code.json";
import Container from "@reports/components/detail/Container.json";
import Dialog from "@reports/components/detail/Dialog.json";
import ErrorBoundary from "@reports/components/detail/ErrorBoundary.json";
import Flex from "@reports/components/detail/Flex.json";
import Grid from "@reports/components/detail/Grid.json";
import Heading from "@reports/components/detail/Heading.json";
import Inline from "@reports/components/detail/Inline.json";
import KBD from "@reports/components/detail/KBD.json";
import Label from "@reports/components/detail/Label.json";
import Layer from "@reports/components/detail/Layer.json";
import LayerProvider from "@reports/components/detail/LayerProvider.json";
import Menu from "@reports/components/detail/Menu.json";
import MenuButton from "@reports/components/detail/MenuButton.json";
import MenuDivider from "@reports/components/detail/MenuDivider.json";
import MenuGroup from "@reports/components/detail/MenuGroup.json";
import MenuItem from "@reports/components/detail/MenuItem.json";
import Popover from "@reports/components/detail/Popover.json";
import Portal from "@reports/components/detail/Portal.json";
import PortalProvider from "@reports/components/detail/PortalProvider.json";
import Radio from "@reports/components/detail/Radio.json";
import Select from "@reports/components/detail/Select.json";
import Skeleton from "@reports/components/detail/Skeleton.json";
import Spinner from "@reports/components/detail/Spinner.json";
import Stack from "@reports/components/detail/Stack.json";
import Switch from "@reports/components/detail/Switch.json";
import Tab from "@reports/components/detail/Tab.json";
import TabList from "@reports/components/detail/TabList.json";
import TabPanel from "@reports/components/detail/TabPanel.json";
import Text from "@reports/components/detail/Text.json";
import TextArea from "@reports/components/detail/TextArea.json";
import TextInput from "@reports/components/detail/TextInput.json";
import TextSkeleton from "@reports/components/detail/TextSkeleton.json";
import ThemeColorProvider from "@reports/components/detail/ThemeColorProvider.json";
import ThemeProvider from "@reports/components/detail/ThemeProvider.json";
import Tooltip from "@reports/components/detail/Tooltip.json";
import TooltipDelayGroupProvider from "@reports/components/detail/TooltipDelayGroupProvider.json";

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

import sourcesReport from "@reports/sources/report.json";

// ── HTML tags ─────────────────────────────────────────────────────────────────

import htmlTagsReport from "@reports/html-tags/report.json";

// ── Customizations ────────────────────────────────────────────────────────────

import customizationsReport from "@reports/customizations/report.json";

// ── Re-exports ────────────────────────────────────────────────────────────────

export {
  perComponentSummary,
  sourcesReport,
  htmlTagsReport,
  customizationsReport,
};

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
