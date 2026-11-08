import type { ComponentType } from "react";

import { Box, Container, Icon, Image, Separator, Shape, Spacer, Svg_, Text } from "./atoms/basics";
import { Button, Checkbox, Chip, IconButton, Input, Label, Link, Radio, Rating, Slider, Switch, Textarea, Toggle } from "./atoms/controls";
import { Avatar, Badge, CircularProgress, Dot, Kbd, LoadingIndicator, PageDots, Progress, Skeleton, Spinner, TypingIndicator } from "./atoms/indicators";
import { AppBar, Fab, NavigationBar, Search, Tabs } from "./composites/bars";
import { Alert, Card, Carousel, ListItem, Snackbar } from "./composites/content";
import { ButtonGroup, DatePicker, Menu, SegmentedButton, Select, TextField, TimePicker } from "./composites/forms";
import { Accordion, CodeBlock, FileUpload, IconGrid, InputGroup, RadioGroup, Scene, Sidebar } from "./composites/more";
import { ActionSheet, AlertDialog, Dialog, Sheet } from "./composites/overlays";
import { NATIVE, type NativeName, type NativeSlug } from "./coverage";
import { SplitView } from "./split";
/* D4: the game parts, and actions, menus and search */
import { BrandButton, CascadingMenu, Command, ContextMenu, FabMenu, FilterBar, SplitButton } from "./composites/actions";
import { EggSmash, Gacha, GameBoard, GridDraw, Joystick, LevelMap, MoneyTree, PrizeWheel, SkillButton, SlotMachine } from "./composites/games";

/* Every component the kit draws a part with, by the name coverage.ts gives it, and by the part's id. */

export const BY_NAME = {
  Box,
  Container,
  SplitView,
  Text,
  Icon,
  Svg: Svg_,
  Image,
  Separator,
  Spacer,
  Shape,
  Button,
  IconButton,
  Toggle,
  Chip,
  Switch,
  Checkbox,
  Radio,
  Slider,
  Input,
  Textarea,
  Label,
  Link,
  Rating,
  Badge,
  Avatar,
  Progress,
  CircularProgress,
  Spinner,
  Dot,
  Skeleton,
  Kbd,
  PageDots,
  LoadingIndicator,
  TypingIndicator,
  AppBar,
  NavigationBar,
  ListItem,
  Card,
  TextField,
  Search,
  Tabs,
  Dialog,
  AlertDialog,
  Sheet,
  ActionSheet,
  Snackbar,
  Fab,
  SegmentedButton,
  ButtonGroup,
  Menu,
  Select,
  DatePicker,
  TimePicker,
  Carousel,
  Alert,
  RadioGroup,
  InputGroup,
  IconGrid,
  Accordion,
  CodeBlock,
  FileUpload,
  Scene,
  Sidebar,
  /* D4: the game parts, and actions, menus and search */
  PrizeWheel,
  GridDraw,
  Gacha,
  SlotMachine,
  MoneyTree,
  EggSmash,
  Joystick,
  SkillButton,
  LevelMap,
  GameBoard,
  SplitButton,
  FabMenu,
  BrandButton,
  Command,
  ContextMenu,
  FilterBar,
  CascadingMenu,
} satisfies Record<NativeName, ComponentType<never>>;

/** the component that draws each part the kit covers, by the part's id */
export const COMPONENTS = Object.fromEntries(Object.entries(NATIVE).map(([slug, name]) => [slug, BY_NAME[name]])) as unknown as Record<NativeSlug, ComponentType<never>>;
