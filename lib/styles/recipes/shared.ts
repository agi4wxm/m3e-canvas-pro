/* What the recipe modules share: how a color role is named in CSS, and the groups of named parts that more than one
 * recipe speaks of. Everything here is a selector on `data-slot` or another `data-*` attribute, never on how a
 * component happens to be built.
 *
 * Slot names follow one rule, `<component>-<part>`, with the part one of a small set (title, subtitle, description,
 * value, label, icon, leading, trailing, chevron, badge, divider, header, footer, actions, indicator, track, thumb,
 * fill, cell, media, handle…). So a recipe can speak of one component's part by its full name, or of that part in
 * every component by its ending: `[data-slot$="-chevron"]`.
 *
 * Every list here weighs, inside `:is()`, what one named part weighs: one attribute, as `[data-slot=card]` does. What
 * only narrows a list down (a class it must also carry, what it must not be) goes in `:where()`, which weighs nothing.
 * CSS weighs selectors before it looks at their order, so a list that weighed more would win over every rule written
 * after it: the recipes that build on it and the pack's own word (see the order in sheet.ts). A part and its state or
 * variant (PRESSES, TONED) weigh two, as they would written out. styles.test.ts weighs each of them. */

/** a color role as CSS: the same as `roleVar` in lib/look.ts, which cannot be imported here (lib/look reads lib/tokens,
 *  which reads lib/styles, so it would go round in a circle) */
export const role = (name: string) => `var(--md-sys-color-${name})`;
export const mix = (name: string, percent: number, other = "transparent") => `color-mix(in srgb,${role(name)} ${percent}%,${other})`;

/** every element whose slot ends in this part, in any component */
export const anyPart = (part: string) => `[data-slot$="-${part}"]`;

/** a button with something of its own to draw: not one that is only an icon or only its words */
export const BUTTON = `[data-button]:where(:not([data-size^=icon],[data-variant=text],[data-variant=ghost],[data-variant=link]))`;
export const FAB = `[data-slot=fab],[data-slot=extended-fab]`;
/** a box an author built as a button (the box atom's surface role) */
export const BOX_BUTTON = `[data-surface=button]`;
export const BUTTONS = `${BUTTON},${FAB},[data-slot=skill-button-face],${BOX_BUTTON}`;
export const PRESSES = `${BUTTON}:active,[data-slot=fab]:active,[data-slot=extended-fab]:active`;
export const TONED = `${BUTTON}:is([data-variant=tonal],[data-variant=secondary],[data-variant=tertiary],[data-variant=outlined],[data-variant=outline],[data-variant=elevated])`;
export const CORNERED = `[data-button],[data-slot=toggle],[data-slot=toggle-group-item]`;
export const CHIPS = `[data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip],[data-surface=chip]`;

/** the panels that are named, and any box that fills itself with a container role and has corners. `~=` is exact,
 *  so a row that only fills on hover is not one, and what is drawn behind something else is not either. */
const FILLS = ["surface-container", "surface-container-low", "surface-container-lowest", "surface-container-high", "surface-container-highest", "primary-container", "secondary-container", "tertiary-container"];
export const PANELS = [
  "[data-slot=card]",
  "[data-slot=dialog-content]",
  "[data-slot=alert-dialog-content]",
  "[data-slot=select-content]",
  "[data-slot=dropdown-menu-content]",
  "[data-slot=popover-content]",
  "[data-slot=sheet-content]",
  "[data-slot=drawer-content]",
  "[data-slot=dialogue-box]",
  "[data-surface=card]",
  "[data-surface=panel]",
  "[data-surface=sheet]",
  "[data-surface=overlay]",
  /* in :where, or the class it must also carry and what it must not be would weigh as three attributes, and every
     `:is(${PANELS})` with them: then no recipe after the panels', nor the pack's own word, could win over it */
  `:where(:is(${FILLS.map((f) => `[class~="bg-${f}"]`).join(",")})[class*="rounded"]:not([aria-hidden],[data-button],[data-slot=toggle],[data-slot=chip],[data-slot=filter-chip],[data-slot=input-chip],[data-slot=nav-indicator],[data-slot=tabs-indicator],[data-slot=skill-button-face],[data-slot=stat-bar-track],[data-slot=switch],[data-surface]))`,
].join(",");

/** what a person reads as a card: the card itself, any part named as one (a product card, a post card), and a box
 *  built as one */
export const CARDS = `[data-slot=card],[data-slot$="-card"],[data-surface=card]`;

/** the menus that drop from something, and the lists that stand in for one */
export const MENUS = `[data-slot=dropdown-menu-content],[data-slot=context-menu-content],[data-slot=menubar-content],[data-slot=select-content],[data-slot=combobox-content],[data-slot=dropdown-menu-sub-content],[data-slot=context-menu-sub-content],[data-slot=menubar-sub-content]`;
export const MENU_ITEMS = `[data-slot=dropdown-menu-item],[data-slot=dropdown-menu-checkbox-item],[data-slot=dropdown-menu-radio-item],[data-slot=dropdown-menu-sub-trigger],[data-slot=context-menu-item],[data-slot=context-menu-checkbox-item],[data-slot=context-menu-radio-item],[data-slot=context-menu-sub-trigger],[data-slot=menubar-item],[data-slot=menubar-checkbox-item],[data-slot=menubar-radio-item],[data-slot=menubar-sub-trigger],[data-slot=select-item],[data-slot=combobox-item]`;
export const MENU_SEPARATORS = `[data-slot=dropdown-menu-separator],[data-slot=context-menu-separator],[data-slot=menubar-separator],[data-slot=select-separator],[data-slot=combobox-separator]`;

/** whatever stands across the top of a screen or a window, and whatever stands across its foot */
export const TOP_BARS = `:is([data-slot=app-bar],[data-slot=title-bar],[data-slot=mini-program-header],[data-surface=bar])`;
export const FOOT_BARS = `:is([data-slot=status-bar],[data-slot=checkout-bar],[data-slot=chat-composer],[data-slot=layout-dock])`;

/** the rows of a list, whichever list draws them */
export const ROWS = `[data-slot=item],[data-slot=settings-row],[data-slot=conversation-row],[data-slot=contact-row],[data-slot=notification-row],[data-slot=transaction-row],[data-slot=file-row]`;

/** the charts, gauges and tables of a dashboard: drawn on the screen's own ground, set on a card by a style whose
 *  content stands on cards */
export const DATA_PANELS = `:is([data-slot=dashboard-chart],[data-slot=dashboard-scatter],[data-slot=dashboard-heatmap],[data-slot=dashboard-gauge],[data-slot=dashboard-table])`;

/** words outlined in a dark color, for white words on a bright button */
export const OUTLINED = (c: string) => `text-shadow:-1px -1px 0 ${c},1px -1px 0 ${c},-1px 1px 0 ${c},1px 1px 0 ${c},0 2px 0 ${c}`;
export const SHEEN = `linear-gradient(180deg,rgb(255 255 255/.38) 0%,rgb(255 255 255/.08) 46%,rgb(0 0 0/.06) 54%,rgb(0 0 0/.22) 100%)`;
/** a band of the color that fades out at both ends */
export const FADED = `-webkit-mask-image:linear-gradient(90deg,transparent,#000 8px,#000 calc(100% - 8px),transparent);mask-image:linear-gradient(90deg,transparent,#000 8px,#000 calc(100% - 8px),transparent)`;

/** set as large as a heading but not one: a price, a value or a count, a key of a keypad, a star of a rating, the
 *  words of a button or a big avatar's initials */
export const NOT_HEADINGS = `[data-slot$="-price"],[data-slot$="-value"],[data-slot$="-star"],[data-key],[class~="tabular-nums"],[data-button],[data-slot=fab],[data-slot=extended-fab],[data-slot=toggle],[data-slot=avatar-fallback],[data-slot=input-otp-slot]`;
/** the type roles a heading is set in, on what is one */
export const HEADING_TYPE = `:is([class*="text-display-"],[class*="text-headline-"],[class~="text-title-large"]):where(:not(${NOT_HEADINGS},:is(${NOT_HEADINGS}) *))`;
/** the headings of a screen: the type roles a heading is set in, and the parts named as one */
export const HEADINGS = `:is(${HEADING_TYPE},[data-slot=app-bar-title],[data-slot=app-bar-large-title],[data-slot=dialog-title],[data-slot=alert-dialog-title],[data-slot=sheet-title],[data-slot=drawer-title],[data-slot=card-title],[data-slot=section-header-title],[data-slot=game-result-title],[data-slot=empty-title])`;

/** not filled by its author with an accent: a recipe may tint a surface, never an author's own color. A filter added to
 *  a list, so it weighs nothing */
export const UNPAINTED = `:where(:not([class~="bg-primary"],[class~="bg-primary-container"],[class~="bg-secondary-container"],[class~="bg-tertiary-container"],[class~="bg-inverse-surface"]))`;

/** not a button its author filled with an inverse color, as the Codex box's main action is (a dark pill on a light page,
 *  a light one on a dark page). Its words are set for that fill, through the roles it swaps for itself: a recipe that
 *  takes fills away, or writes white words on every button, leaves it its own. A filter, so it weighs nothing */
export const NOT_INVERSE = `:where(:not([class~="bg-inverse-surface"],[class~="bg-inverse-primary"]))`;

/** a recipe's variants, as CSS: one string per variant, "" for Material's own */
export type RecipeCss<V extends string> = Record<V, string>;
