/* The React Native kit M3E Canvas exports a design's mobile app with: one component per part the editor has (or a tree of
 * atoms, or a placeholder), the theme they read, and what a printed screen stands on. See docs/手机端.md. */

export { Box, Cell, Container, Icon, Image, Separator, Shape, Spacer, Svg_ as Svg, Text, type BoxProps, type PartBase, type TextProps } from "./atoms/basics";
export { Button, Checkbox, Chip, IconButton, Input, Label, Link, Radio, Rating, Slider, Switch, Textarea, Toggle, type ButtonProps } from "./atoms/controls";
export { Avatar, Badge, CircularProgress, Dot, Kbd, LoadingIndicator, PageDots, Progress, Skeleton, Spinner, TypingIndicator } from "./atoms/indicators";
export { AppBar, Fab, NavigationBar, Search, Tabs } from "./composites/bars";
export { Alert, Card, Carousel, ListItem, Snackbar } from "./composites/content";
export { ButtonGroup, DatePicker, Menu, SegmentedButton, Select, TextField, TimePicker } from "./composites/forms";
export { Accordion, CodeBlock, FileUpload, IconGrid, InputGroup, RadioGroup, Scene, Sidebar } from "./composites/more";
export { ActionSheet, AlertDialog, Dialog, Sheet } from "./composites/overlays";
export { Placeholder } from "./Placeholder";
export { At, NavProvider, OverlayFrame, Pin, Screen, ScreenStack, useNav, type GoOptions, type Nav, type ScreenComponent } from "./runtime";
export { AppProvider, SnackHost, optionOf, rowsOf, useAct, useAfter, useApp, type Action, type ActionBody, type AppState, type AppVar, type Condition, type Effect, type EffectHandler, type Here, type Reader, type Scope, type ScreenParts, type VarValue } from "./app";
export { Repeat, type RepeatProps } from "./list";
export { SplitView, type SplitViewProps } from "./split";
export { dateOfValue, dayOf, timeOf, usePicker } from "./picker";
export { Glyph, glyphFor, hasGlyph, registerIcons, type IconData } from "./icons/Icon";
export { KIT_ICONS } from "./icons/names";
export { Surface } from "./Surface";
export { UNMAPPED, colorOf, paint, type Appearance, type Corners, type Look } from "./look";
export { ThemeProvider, Ink, useKit, type Kit } from "./theme/ThemeProvider";
export type { KitTheme, ThemeMode, TypeStep } from "./theme/types";
export { MATERIAL } from "./theme/default.generated";
export { NATIVE, isNative, kitPropName } from "./coverage";
export { BY_NAME, COMPONENTS } from "./registry";
export { TreeView, type TreeNode } from "./tree";
export { PARTS, type PartInfo } from "./parts.generated";
/* D4: the game parts, and actions, menus and search */
export { BrandButton, CascadingMenu, Command, ContextMenu, FabMenu, FilterBar, SplitButton, brandCapability, brandWords, commandMatches, toggled, type BrandButtonProps, type CascadingMenuProps, type CommandProps, type ContextMenuProps, type FabMenuProps, type FilterBarProps, type SplitButtonProps } from "./composites/actions";
export { DRAW_START, EggSmash, Gacha, GameBoard, GridDraw, Joystick, LevelMap, MoneyTree, PrizeWheel, SPIN_MS, SkillButton, SlotMachine, angleOf, boardOf, boardStatus, cooldownLeft, drawAnswer, drawBusy, drawPress, drawRun, drawShown, fromAngle, givenOf, levelAt, litOf, pickedOf, pushOf, reelAt, reelsOf, starsOf, vecOf, wheelTurn, wordsOfVec, type DrawProps, type DrawState, type GameBoardProps, type JoystickProps, type LevelMapProps, type SkillButtonProps, type SlotMachineProps, type Vec } from "./composites/games";
/* D2: data and charts, lists and desktop parts */
export { Agenda, BarList, Chart, DataTable, FunnelChart, GanttChart, Gauge, Heatmap, Kanban, Markdown, ScatterPlot, Sparkline, Table, type TableData } from "./composites/data";
export { FileDiff, FileList, Menubar, SortableList, SwipeRow, Tracker, Tree, Window } from "./composites/desk";
