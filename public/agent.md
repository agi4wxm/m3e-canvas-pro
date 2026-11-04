# M3E Canvas Pro: sketches from an AI agent (beta)

M3E Canvas Pro is a browser editor for Material 3 Expressive screens. A design is one JSON document. You, the agent, write that document and hand it back; the person opens it on their canvas, refines it, and turns it into a prompt for a coding tool.

This format is in beta. Fields may be added; existing ones keep their meaning.

## What to deliver

**Reply with a share link.** If you cannot run code, reply with the JSON document itself in a code block; the person saves it as a `.json` file and opens it with **Open project**. Either way, **do not verify, decode, or round-trip your output**: the app checks the document when it opens and tells the person what is wrong, so your checks add nothing.

To make the link, save the document to a file, then run one of these on it, with `APP` set to the address this guide came from, without `agent.md`.

```js
// Node (link.mjs): node link.mjs design.json
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
const APP = "https://example.com/";
console.log(APP + "#docz=" + deflateRawSync(readFileSync(process.argv[2], "utf8")).toString("base64url"));
```

```python
# Python (link.py): python link.py design.json
import sys, zlib, base64
APP = "https://example.com/"
c = zlib.compressobj(9, zlib.DEFLATED, -15)          # raw deflate, no header
raw = c.compress(open(sys.argv[1], "rb").read()) + c.flush()
print(APP + "#docz=" + base64.urlsafe_b64encode(raw).decode().rstrip("="))
```

The link is long. That is expected; it carries the whole design and nothing is stored anywhere. Keep the document under about 100 KB, and point at pictures by their web address rather than embedding them.

Rough placement is fine. The person presses **Tidy**: bars snap to the edges, and the rest stacks on 16dp margins. Spend your effort on the right parts, sensible words, and the navigation between screens.

## The document

```jsonc
{
  "title": "Recipes",              // the app's name
  "brief": "Save and search recipes.",   // what the app is for, in a sentence or two (optional)
  "frame": "phone",                // always "phone"
  "paletteKey": "purple",          // "purple" | "blue" | "green" | "coral" | "amber" | "teal" | "mono"
  "theme": { "dark": false, "bothModes": true, "contrast": "standard", "shape": "rounded", "font": "roboto", "emphasized": false, "motion": "expressive" },
  "frames": [ /* screens */ ],
  "groups": [ /* parts, bottom layer first */ ]
}
```

`theme` is optional. `contrast`: `standard | medium | high`. `shape`: `square | rounded | full`. `font`: `roboto | robotoFlex | robotoSerif | system`. `motion`: `standard | expressive`. `bothModes: true` asks for light and dark; `dark` picks which one the canvas shows.

### Screens (`frames`)

A phone screen is **412 × 892**; a desktop screen is **1280 × 800** (set `w` and `h`). Place screens side by side on the canvas, 80 apart:

```json
{ "id": "home", "name": "Home", "x": 0, "y": 0, "note": "Lists the saved recipes." }
{ "id": "detail", "name": "Recipe", "x": 492, "y": 0 }
{ "id": "settings", "name": "Settings", "x": 984, "y": 0, "swipe": { "left": "home" } }
```

- `id`: any unique string. `name`: what the screen is called in the prompt.
- `note` (optional): what the screen is for, in a sentence. It goes into the prompt.
- `length` (optional): the screen's vertical content length in dp. Set it above the frame height to make the body scroll.
- `bg` (optional): background, one of `surface | surfaceContainerLow | surfaceContainer | surfaceContainerHigh | surfaceContainerHighest | primaryContainer | secondaryContainer | tertiaryContainer | primary | inverseSurface`.
- `swipe` (optional): screens reached by swiping `left | right | up | down`.
- `place` (optional): where the body rows sit between the bars when the screen is tidied: `top` (default) | `center` | `bottom` | `spread`.

### Parts (`groups`)

Every part sits in a **group**: one part, or several parts laid out along the group's axis (`"axis": "x"` side by side, `"axis": "y"` stacked) that move as a unit. Buttons that belong together are one `button-group`, and list rows are one `item` with several rows, not a group of parts. Coordinates are **canvas coordinates**, so add the screen's `x` and `y`. Later groups draw on top of earlier ones. A part that lies wholly inside a container (`container`, `window`, `dock`, …) belongs to it, and moves with it.

Every part has the same shape: an `id`, `"kind": "component"`, the part's name in `component`, and the values you set in `props`. A prop you leave out takes the part's default. `label` is `""`, `icon` is `null` and `variant` is `"filled"` on every part.

```json
{ "id": "g1", "x": 0, "y": 0, "axis": "x", "items": [ { "id": "bar", "kind": "component", "component": "app-bar", "label": "", "icon": null, "variant": "filled", "props": { "title": "Recipes" } } ] }
{ "id": "g2", "x": 16, "y": 112, "axis": "y", "items": [ { "id": "r1", "kind": "component", "component": "item", "label": "", "icon": null, "variant": "filled", "props": { "items": [ { "label": "Tomato soup", "icon": "restaurant" } ], "description": "30 min" }, "action": { "to": "detail", "transition": "slide" } } ] }
{ "id": "g3", "x": 340, "y": 716, "axis": "x", "items": [ { "id": "fab", "kind": "component", "component": "fab", "label": "", "icon": null, "variant": "filled", "props": { "icon": "add" }, "note": "Opens the new recipe form." } ] }
{ "id": "g4", "x": 0, "y": 788, "axis": "x", "items": [ { "id": "nav", "kind": "component", "component": "navigation-bar", "label": "", "icon": null, "variant": "filled", "props": { "items": [ { "icon": "home", "label": "Home" }, { "icon": "search", "label": "Search" }, { "icon": "settings", "label": "Settings" } ], "selected": 0 }, "actions": { "tab:2": { "to": "settings", "transition": "fade" } } } ] }
```

Fields any part may carry beside `props`:

- `note`: what the part does, in your words. It goes into the prompt verbatim, so say what happens on tap, what is saved, what is validated.
- `action`: `{ "to": "<frame id>" | "back", "transition": "slide" | "slideLeft" | "slideUp" | "slideDown" | "fade" | "expand" | "none" }`, the screen a tap opens.
- `actions`: the same per place inside a part that has several, such as `"tab:2"` for the third row of a bar, list or menu.

Icons are Material Symbols names (`home`, `search`, `add`, `favorite`, `settings`, `arrow_back`, `more_vert`, `edit`, `delete`, `share`, `restaurant`, `photo_camera`, …).

### The parts

These are all the parts there are; a `component` that is not here shows as an unknown part. A `kind` other than `component` makes the whole file unreadable. Numbers are in dp unless they say otherwise.

<!-- parts:begin -->

#### Actions

| component | what it is | props (all optional) |
|---|---|---|
| `button` | Button | `label` text; `icon` icon; `variant` filled / tonal / elevated / outlined / text; `size` xs / sm / md / lg / xl; `shape` round / square; `width` 48–640; `iconWidth` default / narrow / wide; `disabled` true / false; `toggle` true / false; `onIcon` icon; `onLabel` text |
| `fab` | FAB | `icon` icon; `label` text; `size` sm / default / md / lg; `color` primary-container / secondary-container / tertiary-container / primary / secondary / tertiary / surface; `lowered` true / false; `collapsed` true / false; `toggle` true / false; `onIcon` icon; `onLabel` text |
| `chip` | Chip | `items` rows of `{ "label", "icon" }`; `kind` assist / filter / input; `selected` -1–7; `variant` flat / elevated; `size` default / md / lg |
| `toggle` | Toggle | `icon` icon; `label` text; `variant` default / filled / tonal / outline / elevated; `size` xs / sm / default / md / lg; `shape` round / square; `pressed` true / false; `disabled` true / false |
| `toggle-group` | Toggle group | `items` rows of `{ "label", "icon" }`; `selected` 0–5; `connected` true / false; `variant` default / filled / tonal / outline / elevated; `size` xs / sm / default / md; `multiple` true / false |
| `button-group` | Button group | `items` rows of `{ "label", "icon" }`; `variant` connected / standard; `orientation` horizontal / vertical; `buttonVariant` filled / tonal / elevated / outlined / text; `size` xs / sm / md / lg / xl |
| `split-button` | Split button | `label` text; `icon` icon; `variant` filled / tonal / elevated / outlined / text; `size` xs / sm / md / lg / xl; `menu` true / false; `menuItems` rows of `{ "label", "icon" }` |
| `fab-menu` | FAB menu | `items` rows of `{ "label", "icon" }`; `icon` icon; `open` true / false |
| `link` | Link | `label` text; `href` text |
| `function-button` | Function button | `label` text; `icon` icon; `timer` 0–999; `unit` second / minute / hour; `size` 32–120 |
| `brand-button` | Sign-in or pay button | `label` text; `width` 120–800 |
| `icon-button` | Icon button | `icon` icon; `label` text; `variant` filled / tonal / elevated / outlined / text; `size` xs / sm / default / md / lg / xl; `disabled` true / false |

#### Text inputs

| component | what it is | props (all optional) |
|---|---|---|
| `text-field` | Text field | `label` text; `value` text; `supporting` text; `variant` outlined / filled; `leadingIcon` icon; `trailingIcon` icon; `error` true / false; `multiline` true / false; `width` 120–520 |
| `input` | Input | `placeholder` text; `value` text; `type` text / email / password / number / search / tel / url; `variant` outlined / filled; `size` default / sm; `error` true / false; `disabled` true / false; `width` 120–520 |
| `textarea` | Textarea | `placeholder` text; `value` text; `variant` outlined / filled; `rows` 2–10; `error` true / false; `disabled` true / false; `width` 120–520 |
| `input-group` | Input group | `placeholder` text; `leadingIcon` icon; `leadingText` text; `trailingText` text; `button` text; `error` true / false; `disabled` true / false; `width` 160–520 |
| `input-otp` | Input OTP | `length` 2–8; `group` 0–8; `value` text; `error` true / false; `disabled` true / false |
| `field` | Field | `label` text; `control` input / textarea / checkbox / switch; `placeholder` text; `description` text; `error` text; `disabled` true / false; `width` 160–520 |
| `label` | Label | `text` text; `control` checkbox / switch / none; `disabled` true / false |
| `form` | Form | `fields` rows of `{ "label" }`; `submit` text; `width` 200–800 |
| `copy-row` | Copy row | `text` text; `width` 120–800 |
| `tag-input` | Tag input | `items` rows of `{ "label" }`; `placeholder` text; `width` 160–1280 |
| `phone-input` | Phone number | `code` text; `placeholder` text; `width` 160–640 |
| `file-upload` | File upload | `title` text; `hint` text; `action` text; `multiple` true / false; `accept` text; `width` 200–800 |

#### Selection

| component | what it is | props (all optional) |
|---|---|---|
| `switch` | Switch | `label` text; `checked` true / false; `size` default / sm; `disabled` true / false; `width` 52–520 |
| `checkbox` | Checkbox | `label` text; `checked` true / false; `indeterminate` true / false; `error` true / false; `disabled` true / false |
| `radio-group` | Radio group | `items` rows of `{ "label" }`; `selected` 0–5; `layout` column / row; `error` true / false; `disabled` true / false |
| `slider` | Slider | `label` text; `value` 0–100; `range` true / false; `end` 0–100; `disabled` true / false; `width` 120–800 |
| `select` | Select | `items` rows of `{ "label" }`; `selected` -1–7; `variant` outlined / filled; `label` text; `placeholder` text; `supporting` text; `size` default / sm; `disabled` true / false; `width` 120–520 |
| `native-select` | Native select | `items` rows of `{ "label" }`; `selected` 0–7; `size` default / sm; `disabled` true / false; `width` 120–520 |
| `combobox` | Combobox | `items` rows of `{ "label" }`; `selected` -1–9; `placeholder` text; `clear` true / false; `disabled` true / false; `width` 120–520 |
| `calendar` | Calendar | `mode` single / multiple / range; `months` 1–2; `outside` true / false; `weekStart` sunday / monday |
| `date-picker` | Date picker | `variant` docked / modal; `label` text; `placeholder` text; `width` 160–480; `mode` single / range; `title` text; `defaultView` calendar / input; `disabled` true / false |
| `time-picker` | Time picker | `title` text; `hours` 0–23; `minutes` 0–59; `hour24` true / false; `mode` dial / input; `width` 296–560 |
| `rating` | Rating | `value` 0–10; `count` 1–10; `readOnly` true / false |
| `color-field` | Color field | `label` text; `value` text |
| `quantity-stepper` | Quantity stepper | `value` 0–999; `min` 0–999; `max` 0–999; `width` 120–400 |
| `wheel-picker` | Wheel picker | `label` text; `items` rows of `{ "label" }`; `selected` 0–19; `width` 120–640 |
| `item-picker` | Item picker | `items` rows of `{ "label", "icon" }`; `columns` 1–8; `selected` 0–23; `width` 120–800 |
| `multi-select` | Multiple choice | `items` rows of `{ "label" }`; `selected` text; `width` 120–800 |
| `color-palette` | Color palette | `colors` text; `selected` 0–63; `width` 120–800 |
| `number-picker` | Number picker | `value` -100000–100000; `min` -100000–100000; `max` -100000–100000; `step` 1–1000; `unit` text; `width` 56–240 |

#### Navigation

| component | what it is | props (all optional) |
|---|---|---|
| `navigation-bar` | Navigation bar | `items` rows of `{ "label", "icon" }`; `selected` 0–4; `tall` true / false; `layout` vertical / horizontal; `elevated` true / false; `badge` 0–99; `badgeOn` 1–5; `width` 240–1280 |
| `app-bar` | App bar | `title` text; `subtitle` text; `size` small / medium / large; `leading` icon; `trailing` icon; `trailing2` icon; `centered` true / false; `scrolled` true / false; `width` 240–1280 |
| `tabs` | Tabs | `items` rows of `{ "label", "icon" }`; `selected` 0–7; `variant` primary / secondary / segmented; `width` 160–1280 |
| `navigation-rail` | Navigation rail | `items` rows of `{ "label", "icon" }`; `selected` 0–6; `expanded` true / false; `narrow` true / false; `modal` true / false; `compact` true / false; `menu` true / false; `fab` true / false; `height` 240–10000 |
| `toolbar` | Toolbar | `kind` floating / docked; `color` standard / vibrant; `orientation` horizontal / vertical; `items` rows of `{ "label", "icon" }`; `toggles` true / false; `width` 240–1280 |
| `breadcrumb` | Breadcrumb | `items` rows of `{ "label" }`; `separator` chevron / slash; `collapse` true / false |
| `pagination` | Pagination | `pages` 1–99; `current` 1–99; `previous` text; `next` text; `width` 240–1280 |
| `navigation-menu` | Navigation menu | `menus` rows of `{ "label" }`; `pages` rows of `{ "label" }`; `links` rows of `{ "label" }` |
| `sidebar` | Sidebar | `label` text; `items` rows of `{ "label", "icon" }`; `selected` 0–7; `size` default / sm / lg; `width` 200–400; `height` 200–800 |
| `search` | Search | `kind` view / bar; `style` elevated / outlined; `placeholder` text; `leading` icon; `trailing` icon; `size` default / sm; `results` rows of `{ "label", "icon" }`; `width` 200–640 |
| `command` | Command | `placeholder` text; `heading` text; `items` rows of `{ "label", "icon" }`; `width` 240–640 |
| `dropdown-menu` | Dropdown menu | `label` text; `variant` filled / tonal / elevated / outlined / text; `items` rows of `{ "label", "icon" }`; `destructive` text |
| `context-menu` | Context menu | `label` text; `items` rows of `{ "label", "icon" }`; `width` 120–640; `height` 64–480 |
| `menubar` | Menubar | `menus` rows of `{ "label" }`; `items` rows of `{ "label", "icon" }` |
| `title-bar` | Title bar | `title` text; `controls` mac / windows / none; `width` 240–1920 |
| `status-bar` | Status bar | `text` text; `icon` icon; `trailing` text; `width` 240–1920 |
| `steps` | Steps | `items` rows of `{ "label" }`; `current` 0–7; `width` 160–1200 |
| `side-tabs` | Side tabs | `items` rows of `{ "label" }`; `selected` 0–11; `width` 80–320 |
| `page-dots` | Page dots | `count` 1–12; `current` 0–11 |
| `floating-nav` | Floating navigation | `items` rows of `{ "label", "icon" }`; `selected` 0–4; `width` 200–800 |
| `cascading-menu` | Cascading menu | `label` text; `items` rows of `{ "label", "icon" }`; `subLabel` text; `subItems` rows of `{ "label" }` |
| `mini-program-header` | Mini program header | `title` text; `back` true / false; `width` 240–1280 |
| `toc` | Table of contents | `title` text; `items` rows of `{ "label" }`; `selected` 0–39; `width` 120–480 |
| `slide-group` | Slide group | `items` rows of `{ "label" }`; `width` 160–1280 |

#### Overlays

| component | what it is | props (all optional) |
|---|---|---|
| `tooltip` | Tooltip | `label` text; `variant` filled / tonal / elevated / outlined / text; `text` text; `side` top / right / bottom / left |
| `dialog` | Dialog | `style` basic / fullscreen; `icon` icon; `title` text; `description` text; `dismiss` text; `confirm` text; `stacked` true / false; `closeButton` true / false; `dialogWidth` 280–560; `width` 280–1280; `height` 320–900 |
| `alert-dialog` | Alert dialog | `icon` icon; `title` text; `description` text; `cancel` text; `action` text; `size` default / sm |
| `sheet` | Sheet | `side` right / left / bottom / top; `title` text; `description` text; `footer` true / false |
| `side-sheet` | Side sheet | `title` text; `content` text; `side` right / left; `detached` true / false; `closeButton` true / false; `footer` true / false; `width` 256–400; `height` 200–560 |
| `drawer` | Drawer | `title` text; `description` text; `close` text; `swipeHandle` true / false; `inline` true / false |
| `popover` | Popover | `trigger` text; `variant` filled / tonal / elevated / outlined / text; `title` text; `description` text; `side` bottom / top / right / left |
| `hover-card` | Hover card | `trigger` text; `avatar` text; `title` text; `description` text; `side` bottom / top / right / left |
| `action-sheet` | Action sheet | `title` text; `message` text; `actions` rows of `{ "label" }`; `cancel` text; `width` 200–640 |

#### Feedback

| component | what it is | props (all optional) |
|---|---|---|
| `badge` | Badge | `kind` label / dot / count; `label` text; `variant` default / secondary / tertiary / destructive / outline / ghost / link; `icon` icon; `count` 1–2000 |
| `progress` | Progress | `value` 0–100; `indeterminate` true / false; `variant` flat / wavy; `thickness` 2–16; `label` text; `showValue` true / false; `width` 80–560 |
| `circular-progress` | Circular progress | `value` 0–100; `indeterminate` true / false; `variant` flat / wavy; `size` 24–120; `thickness` 2–16 |
| `loading-indicator` | Loading indicator | `variant` default / contained; `size` 24–128; `speed` 0–3 |
| `spinner` | Spinner | `size` xs / sm / md / lg; `color` primary / secondary / tertiary / error / on-surface |
| `skeleton` | Skeleton | `layout` profile / text / card / block; `lines` 1–8; `width` 80–560; `height` 8–320 |
| `sonner` | Snackbar | `label` text; `variant` filled / tonal / elevated / outlined / text; `message` text; `action` text; `closeButton` true / false |
| `alert` | Alert | `variant` default / info / tertiary / destructive; `icon` icon; `title` text; `description` text; `width` 200–640 |
| `empty` | Empty | `title` text; `description` text; `icon` icon; `action` text; `bordered` true / false; `width` 200–640 |
| `shimmer-text` | Shimmer text | `text` text |
| `pull-to-refresh` | Pull to refresh | `hint` text; `width` 160–800; `height` 80–1200 |
| `typing-indicator` | Typing indicator | `label` text |
| `number-ticker` | Number ticker | `value` -1000000000–1000000000; `prefix` text; `suffix` text; `size` title / headline / display |
| `timer` | Timer | `seconds` 1–86400; `countdown` true / false; `width` 160–480 |

#### Layout

| component | what it is | props (all optional) |
|---|---|---|
| `card` | Card | `title` text; `description` text; `variant` filled / elevated / outlined; `imagePos` none / top / bottom / leading / trailing / background; `image` https address; `imageIcon` icon; `imageSize` 40–320; `textAlign` start / center / end; `contentAlign` start / center / end; `size` sm / default / lg; `interactive` true / false; `action` text; `width` 160–520; `height` 0–480 |
| `accordion` | Accordion | `items` rows of `{ "label" }`; `content` text; `openFirst` true / false; `multiple` true / false; `width` 200–640 |
| `collapsible` | Collapsible | `trigger` text; `variant` filled / tonal / elevated / outlined / text; `content` text; `open` true / false; `width` 160–520 |
| `separator` | Separator | `orientation` horizontal / vertical; `length` 8–1600; `thickness` 1–64; `color` default / primary / primary-container / secondary-container / tertiary-container / surface-container / surface-container-high / outline |
| `scroll-area` | Scroll area | `scrollbars` vertical / horizontal / both; `label` text; `count` 1–100; `width` 120–560; `height` 80–480 |
| `resizable` | Resizable | `orientation` horizontal / vertical; `first` text; `second` text; `split` 10–90; `handle` true / false; `width` 160–2400; `height` 80–2400 |
| `aspect-ratio` | Aspect ratio | `ratio` 16:9 / 4:3 / 1:1 / 3:4 / 21:9; `label` text; `width` 120–640 |
| `container` | Container | `label` text; `note` text; `place` center / start; `fill` none / surface / surface-container-low / surface-container / surface-container-high / surface-container-highest / primary-container / secondary-container / tertiary-container; `border` none / solid / dashed; `radius` 0–48; `blur` 0–40; `width` 40–2400; `height` 40–2400 |
| `stack` | Stack | `label` text; `note` text; `width` 40–2400; `height` 40–2400 |
| `grid-view` | Grid | `label` text; `note` text; `columns` 1–12; `rows` 1–12; `width` 40–2400; `height` 40–2400 |
| `dock` | Dock | `items` rows of `{ "label" }`; `selected` 0–11; `width` 40–2400; `height` 40–2400 |
| `supporting-pane` | Supporting pane | `label` text; `note` text; `icon` icon; `width` 40–2400; `height` 40–2400 |
| `custom` | Custom component | `name` text; `description` text; `width` 40–2400; `height` 40–2400 |
| `window` | Window | `title` text; `controls` mac / windows / none; `width` 200–2400; `height` 120–2400 |

#### Data

| component | what it is | props (all optional) |
|---|---|---|
| `item` | List item | `items` rows of `{ "label", "icon" }`; `description` text; `variant` default / outline / muted / segmented; `size` default / sm / xs; `trailing` none / icon / switch / checkbox / radio / slider / text; `trailingIcon` icon; `checked` true / false; `trailingText` text; `width` 160–520 |
| `chart` | Chart | `type` bar / line / area / stacked-bar / pie; `title` text; `subtitle` text; `data` `{ "columns": ["Month", "Desktop", "Mobile"], "rows": [[…]] }`; `width` 200–1200; `height` 120–600 |
| `scatter-plot` | Scatter plot | `title` text; `subtitle` text; `data` `{ "columns": ["X", "Y"], "rows": [[…]] }`; `width` 160–960; `height` 96–600 |
| `heatmap` | Heatmap | `title` text; `subtitle` text; `data` `{ "columns": ["Mon", "Tue", "Wed", "Thu", "Fri"], "rows": [[…]] }`; `width` 160–960 |
| `gauge` | Gauge | `label` text; `value` 0–100 |
| `filter-bar` | Filter bar | `placeholder` text; `filters` rows of `{ "label" }`; `width` 200–1200 |
| `description-list` | Description list | `data` `{ "columns": ["Name", "Value"], "rows": [[…]] }`; `width` 160–960 |
| `stat-card` | Stat card | `title` text; `value` text; `trend` text; `direction` up / down / flat; `width` 120–480 |
| `table` | Table | `title` text; `data` `{ "columns": ["Invoice", "Status", "Amount"], "rows": [[…]] }`; `caption` text; `selected` 0–100; `alignLast` true / false; `width` 200–960 |
| `tree` | Tree | `items` rows of `{ "label", "icon" }`; `selected` 0–19; `width` 120–640 |
| `subscription` | Subscription plans | `title` text; `description` text; `plans` rows of `{ "label" }`; `action` text; `width` 200–640 |
| `timeline` | Timeline | `data` `{ "columns": ["Time", "Title", "Detail"], "rows": [[…]] }`; `current` 0–100; `width` 160–960 |
| `tracker` | Status tracker | `title` text; `states` text; `width` 120–1280 |
| `code-block` | Code block | `code` text; `language` text; `width` 200–1280 |
| `markdown` | Markdown | `text` text; `width` 160–1280 |
| `file-diff` | File diff | `file` text; `diff` text; `width` 200–1280 |
| `sortable-list` | Sortable list | `items` rows of `{ "label" }`; `width` 160–800 |
| `swipe-row` | Swipe row | `title` text; `note` text; `action` text; `width` 160–800 |

#### Media

| component | what it is | props (all optional) |
|---|---|---|
| `icon` | Icon | `name` icon; `size` 16–96; `filled` true / false; `color` default / primary / secondary / tertiary / error |
| `avatar` | Avatar | `initials` text; `size` sm / default / lg; `image` https address; `count` 1–5 |
| `carousel` | Carousel (Embla) | `count` 2–8; `arrows` true / false; `orientation` horizontal / vertical; `itemWidth` 0–480; `gap` 0–32; `image` https address; `width` 160–640; `height` 80–400 |
| `expressive-carousel` | Expressive carousel | `variant` multi-browse / hero / uncontained / full-screen; `slides` rows of `{ "label" }`; `itemWidth` 120–400; `gap` 0–24; `height` 100–320; `width` 240–800 |
| `kbd` | Kbd | `keys` rows of `{ "label" }`; `caption` text |
| `shape` | Shape | `name` 4-leaf-clover / 4-sided-cookie / 6-sided-cookie / 7-sided-cookie / 8-leaf-clover / 9-sided-cookie / 12-sided-cookie / burst / oval / pentagon / pill / soft-burst / sunny / very-sunny / bun / boom / arch / arrow / diamond / fan / flower / gem / ghost-ish / heart / hexagon / pixel-circle / pixel-triangle / puffy / puffy-diamond / semicircle / slanted / soft-boom / square / circle / triangle; `color` primary / secondary / tertiary / primary-container / secondary-container / tertiary-container / surface-container / surface-container-high / outline / error; `width` 8–800; `height` 8–800 |
| `video` | Video | `src` text; `title` text; `time` text; `width` 160–1280 |
| `web-view` | Web page | `address` text; `load` true / false; `width` 160–1280; `height` 96–900 |
| `animation` | Animation placeholder | `file` text; `size` 48–640 |
| `camera` | Camera placeholder | `width` 120–1280; `height` 120–1280 |
| `map` | Map placeholder | `label` text; `width` 120–1280; `height` 96–1280 |
| `photo-grid` | Photo grid | `count` 1–30; `columns` 1–6; `width` 120–800 |
| `text` | Text | `text` text; `style` display / headline / title / subtitle / body / label / caption; `color` default / muted / primary / secondary / tertiary / error; `align` start / center / end; `bold` true / false; `width` 40–1600 |
| `image` | Image | `src` https address; `alt` text; `fit` cover / contain; `radius` 0–120; `width` 24–1600; `height` 24–1600 |
| `audio-player` | Audio player | `title` text; `artist` text; `src` text; `seconds` 1–36000; `width` 200–800 |
| `marquee` | Marquee | `text` text; `seconds` 2–120; `width` 80–1600 |

#### Chat

| component | what it is | props (all optional) |
|---|---|---|
| `message` | Message | `text` text; `align` start / end; `variant` default / secondary / muted / tinted / outline / ghost / destructive; `avatar` text; `header` text; `footer` text; `width` 200–640 |
| `bubble` | Bubble | `text` text; `variant` default / secondary / muted / tinted / outline / ghost / destructive; `align` start / end; `reaction` text; `width` 160–640 |
| `marker` | Marker | `text` text; `variant` default / separator / border; `icon` icon; `width` 120–640 |
| `attachment` | Attachment | `title` text; `description` text; `icon` icon; `state` done / idle / uploading / processing / error; `size` default / sm / xs; `orientation` horizontal / vertical; `remove` true / false |
| `message-scroller` | Message scroller | `messages` rows of `{ "label" }`; `button` true / false; `width` 240–640; `height` 160–480 |
| `questionnaire` | Questionnaire | `question` text; `description` text; `choices` rows of `{ "label" }`; `multiple` true / false; `steps` 1–3; `width` 240–640 |

#### Game

| component | what it is | props (all optional) |
|---|---|---|
| `prize-wheel` | Prize wheel | `label` text; `prizes` rows of `{ "label", "icon" }`; `result` -1–11; `size` 120–480 |
| `grid-draw` | Grid draw | `label` text; `prizes` rows of `{ "label", "icon" }`; `result` -1–11; `size` 120–480 |
| `gacha` | Gacha | `label` text; `prizes` rows of `{ "label", "icon" }`; `result` -1–11; `size` 120–480 |
| `slot-machine` | Slot machine | `label` text; `prizes` rows of `{ "label", "icon" }`; `result` -1–11; `size` 120–480 |
| `money-tree` | Money tree | `label` text; `prizes` rows of `{ "label", "icon" }`; `result` -1–11; `size` 120–480 |
| `egg-smash` | Egg smash | `label` text; `prizes` rows of `{ "label", "icon" }`; `result` -1–11; `size` 120–480 |
| `asset-pill` | Asset pill | `value` text; `icon` icon |
| `inventory` | Inventory | `columns` 1–12; `rows` 1–12; `filled` 0–144; `width` 160–800 |
| `item-cell` | Item cell | `icon` icon; `name` text; `count` text; `rarity` text; `rarityColor` text; `badge` text; `size` 32–160 |
| `task-row` | Task row | `title` text; `action` text; `done` text; `width` 200–800 |
| `reward-track` | Reward track | `data` `{ "columns": ["At", "Label", "Icon"], "rows": [[…]] }`; `value` 0–100000; `max` 1–100000; `action` text; `width` 200–800 |
| `check-in` | Daily check-in | `title` text; `days` 7–31; `signed` 0–31; `width` 200–640 |
| `joystick` | Joystick | `size` 64–320; `angle` 0–360; `autoCenter` true / false |

<!-- parts:end -->

## Keep it simple

- Leave what the app does not need out. An app bar with just a title is normal; not every bar needs a menu and a search icon, not every list row needs a trailing chevron.
- Do not add parts to fill space. A screen with a bar, a list and a FAB is complete.
- One idea per screen. If a screen needs a second scroll of parts, it is two screens.
- Prefer the default look and sizes; the person retunes the theme afterwards.
- A main action on its own gets a width of 380 (the full content width); two side by side get 182 each. Do not scatter small buttons around a screen.
- A list of similar rows is one `item` with several `items`, not a column of cards.
- Grids: put cards or images of one width in rows whose columns share their left edges, each part in its own group (on a phone, two columns of width 182, 16 apart).

## A good sketch

- One `app-bar` at the top of each screen, a `navigation-bar` on the main screens with the same `items` everywhere, and `selected` set to the entry that screen belongs to.
- Real words in the person's language, not lorem ipsum. Match the language of the request.
- A `note` only where the words do not already say what happens; a `note` on every screen.
- Navigation that closes: list rows open a detail screen, detail screens have a way back (`"to": "back"`), the FAB opens a form.
- Three to five screens is plenty. Leave polish to the person: they will tidy, retheme, and edit.

## Checklist before you reply

- Every `id` is unique; every `action.to` names a frame `id` or `back`.
- Every part has `id`, `"kind": "component"`, `component`, `label`, `icon`, `variant`.
- Group coordinates include the screen offset.
- You are replying with the link (or the JSON), not with a description of it.
