import { MENU_ITEMS, MENU_SEPARATORS, ROWS, mix, role } from "../recipes/shared";
import { definePack, roles, say, SERIF_RAMP } from "../types";

/** what is chosen, hovered or open, by whatever attribute the part says it with */
const LIT = `:is([aria-selected=true],[aria-current=true],[aria-current=page],[data-active]:not([data-active=false]),[data-highlighted],[data-popup-open],[class~="bg-secondary-container"],:hover,:focus-visible)`;
/** the parts that are lines of a menu: rows, side tabs, menu entries, a table's rows */
const LINES = `:is(${ROWS},[data-slot=side-tabs-item],[data-slot=sidebar-menu-button],[data-slot=navigation-menu-trigger],[data-slot=menubar-trigger],[data-slot=command-item],[data-slot=table-row],${MENU_ITEMS})`;
const GOLD = (a: number) => mix("primary", a);
/** a hairline of gold, brightest near the left and gone before the right */
const HAIR = `linear-gradient(90deg,transparent,${GOLD(72)} 16%,${GOLD(30)} 60%,transparent 92%)`;
/** Elden Ring's chosen line: a soft band of light, strongest at the left, a fading hairline above and below it */
const BAND = `background-color:transparent;background-image:${HAIR},${HAIR},linear-gradient(90deg,${GOLD(6)},${GOLD(30)} 14%,${GOLD(12)} 62%,transparent);background-size:100% 1px,100% 1px,100% 100%;background-position:0 0,0 100%,0 0;background-repeat:no-repeat;color:${role("on-surface")}`;
/** short bright strokes at the four corners of a frame, over its hairline */
const CORNERS = (c: string, n = 10) =>
  `background-image:${Array(8).fill(`linear-gradient(${c},${c})`).join(",")};background-size:${Array(4).fill(`${n}px 1px,1px ${n}px`).join(",")};background-position:0 0,0 0,100% 0,100% 0,0 100%,0 100%,100% 100%,100% 100%;background-repeat:no-repeat`;
/** what floats over a screen: a tooltip, a dialog, a popover, a hover card, a notice */
const WINDOWS = `:is([data-slot=tooltip-content],[data-slot=dialog-content],[data-slot=alert-dialog-content],[data-slot=popover-content],[data-slot=hover-card-content],[data-slot=snackbar],[data-slot=toast])`;
/** the places a game keeps one thing each */
const SLOTS = `:is([data-slot=inventory-cell],[data-slot=item-cell-frame],[data-slot=reward-track-cell],[data-slot=grid-wheel-cell],[data-slot=slot-machine-cell])`;
/** the weight of one id, which every element matches: it lifts a rule over the panel recipe, whose selector is long, without
 *  naming anything about how a part is built */
const FIRM = ":not(#_)";

/* looked at in Elden Ring's menus on Interface In Game */
export default definePack({
  key: "souls",
  name: say("艾尔登法环", "Elden Ring", "Elden Ring", "Elden Ring"),
  hint: say("魂系：近黑褐底、衬线体、纯文字菜单、选中时淡出的暗金光带", "Souls-like: near-black brown, serif type, text-only menus, a fading dark-gold band on the selected row", "ソウルライク：文字だけのメニューと暗い金", "소울라이크: 글자만 있는 메뉴와 어두운 금색"),
  refs: ["Elden Ring", "Baldur's Gate 3"],
  basis: "observed",
  group: "pcGame",
  seed: "#C8AA6E",
  mode: "dark",
  light: roles({ p: ["#6E5210", "#FFF6DD"], pc: ["#EBD193", "#332400"], s: ["#5E5540", "#FFFFFF"], sc: ["#E4D9BE", "#2A1C0C"], t: ["#8E2A1E", "#FFFFFF"], tc: ["#F2CFC6", "#3D1510"], bg: ["#F2EAD6", "#F8F2E2", "#F4EDDB", "#E9DFC6", "#E0D4B6"], text: ["#2A1C0C", "#57482F"], line: ["#7A6A45", "#C9BB97"] }),
  dark: roles({ p: ["#C8AA6E", "#17130B"], pc: ["#3A3020", "#E6DCC3"], s: ["#A89F8A", "#14120C"], sc: ["#2A2519", "#E6DCC3"], t: ["#D85A4A", "#1A0502"], tc: ["#3D1510", "#FFD6CF"], bg: ["#0E0D0A", "#17150F", "#1C1A13", "#24211A", "#2C2820"], text: ["#E6DCC3", "#A89F8A"], line: ["#7A6A45", "#3A3324"] }),
  shape: "none",
  font: "garamond",
  display: "cinzel",
  icons: "game",
  motion: "standard",
  control: "extra-small",
  pill: "follow",
  screenDark: "radial-gradient(120% 90% at 50% 40%, transparent 35%, rgb(0 0 0 / 0.6) 100%)",
  screen: "radial-gradient(120% 90% at 50% 40%, transparent 50%, rgb(90 60 20 / 0.22) 100%)",
  tokens: { rim: "#7A6A45", rimDark: "#3A3324", tabOn: "#C8AA6E", navOn: "#C8AA6E", toggleOn: "#C8AA6E" },
  recipes: { picker: "boxed", button: "text", surface: "hairline", tabs: "fade", toggle: "block", slider: "thin", nav: "plain", field: "line", bar: "plain", meter: "thin", feedback: "dim", list: "plain", dialog: "plain", avatar: "framed", segmented: "underline", appbar: "compact", search: "underline", input: "underline", progress: "thin", divider: "ornament", menu: "plain", sheet: "panel", tooltip: "rim", fab: "flat", badge: "square", icon: "muted", text: "caps", dialogue: "band", scroll: "thin" },
  art: "dark gothic fantasy painting, ruined cathedrals in fog, muted gold light, desaturated, a golden tree on the horizon",
  ux: { margin: 24, gap: 8, tight: 0, nav: "rail" },
  layout: { zh: "几乎全黑：左边一列文字菜单，选中行从左向右淡出暗金光带；数据小而密地排成几列；底部一行按键提示。", en: "Nearly black: a column of words at the left whose chosen row is lit by a dark-gold band fading to the right; small dense columns of figures; a line of key hints along the foot." },
  type: SERIF_RAMP(20),
  /* Everything is a frame of two gold hairlines on near-black; the chosen line of any list is the band of light the
     game draws; switches, checks and sliders are hairlines with a small gold mark, never filled shapes. */
  css: `:is([data-slot=card],[data-slot=sheet-content],[data-surface=card],[data-surface=panel])${FIRM}{outline-color:${GOLD(30)}}
${WINDOWS}${FIRM}{background-color:${mix("surface-container-low", 94)};color:${role("on-surface")};border:1px solid var(--st-rim);border-radius:0;outline:1px solid ${GOLD(30)};outline-offset:3px;${CORNERS(role("primary"))};box-shadow:0 10px 40px rgb(0 0 0/.6)}
[data-slot=tooltip-content]{padding:8px 12px;outline-offset:2px}
:is([data-slot=dialog-title],[data-slot=alert-dialog-title]){font-family:var(--st-display,inherit);text-transform:uppercase;letter-spacing:.08em;color:${role("on-surface")}}
:is([data-slot=dialog-footer],[data-slot=alert-dialog-footer]){padding-top:12px;background-image:linear-gradient(90deg,transparent,var(--st-rim),transparent);background-size:100% 1px;background-repeat:no-repeat}
[data-slot=snackbar-action]{color:${role("primary")}}
${LINES}{border-radius:0}
${LINES}${LIT}${FIRM}{${BAND};border-color:transparent;outline:0;box-shadow:none}
:is([data-slot=tabs-trigger][data-active],[data-slot=toggle-group-item][data-pressed],[data-slot=pagination-link][data-active=true])${FIRM}{${BAND};border-color:transparent}
[data-slot=side-tabs]{gap:0}
:is(${MENU_SEPARATORS}){background-color:transparent;background-image:linear-gradient(90deg,transparent,var(--st-rim),transparent)}
[data-slot=switch]{border:1px solid var(--st-rim);background-color:transparent;border-radius:0}
[data-slot=switch][data-checked]{background-color:${GOLD(14)};border-color:${GOLD(80)}}
[data-slot=switch] [data-slot=switch-thumb]{rotate:45deg;border-radius:0;background-color:${role("on-surface-variant")}}
[data-slot=switch][data-size=default] [data-slot=switch-thumb]{width:12px;height:12px;translate:9px -50%}
[data-slot=switch][data-size=default] [data-slot=switch-thumb][data-checked]{translate:31px -50%}
[data-slot=switch] [data-slot=switch-thumb][data-checked]{background-color:${role("primary")};box-shadow:0 0 8px ${GOLD(70)}}
[data-slot=checkbox]{border-width:1px;border-color:var(--st-rim);border-radius:0}
[data-slot=checkbox][data-checked]{background-color:transparent;border-color:${role("primary")};color:${role("primary")}}
[data-slot=radio-group-item]{border-width:1px}
[data-slot=slider] [data-slot=slider-track]{height:2px}
[data-slot=slider] [data-slot=slider-thumb]{width:12px;height:12px;rotate:45deg;border-radius:0;background-color:${role("primary")};box-shadow:0 0 0 3px ${role("surface")},0 0 10px ${GOLD(60)}}
:is([data-slot=badge],[data-slot=notification-badge],[data-slot$="-badge"]){background-color:transparent;color:${role("primary")};box-shadow:inset 0 0 0 1px var(--st-rim);border-radius:0}
[data-slot=table-head]{font-family:var(--st-display,inherit);text-transform:uppercase;letter-spacing:.1em;font-size:var(--text-label-medium);color:${role("on-surface-variant")}}
[data-slot=table-header] [data-slot=table-row]{border-bottom:0;background-image:${HAIR};background-size:100% 1px;background-position:0 100%;background-repeat:no-repeat}
[data-slot=table-row]{border-bottom-color:${GOLD(12)}}
:is([data-slot=settings-group-title],[data-slot=sidebar-group-label],[data-slot=check-in-title]){font-family:var(--st-display,inherit);letter-spacing:.08em}
${SLOTS}${FIRM}{border-radius:0;box-shadow:inset 0 0 0 1px ${GOLD(26)};background-image:radial-gradient(80% 80% at 50% 40%,${GOLD(8)},transparent)}
${SLOTS}:is([aria-pressed=true],[data-lit])${FIRM}{background-color:${role("surface-container-high")};box-shadow:inset 0 0 0 1px ${role("primary")},0 0 12px ${GOLD(40)};color:${role("primary")}}
:is([data-slot=level-map-cell],[data-slot=game-board-cell],[data-slot=skill-button-face]){border-radius:0}
[data-slot=skill-button-face]{box-shadow:inset 0 0 0 1px var(--st-rim),0 0 0 3px ${role("surface")},0 0 0 4px ${GOLD(30)}}
[data-slot=game-board-cell]{box-shadow:inset 0 0 0 1px ${GOLD(22)}}`,
});
