/* Which parts the kit draws with a component of its own, by the part's id, and the component's name. Plain data with no
 * imports: the code printer reads it (lib/export/rn), and a test holds every name here to a component the kit exports.
 * A part that is not here is printed as the tree of atoms it splits into when it has one (parts/defs/splits.ts), and as
 * a `Placeholder` naming it otherwise; a kit (parts/kits) is atoms already. */

export const NATIVE = {
  /* atoms */
  box: "Box",
  text: "Text",
  icon: "Icon",
  svg: "Svg",
  image: "Image",
  separator: "Separator",
  spacer: "Spacer",
  button: "Button",
  "icon-button": "IconButton",
  input: "Input",
  textarea: "Textarea",
  switch: "Switch",
  checkbox: "Checkbox",
  radio: "Radio",
  slider: "Slider",
  chip: "Chip",
  badge: "Badge",
  avatar: "Avatar",
  progress: "Progress",
  "circular-progress": "CircularProgress",
  spinner: "Spinner",
  dot: "Dot",
  label: "Label",
  toggle: "Toggle",
  skeleton: "Skeleton",
  kbd: "Kbd",
  shape: "Shape",
  rating: "Rating",
  link: "Link",
  "page-dots": "PageDots",
  "loading-indicator": "LoadingIndicator",
  "typing-indicator": "TypingIndicator",
  /* the plain container "add auto layout" makes, and the composites screens use most */
  container: "Container",
  /* a split view: two panes and a divider a finger drags (split.tsx) */
  "split-view": "SplitView",
  "app-bar": "AppBar",
  "navigation-bar": "NavigationBar",
  item: "ListItem",
  card: "Card",
  "text-field": "TextField",
  search: "Search",
  tabs: "Tabs",
  dialog: "Dialog",
  "alert-dialog": "AlertDialog",
  sheet: "Sheet",
  "action-sheet": "ActionSheet",
  sonner: "Snackbar",
  fab: "Fab",
  "toggle-group": "SegmentedButton",
  "button-group": "ButtonGroup",
  "dropdown-menu": "Menu",
  select: "Select",
  "date-picker": "DatePicker",
  "time-picker": "TimePicker",
  carousel: "Carousel",
  alert: "Alert",
  "radio-group": "RadioGroup",
  "input-group": "InputGroup",
  "icon-grid": "IconGrid",
  accordion: "Accordion",
  "code-block": "CodeBlock",
  "file-upload": "FileUpload",
  scene: "Scene",
  sidebar: "Sidebar",
  /* D5: layouts that fold, scroll, keep a shape or hold parts under a header (composites/layouts.tsx), ways of getting
     around (composites/navs.tsx), and what floats off a trigger or an edge (composites/floating.tsx) */
  collapsible: "Collapsible",
  "scroll-area": "ScrollArea",
  "aspect-ratio": "AspectRatio",
  stack: "Stack",
  "grid-view": "GridView",
  dock: "Dock",
  "supporting-pane": "SupportingPane",
  custom: "CustomComponent",
  "navigation-rail": "NavigationRail",
  pagination: "Pagination",
  "navigation-menu": "NavigationMenu",
  "floating-nav": "FloatingNav",
  "mini-program-header": "MiniProgramHeader",
  toc: "TableOfContents",
  "slide-group": "SlideGroup",
  onboarding: "Onboarding",
  tooltip: "Tooltip",
  "side-sheet": "SideSheet",
  drawer: "Drawer",
  popover: "Popover",
  "hover-card": "HoverCard",
} as const;

export type NativeSlug = keyof typeof NATIVE;
export type NativeName = (typeof NATIVE)[NativeSlug];

export const isNative = (slug: string): slug is NativeSlug => Object.prototype.hasOwnProperty.call(NATIVE, slug);

/** A part's prop the kit takes under another name: React Native keeps `style` for styles, and a part's look keeps
 *  `fill` for its fill role. By part, `*` for every part. */
export const PROP_RENAMES: Record<string, Record<string, string>> = { "*": { style: "styleVariant" }, container: { fill: "ground" } };

/** the name the kit takes a part's prop under */
export const kitPropName = (slug: string, key: string): string => PROP_RENAMES[slug]?.[key] ?? PROP_RENAMES["*"][key] ?? key;
