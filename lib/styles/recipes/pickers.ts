import type { Recipes } from "./catalog";
import { mix, role, type RecipeCss } from "./shared";

/* Dates and times: the month calendar (on its own, and in the date picker's popup) and the time picker. The calendar
 * names its header, its arrows, the weekday row, each cell and each day; the time picker names its selectors, its
 * dial and a wheel of turning columns that it keeps hidden until a style shows it in place of the dial. */

const CAL = `[data-slot=calendar]`;
const DAY = `[data-slot=calendar-day]`;
const CHOSEN = `:is([data-selected-single=true],[data-range-start=true],[data-range-end=true])`;
const PICKED = `${DAY}${CHOSEN}`;
const CELL = `[data-slot=calendar-cell]`;
/** a day's number: on its button where a day can be picked, on its cell where it cannot */
const NUMBER = `:is(${DAY},${CELL})`;
const TODAY_DAY = `${DAY}[data-today]:not(${CHOSEN})`;
const TODAY = `:is(${TODAY_DAY},${CELL}[data-today])`;
const ARROWS = `:is([data-slot=calendar-previous],[data-slot=calendar-next])`;
const TP = `[data-slot=time-picker]`;
const WHEEL = `[data-slot=time-picker-wheel]`;
const ITEM = `[data-slot=time-picker-item]`;
const POPUP = `[data-slot=date-picker-popup]`;

/** the time as a wheel: the selectors and the dial give way to columns of values, the chosen row in the middle */
const wheel = (row: number) => `${TP} :is([data-slot=time-picker-header],[data-slot=time-picker-dial],[data-slot=time-picker-mode]){display:none}
${WHEEL}{display:flex;justify-content:center;align-items:center;align-self:stretch}
[data-slot=time-picker-column]{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;min-width:64px}
${ITEM}{height:${row}px;line-height:${row}px;padding-inline:8px;color:${role("on-surface")};font-variant-numeric:tabular-nums;cursor:pointer}
[data-slot=time-picker-indicator]{position:absolute;left:0;right:0;top:50%;height:${row}px;translate:0 -50%}`;

export const PICKER_CSS: RecipeCss<Recipes["picker"]> = {
  m3: "",
  /* iOS: the inline calendar, its month at the left in bold with the arrows at the right in the accent, the chosen day
     a tinted disc and today in the accent; the time as a wheel on a grey band */
  ios: `${CAL}{--cell-size:40px}
[data-slot=calendar-header]{justify-content:flex-start;padding-inline:8px 0}
[data-slot=calendar-title]{font-size:17px;line-height:22px;font-weight:600;color:${role("on-surface")}}
[data-slot=calendar-title]::after{content:"\\203A";margin-left:6px;color:${role("primary")};font-weight:600}
[data-slot=calendar-nav]{justify-content:flex-end;gap:8px}
${ARROWS}{color:${role("primary")}}
${ARROWS} [data-icon]{width:22px;height:22px}
[data-slot=calendar-weekday]{font-size:13px;font-weight:600;text-transform:uppercase;color:${mix("on-surface-variant", 70)}}
${NUMBER}{font-size:20px;font-weight:400;color:${role("on-surface")}}
${DAY}{border:0}
${TODAY}{color:${role("primary")};font-weight:600}
${PICKED}{background-color:${mix("primary", 14)};color:${role("primary")};font-weight:600}
${DAY}[data-today]${CHOSEN}{background-color:${role("primary")};color:${role("on-primary")}}
[data-slot=calendar-cell][data-outside]{visibility:hidden}
${POPUP}{background-color:${role("surface-container-low")};border-radius:13px;box-shadow:0 10px 40px rgb(0 0 0/.16)}
[data-slot=date-picker-trigger]{color:${role("primary")}}
${TP}{background-color:${role("surface-container-low")};border-radius:13px;padding:12px 16px;gap:8px}
[data-slot=time-picker-title]{font-size:13px;color:${role("on-surface-variant")}}
${wheel(34)}
[data-slot=time-picker-indicator]{border-radius:8px;background-color:${mix("on-surface", 7)}}
${ITEM}{font-size:21px}
${ITEM}[data-distance="1"]{opacity:.42;scale:.92}
${ITEM}[data-distance="2"]{opacity:.18;scale:.84}`,
  /* WeUI: the month centered, the chosen day a green rounded square, today in green; the time as WeUI's picker,
     the chosen row between two hairlines and the rows above and below fading out */
  weui: `[data-slot=calendar-title]{font-size:17px;line-height:24px;font-weight:600;color:${role("on-surface")}}
${ARROWS}{color:${mix("on-surface-variant", 70)}}
[data-slot=calendar-weekday]{font-size:14px;color:${role("on-surface-variant")}}
${NUMBER}{font-size:16px;color:${role("on-surface")}}
${DAY}{border:0;border-radius:8px}
${TODAY}{color:${role("primary")};font-weight:600}
${PICKED}{background-color:${role("primary")};color:${role("on-primary")};border-radius:8px}
${CELL}[data-outside]{opacity:.3}
${POPUP}{background-color:${role("surface-container-low")};border-radius:12px;box-shadow:0 8px 24px rgb(0 0 0/.12)}
${TP}{background-color:${role("surface-container-low")};border-radius:12px;box-shadow:none;padding:16px;gap:8px}
[data-slot=time-picker-title]{align-self:center;font-size:17px;line-height:24px;font-weight:600;color:${role("on-surface")}}
${wheel(48)}
[data-slot=time-picker-indicator]{border-block:1px solid ${role("outline-variant")}}
${ITEM}{font-size:17px}
${ITEM}[data-distance="1"]{opacity:.45}
${ITEM}[data-distance="2"]{opacity:.18}`,
  /* Fluent, Ant Design: small square-cornered days, today ruled in the accent, the chosen one filled; the time as a
     panel of short columns, the chosen value tinted */
  boxed: `${CAL}{--cell-size:32px}
[data-slot=calendar-title]{font-size:14px;font-weight:600;color:${role("on-surface")}}
${ARROWS}{color:${role("on-surface-variant")}}
[data-slot=calendar-weekday]{font-size:12px;color:${role("on-surface-variant")}}
${NUMBER}{font-size:14px}
${DAY}{border-radius:var(--md-sys-shape-corner-extra-small)}
${TODAY}{color:${role("primary")}}
${TODAY_DAY}{border:1px solid ${role("primary")}}
${PICKED}{border-radius:var(--md-sys-shape-corner-extra-small)}
${TP}{border-radius:var(--md-sys-shape-corner-small);padding:8px;gap:8px;box-shadow:0 6px 16px rgb(0 0 0/.12)}
[data-slot=time-picker-title]{font-size:12px}
${wheel(28)}
[data-slot=time-picker-column]{min-width:56px;padding-inline:4px}
[data-slot=time-picker-column]+[data-slot=time-picker-column]{border-left:1px solid ${role("outline-variant")}}
${ITEM}{width:100%;font-size:14px;border-radius:var(--md-sys-shape-corner-extra-small)}
${ITEM}[data-active]{background-color:${mix("primary", 12)};font-weight:600}`,
  /* the games: each chosen day a plate of the accent inside the style's rim, today ringed by it; the dial ringed too */
  rim: `[data-slot=calendar-title]{font-family:var(--st-display,inherit);color:${role("on-surface")}}
${DAY}{border-radius:var(--st-control-r)}
${TODAY_DAY}{border:2px solid var(--st-rim)}
${PICKED}{border-radius:var(--st-control-r);box-shadow:0 0 0 2px var(--st-rim),0 2px 0 2px var(--st-rim-dark)}
${TP}{border:2px solid var(--st-rim)}
[data-slot=time-picker-dial]{box-shadow:inset 0 0 0 2px var(--st-rim)}
[data-slot=time-picker-segment]{border:2px solid var(--st-rim);border-radius:var(--st-control-r)}`,
};
