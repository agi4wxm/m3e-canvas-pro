import { MENU_ITEMS, MENU_SEPARATORS, PANELS, ROWS, mix, role } from "../recipes/shared";
import { definePack, roles, say, SERIF_RAMP } from "../types";

/** what is chosen, hovered or open, by whatever attribute the part says it with */
const LIT = `:is([aria-selected=true],[aria-current=true],[aria-current=page],[data-active]:not([data-active=false]),[data-highlighted],[data-popup-open],[class~="bg-secondary-container"],:hover,:focus-visible)`;
/** the parts that are lines of a menu: rows, side tabs, menu entries, a table's rows */
const LINES = `:is(${ROWS},[data-slot=side-tabs-item],[data-slot=sidebar-menu-button],[data-slot=navigation-menu-trigger],[data-slot=menubar-trigger],[data-slot=command-item],[data-slot=table-row],${MENU_ITEMS})`;
/** the vermilion of a seal, and the paper it is pressed on */
const SEAL = "#B0331F";
const PAPER = "#F2EDE0";
/** the bronze line of a lacquer box, brightest in its middle */
const BRONZE_LINE = `linear-gradient(90deg,transparent,var(--st-rim) 18%,var(--st-rim) 82%,transparent)`;
/** Black Myth's chosen line: a band of pale paper whose ends dissolve, the words on it dark */
const BAND = `background-color:transparent;background-image:linear-gradient(90deg,transparent,${role("primary")} 10%,${role("primary")} 88%,transparent);color:${role("on-primary")}`;
const svg = (s: string) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
/** an auspicious cloud: two curls back to back, trailing off at either side */
const CLOUD = svg(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 14' width='40' height='14'><g fill='none' stroke='#A7844E' stroke-width='1.3' stroke-linecap='round'><path d='M20 11.5C15 11.5 12 9.8 12 7.2S14 3.4 16.2 4.1s2 3.4-.4 3.6'/><path d='M20 11.5C25 11.5 28 9.8 28 7.2S26 3.4 23.8 4.1s-2 3.4.4 3.6'/><path d='M12 7.2C8.5 7.2 6 8.6 1 8.6M28 7.2C31.5 7.2 34 8.6 39 8.6'/></g></svg>`,
);
/** the lines across a panel that part one thing from the next */
const ACROSS = `:is([data-slot=separator],[data-slot=item-separator],[data-slot=dialog-divider],[data-slot$="-divider"]):not([data-orientation=vertical])`;
/** the places a game keeps one thing each */
const SLOTS = `:is([data-slot=inventory-cell],[data-slot=item-cell-frame],[data-slot=reward-track-cell],[data-slot=grid-wheel-cell],[data-slot=slot-machine-cell])`;
/** what is drawn round on purpose, an egg or a ball, which a frame with straight edges would spoil */
const ROUND = `[data-slot=egg-smash-item],[data-slot=gacha-dot],[data-slot=gacha-media],[data-slot=wheel-track]`;
const WINDOWS = `:is([data-slot=tooltip-content],[data-slot=snackbar],[data-slot=toast])`;

/* looked at in Black Myth's menus on Interface In Game */
export default definePack({
  key: "wukong",
  name: say("黑神话：悟空", "Black Myth: Wukong", "黒神話：悟空", "검은 신화: 오공"),
  hint: say("国风暗黑：纯黑底、漆黑面板配铜线、选中项是边缘虚化的米白色带、朱红印章点缀", "Chinese dark fantasy: pure black, lacquer panels with bronze lines, a pale band with faded edges on the selected row, vermilion seals", "国風ダーク：黒地と淡い帯、朱の印", "동양풍 다크: 검정 바탕과 옅은 띠, 붉은 낙관"),
  refs: ["Black Myth: Wukong"],
  basis: "observed",
  group: "pcGame",
  seed: "#A8A090",
  mode: "dark",
  light: roles({ p: ["#1A1814", "#F2EDE0"], pc: ["#E9E3D3", "#1A1814"], s: ["#5A5448", "#FFFFFF"], sc: ["#E9E3D3", "#1A1814"], t: ["#A63D1C", "#FFFFFF"], tc: ["#F5D9CC", "#3D1A0E"], bg: ["#F2EDE0", "#FAF7EF", "#F7F3E8", "#E9E3D3", "#DED7C4"], text: ["#1A1814", "#4F4A3F"], line: ["#7A7364", "#CFC8B5"] }),
  dark: roles({ p: ["#E8E2D2", "#0A0A0A"], pc: ["#2A261D", "#E8E2D2"], s: ["#A8A090", "#0A0A0A"], sc: ["#1A1814", "#E8E2D2"], t: ["#E0693A", "#1F0A02"], tc: ["#3D1A0E", "#FFD9C7"], bg: ["#0A0A0A", "#121110", "#161513", "#1E1C19", "#26231F"], text: ["#E8E2D2", "#A8A090"], line: ["#6E675A", "#2E2B26"] }),
  shape: "none",
  font: "garamond",
  display: "brush",
  icons: "game",
  motion: "standard",
  control: "extra-small",
  pill: "follow",
  screenDark: "radial-gradient(90% 70% at 70% 45%, rgb(120 80 30 / 0.22), transparent 70%)",
  tokens: { rim: "#8C6D3F", rimDark: "#3A2E1E", tabOn: "var(--md-sys-color-primary)", navOn: "var(--md-sys-color-primary)", toggleOn: "var(--md-sys-color-primary)" },
  recipes: { picker: "boxed", button: "band", surface: "plain", tabs: "band", toggle: "block", slider: "thin", nav: "plain", field: "line", bar: "plain", meter: "thin", feedback: "dim", list: "plain", dialog: "plain", segmented: "underline", appbar: "compact", search: "underline", input: "underline", progress: "thin", divider: "ornament", menu: "plain", sheet: "panel", tooltip: "dark", fab: "flat", badge: "square", dialogue: "band", scroll: "hidden" },
  art: "Chinese mythological dark fantasy, ancient temples in misty mountains, autumn gold and ember light, photorealistic and cinematic",
  ux: { margin: 24, gap: 8, tight: 0, nav: "top" },
  layout: { zh: "纯黑底，左上角淡淡的大号书法字；顶部一行文字标签，选中项是米白色带；左边文字列表，右边留白或插画；右下角按键提示。", en: "Pure black with a large faint calligraphic character at the upper left; a line of text tabs on top with the chosen one a pale band; a text list at the left, emptiness or a picture at the right; key hints at the lower right." },
  type: SERIF_RAMP(24),
  /* Panels are black lacquer ruled above and below in bronze; a divider is a bronze line with a cloud at its middle;
     the chosen line of any list is the pale band the game draws; what is on, checked or counted is a vermilion seal. */
  css: `:is(${PANELS}):where(:not(${ROUND})){background-image:linear-gradient(180deg,${mix("primary", 4)},${mix("surface", 60)});border:0;border-block:1px solid transparent;border-image:${BRONZE_LINE} 1;box-shadow:0 14px 36px rgb(0 0 0/.35)}
${WINDOWS}{background-color:${mix("surface-container-low", 96)};color:${role("on-surface")};border-radius:0;border:0;border-block:1px solid transparent;border-image:${BRONZE_LINE} 1}
[data-slot=snackbar-action]{color:${role("primary")}}
${ACROSS}{background-image:linear-gradient(90deg,transparent,var(--st-rim) 22%,var(--st-rim) calc(50% - 26px),transparent calc(50% - 26px) calc(50% + 26px),var(--st-rim) calc(50% + 26px),var(--st-rim) 78%,transparent)}
${ACROSS}::after{width:40px;height:14px;rotate:0deg;background:${CLOUD} center/40px 14px no-repeat;box-shadow:none}
:is([data-slot=dialog-title],[data-slot=alert-dialog-title],[data-slot=sheet-title],[data-slot=empty-title])::before{content:"";display:inline-block;width:.56em;height:.56em;margin-right:.45em;vertical-align:.1em;rotate:-6deg;border-radius:2px;background-color:${SEAL};box-shadow:0 0 0 1px color-mix(in srgb,${SEAL} 40%,transparent)}
:is([data-slot=settings-group-title],[data-slot=sidebar-group-label],[data-slot=check-in-title]){color:var(--st-rim);font-family:var(--st-display,inherit)}
${LINES}{border-radius:0}
${LINES}${LIT}{${BAND};border-color:transparent;outline:0;box-shadow:none}
${LINES}${LIT} :is([data-slot$="-title"],[data-slot$="-subtitle"],[data-slot$="-meta"],[data-slot$="-value"],[data-slot=item-description],[data-slot$="-chevron"],[data-slot=icon]){color:inherit}
:is([data-slot=toggle-group-item][data-pressed],[data-slot=pagination-link][data-active=true]){${BAND};border-color:transparent}
[data-slot=side-tabs]{gap:0}
[data-slot=tabs-trigger][data-active]{color:${role("on-primary")}}
:is(${MENU_SEPARATORS}){background-color:transparent;background-image:linear-gradient(90deg,transparent,var(--st-rim),transparent)}
[data-slot=switch]{border:1px solid var(--st-rim);background-color:transparent;border-radius:0}
[data-slot=switch][data-checked]{background-color:color-mix(in srgb,${SEAL} 22%,transparent);border-color:${SEAL}}
[data-slot=switch] [data-slot=switch-thumb]{border-radius:0;background-color:${role("on-surface-variant")}}
[data-slot=switch] [data-slot=switch-thumb][data-checked]{background-color:${SEAL};box-shadow:inset 0 0 0 1px ${PAPER}}
:is([data-slot=checkbox],[data-slot=radio-group-item]){border-width:1px;border-color:var(--st-rim)}
[data-slot=checkbox]{border-radius:0}
[data-slot=checkbox][data-checked]{background-color:${SEAL};border-color:${SEAL};color:${PAPER}}
[data-slot=radio-group-indicator]{color:${SEAL}}
[data-slot=slider] [data-slot=slider-track]{height:2px}
[data-slot=slider] [data-slot=slider-thumb]{width:6px;height:20px;border-radius:0;background-color:${role("primary")};box-shadow:0 0 0 2px ${role("surface")},0 0 10px rgb(232 226 210/.4)}
:is([data-slot=badge],[data-slot=notification-badge],[data-slot$="-badge"]){background-color:${SEAL};color:${PAPER};border-radius:0}
:is([data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip]){border-color:var(--st-rim)}
[data-slot=table-head]{color:var(--st-rim);font-size:var(--text-label-medium);letter-spacing:.1em}
[data-slot=table-row]{border-bottom-color:${mix("outline", 30)}}
[data-slot=stat-bar-track]{outline-color:var(--st-rim)}
${SLOTS}{border:0;border-radius:0;background-image:none;background-color:${role("surface-container-low")};box-shadow:inset 0 0 0 1px ${mix("outline", 55)}}
${SLOTS}:is([aria-pressed=true],[data-lit]){background-color:${role("surface-container-high")};color:${role("on-surface")};box-shadow:inset 0 0 0 1px ${role("primary")},0 0 14px rgb(232 226 210/.25)}
:is([data-slot=level-map-cell],[data-slot=game-board-cell],[data-slot=skill-button-face]){border-radius:0}
[data-slot=level-map-cell][data-current]{background-color:${SEAL};color:${PAPER};box-shadow:none}
[data-slot=skill-button-face]{box-shadow:inset 0 0 0 1px var(--st-rim)}`,
});
