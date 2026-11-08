/* Which parts the kit draws with a component of its own, by the part's id, and the component's name. Plain data with no
 * imports: the code printer reads it (lib/export/miniapp), and a test holds every name here to a component the kit
 * exports. A part that is not here is printed as the tree of atoms it splits into when it has one (parts/defs/splits.ts),
 * and as a `Placeholder` naming it otherwise; a kit (parts/kits) is atoms already. */

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
  "mini-program-header": "MiniProgramHeader",
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
  "dropdown-menu": "Menu",
  select: "Select",
  "date-picker": "DatePicker",
  "time-picker": "TimePicker",
  alert: "Alert",
  "radio-group": "RadioGroup",
  "file-upload": "FileUpload",
  /* D1: media, the capability views' stand-ins (composites/media.tsx), and what talks and keeps time (composites/live.tsx) */
  carousel: "Carousel",
  "expressive-carousel": "ExpressiveCarousel",
  video: "Video",
  "web-view": "WebPage",
  animation: "Animation",
  camera: "CameraStandIn",
  map: "MapStandIn",
  "photo-grid": "PhotoGrid",
  "audio-player": "AudioPlayer",
  marquee: "Marquee",
  playlist: "Playlist",
  "qr-code": "QrCode",
  scene: "Scene",
  "image-viewer": "ImageViewer",
  "image-cropper": "ImageCropper",
  "story-row": "StoryRow",
  "voice-message": "VoiceMessage",
  "video-call": "CallStandIn",
  marker: "Marker",
  "message-scroller": "MessageScroller",
  questionnaire: "Questionnaire",
  "shimmer-text": "ShimmerText",
  "number-ticker": "NumberTicker",
  timer: "Timer",
} as const;

export type NativeSlug = keyof typeof NATIVE;
export type NativeName = (typeof NATIVE)[NativeSlug];

export const isNative = (slug: string): slug is NativeSlug => Object.prototype.hasOwnProperty.call(NATIVE, slug);

/** A part's prop the kit takes under another name: React keeps `style` for styles, and a part's look keeps `fill` for
 *  its fill role. By part, `*` for every part. */
export const PROP_RENAMES: Record<string, Record<string, string>> = { "*": { style: "styleVariant" }, container: { fill: "ground" } };

/** the name the kit takes a part's prop under */
export const kitPropName = (slug: string, key: string): string => PROP_RENAMES[slug]?.[key] ?? PROP_RENAMES["*"][key] ?? key;

/** the parts whose value a person enters, and the prop that holds it (lib/interact.ts INPUT_PROP, and the pickers) */
export const INPUT_PROPS: Record<string, string> = {
  input: "value",
  "text-field": "value",
  textarea: "value",
  switch: "checked",
  checkbox: "checked",
  slider: "value",
  select: "selected",
  "radio-group": "selected",
  rating: "value",
  "file-upload": "value",
  "date-picker": "value",
  "time-picker": "value",
  search: "value",
};
