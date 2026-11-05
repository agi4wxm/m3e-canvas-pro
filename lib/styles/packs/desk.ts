import { mix, role } from "../recipes/shared";

/* What the desktop packs (Windows, VS Code, Discord, Steam, Notion, Ant Design) say alike, written once: the parts M3
 * draws as a phone's capsules, which no desktop program draws so. Each pack passes its own measures and adds what is
 * its own. Not a pack itself: the list in index.ts is the packs. */

/** A part M3 fills with a container color and rounds is taken for a panel, and the surface recipe's rule for panels
 *  weighs three attributes. A part that only looks like one here (a menubar, a chosen row) is named three times, so
 *  what a pack says of it outweighs that rule. */
export const firm = (slot: string) => `[data-slot=${slot}]`.repeat(3);

/** a menubar is a row of words, not a capsule: the open menu's word on a soft fill */
export const menubar = (h: number, r: string) => `${firm("menubar")}{height:auto;padding:0;gap:0;border:0;border-radius:0;background-color:transparent;box-shadow:none}
[data-slot=menubar-trigger]{height:${h}px;padding-inline:8px;border-radius:${r};font-size:var(--text-body-medium);font-weight:400;color:${role("on-surface")}}
[data-slot=menubar-trigger][data-popup-open]{background-color:${mix("on-surface", 9)};color:${role("on-surface")}}
[data-slot=navigation-menu-trigger]{height:${h + 4}px;padding-inline:10px;border-radius:${r};font-size:var(--text-body-medium)}
[data-slot=navigation-menu-trigger][data-popup-open]{background-color:${mix("on-surface", 8)};color:${role("on-surface")}}
[data-slot=navigation-menu-link]{padding:6px 10px;border-radius:${r};font-size:var(--text-body-medium)}`;

/** a toolbar is docked in its window, a short row of small buttons, not a floating capsule */
export const toolbar = (r: string) => `[data-slot=floating-toolbar]{height:40px;padding:4px;gap:2px;border-radius:${r};box-shadow:0 1px 2px rgb(0 0 0/.08);border:1px solid ${role("outline-variant")}}
[data-slot=floating-toolbar] [data-button]{width:32px;height:32px}
[data-slot=floating-toolbar] [data-slot=icon]{width:18px;height:18px}`;

/** a sidebar's rows: short, square-cornered, the words at body size */
export const sidebar = (h: number, r: string, icon = 18) => `[data-slot=sidebar-menu-button]{height:${h}px;padding-inline:8px;gap:10px;border-radius:${r};font-size:var(--text-body-medium);line-height:var(--text-body-medium--line-height);font-weight:400;color:${role("on-surface")}}
[data-slot=sidebar-menu-button] [data-slot=icon]{width:${icon}px;height:${icon}px;font-size:${icon}px}
[data-slot=sidebar-group-label]{height:28px;padding-inline:8px;border-radius:0;font-size:var(--text-label-medium);font-weight:600;color:${role("on-surface-variant")}}
[data-slot=sidebar-menu]{gap:2px}`;

/** the choice in a select or a list of options: a quiet fill and a check, never a colored band; the select itself as
 *  short as the other controls */
export const picked = `[data-slot=select-item][data-selected]{background-color:${mix("on-surface", 8)};color:${role("on-surface")}}
[data-slot=select-item][data-highlighted]{background-color:${mix("on-surface", 6)}}
:is(${firm("select-item")}[data-selected],${firm("side-tabs-item")}[data-active]){border:0;box-shadow:none}
[data-slot=select-trigger]{height:32px;min-height:32px;padding-inline:10px;font-size:var(--text-body-medium)}`;

/** single-line fields as short as the product's other controls, search results as short as its rows, and the waiting
 *  mark a ring that turns, not Material's morphing shape */
export const short = (h: number) => `:is([data-slot=input],[data-slot=native-select]){height:${h}px;min-height:0;padding-block:0}
[data-slot=input-group]{height:${h}px;min-height:0}
[data-slot=input-group-control]{height:100%}
[data-slot=search-result]{min-height:${h + 4}px;height:auto;padding-block:4px}
${firm("loading-indicator")}{color:transparent;background-color:transparent;border:4px solid ${mix("primary", 18)};border-top-color:${role("primary")};scale:.66;animation:spin 1s linear infinite}`;

/** a command palette: a flyout with a short field on top and short rows under it */
export const palette = (row: number, r: string) => `[data-slot=command]{background-color:${role("surface-container-low")};border-radius:${r};padding:0}
[data-slot=command-input-wrapper]{padding:6px;background-color:transparent;border:0;border-radius:0;box-shadow:none}
[data-slot=command] [data-slot=input-group]{height:32px;min-height:0}
[data-slot=command] [data-slot=input-group-addon]{padding-block:0}
[data-slot=command] [data-slot=input-group-addon] [data-slot=icon]{width:16px;height:16px}
[data-slot=command-input]{font-size:var(--text-body-medium)}
[data-slot=command-group]{padding:2px 4px 4px}
[data-slot=command-item]{min-height:${row}px;padding-block:0;gap:8px;font-size:var(--text-body-medium);border-radius:${r === "0" ? "0" : "4px"}}
[data-slot=command-item] [data-slot=icon]{width:16px;height:16px}`;

/** a Windows app's bar: its glyph and title at the left, the caption buttons at the right, wide and thin, whatever
 *  platform's controls the author left on it */
export const windowsCaption = `[data-slot=title-bar]{height:32px;padding:0 0 0 12px;gap:10px}
[data-slot=title-bar][data-controls=mac] [data-slot=title-bar-controls]{display:none}
[data-slot=title-bar][data-controls=mac] [data-slot=title-bar-caption]{display:flex}
[data-slot=title-bar-icon]{display:inline-flex;align-items:center}
[data-slot=title-bar-title]{text-align:left;font-size:12px;line-height:16px;font-weight:400}
[data-slot=title-bar]:is([data-controls=mac],[data-controls=windows]) :is([data-slot=title-bar-caption],[data-slot=title-bar-controls]){gap:0;align-self:stretch;align-items:center}
[data-slot=title-bar] :is([data-slot=title-bar-caption],[data-slot=title-bar-controls]) [data-slot=icon]{width:14px;height:14px;margin-inline:16px}`;

/** a tree's rows: short, a twisty before the folders, the open one pointing down */
export const tree = (h: number, r: string) => `[data-slot=tree]{gap:0}
${firm("tree-row")}{min-height:${h}px;padding-block:0;border-radius:${r};gap:6px;border:0;box-shadow:none}
[data-slot=tree-twisty]{display:inline-flex;flex:none;width:16px;height:16px;align-items:center;justify-content:center;color:${role("on-surface-variant")}}`;
