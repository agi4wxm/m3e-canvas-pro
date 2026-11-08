import type { P, PropDef } from "./types";

/* What a part is called to a screen reader where it shows no words of its own (docs/组件规范.md "无障碍"): an icon-only
 * button, an input with no visible label. The author names it with `ariaLabel`; left empty, an icon is called by what
 * it means ("Back", "More"), in the canvas's or the page's language, never by its Material Symbols name. */

/** the prop an author names a part with for a screen reader, where nothing it shows names it */
export const ARIA_LABEL = "ariaLabel";

export const ariaLabelProp = (when?: (p: P) => boolean): PropDef => ({
  key: ARIA_LABEL,
  label: "Accessible name",
  labels: { ja: "読み上げ名", zh: "无障碍名称", ko: "접근성 이름" },
  kind: "text",
  default: "",
  ...(when ? { when } : {}),
});

/** What an icon means, in English words the parts say (parts/labels.ts COMMON_TEXT has them in every language), for
 *  the icons buttons are most often made of. */
export const ICON_WORDS: Record<string, string> = {
  arrow_back: "Back",
  arrow_back_ios: "Back",
  arrow_back_ios_new: "Back",
  chevron_left: "Previous",
  chevron_right: "Next",
  arrow_forward: "Next",
  arrow_forward_ios: "Next",
  navigate_next: "Next",
  navigate_before: "Previous",
  close: "Close",
  cancel: "Close",
  menu: "Menu",
  more_vert: "More",
  more_horiz: "More",
  search: "Search",
  add: "Add",
  add_circle: "Add",
  remove: "Remove",
  edit: "Edit",
  delete: "Delete",
  share: "Share",
  favorite: "Favorite",
  favorite_border: "Favorite",
  bookmark: "Save",
  bookmark_border: "Save",
  settings: "Settings",
  home: "Home",
  person: "Profile",
  account_circle: "Account",
  notifications: "Notifications",
  send: "Send",
  mic: "Microphone",
  call: "Call",
  videocam: "Camera",
  photo_camera: "Camera",
  play_arrow: "Play",
  pause: "Pause",
  stop: "Stop",
  skip_next: "Next",
  skip_previous: "Previous",
  refresh: "Refresh",
  filter_list: "Filter",
  sort: "Sort",
  download: "Download",
  upload: "Upload",
  content_copy: "Copy",
  check: "Done",
  done: "Done",
  info: "Information",
  help: "Help",
  shopping_cart: "Cart",
  attach_file: "Attach",
  expand_more: "Expand",
  expand_less: "Collapse",
  visibility: "Show",
  visibility_off: "Hide",
  open_in_new: "Open",
  logout: "Sign out",
  light_mode: "Light mode",
  dark_mode: "Dark mode",
  thumb_up: "Like",
  chat: "Chat",
  mail: "Mail",
  calendar_today: "Calendar",
  schedule: "Time",
  location_on: "Location",
  star: "Star",
  format_bold: "Bold",
  format_italic: "Italic",
  format_underlined: "Underline",
};

/** words for an icon no list names: its name as words ("view_list" → "View list"), the most a reader can be told */
const asWords = (icon: string) => {
  const w = icon.replace(/_/g, " ").trim();
  return w ? w[0].toUpperCase() + w.slice(1) : "";
};

/** what an icon means, in the language the part speaks (`p.say`), or "" for no icon */
export const iconMeaning = (p: Pick<P, "say">, icon: string): string => (icon ? p.say(ICON_WORDS[icon] ?? asWords(icon)) : "");

/** The name of a part that shows no words: the author's `ariaLabel` when it has one, else the first of the fallbacks
 *  given (what it would otherwise be called). */
export function nameFor(p: P, ...fallbacks: string[]): string {
  const own = p.s(ARIA_LABEL).trim();
  return own || fallbacks.find((f) => !!f?.trim()) || "";
}
