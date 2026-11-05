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

`theme` is optional. `contrast`: `standard | medium | high`. `shape`: `none | square | soft | rounded | full`. `font`: `roboto | robotoFlex | robotoSerif | system | apple | segoe | inter | dmsans | mrounded | fredoka | lilita | barlow | rajdhani | pixel | garamond | cinzel`. `motion`: `standard | expressive`. `bothModes: true` asks for light and dark; `dark` picks which one the canvas shows.

### Style (`theme.style`)

One word dresses the whole document: every part, the screens behind them and the pictures. Name the style that suits the idea and write nothing else in `theme`; the colors, type, corners and icons come with it, and `paletteKey` is ignored while it colors the document. A style is a set of rules the document is held to: what a theme says against them is replaced, and `corners`, a button's `shape`, an image's `radius`, a scene's `style` and every `look` field but `opacity`, `rotate`, `transform`, `blur`, `blend` and `elevation` are removed from every part when the document arrives. Choose among the things the rules leave open: which parts, their words, and `fill` and `textColor`, which name the style's own colors.

```jsonc
"theme": { "style": "cyber" }
```

Each one is modeled on real products. Pick the one nearest to what the person described; if they name a product, take its style. A style is more than its colors: it also shapes the components and lays the screens out. When the document arrives its screens are laid out by the style's rules (margins, gaps, where the navigation stands), so place parts as the rest of this guide says, in the order you want them, and compose each screen as the table says.

<!-- styles:begin -->

| `style` | Looks like | How its screens are composed |
| --- | --- | --- |
| (left out) | Android, Google's apps | Plain Material 3: a top bar, a body on 16dp margins, a bottom navigation bar. |
| `ios` | iOS 26, Apple apps | Inset grouped lists on a grey ground with generous gaps between groups; a centered title; a floating capsule tab bar; the main action a full-width capsule near the content. |
| `shortvideo` | TikTok, Douyin | The video fills the whole screen, so draw it as a full-screen scene rather than a video box; text tabs at the top; a column of actions down the right; a caption and a black tab bar over the foot. |
| `spotify` | Spotify | A row of capsule filters, then titled shelves of square covers; lists without lines; a mini player resting above the tab bar. |
| `wechat` | WeChat | White lists run edge to edge, grouped by narrow grey bands, with lines starting at the words; rounded-square avatars; a centered title; four bottom tabs. |
| `shop` | Taobao, Temu, Shein | A search box pinned at the top, promo banners, then two columns of product cards with large red prices; five bottom tabs; a fixed buy button at the foot of a product page. |
| `social` | Instagram, Threads | Content edge to edge with full-width pictures, hardly any cards or lines; color only on the main action; a bottom bar of icons with no words. |
| `whatsapp` | WhatsApp | A title and search on top, then chat rows of avatar, name, last line and time; a floating new-chat button at the lower right; four bottom tabs. |
| `chatgpt` | ChatGPT | Almost no chrome: the conversation in the middle, a large rounded composer with a round send button at the foot, navigation folded into a side drawer. |
| `claude` | Claude | A roomy warm-ivory page: a centered serif greeting, a large white rounded composer below it (hairline, soft shadow, a terracotta send button), a few capsule suggestions; navigation folded into a sidebar, the conversation set wide and easy to read. |
| `codex` | Codex | A large prompt box on top to describe a task, with repository and branch pickers beside it; below, a compact task list, each row a title, the repository and monospace diff counts (green added, red removed), parted by hairlines; a task opens to a log at the left and the diff at the right. |
| `fluent` | Windows 11, Microsoft 365, Teams, Edge | A navigation pane on the left when wide, a command bar on top, compact lists and forms below; short controls, small margins, dense. |
| `vscode` | VS Code, Cursor | A narrow column of icons at the far left, a tree sidebar beside it, square tabs over the content, a thin status bar along the foot. |
| `discord` | Discord | A column of round server icons at the far left, a channel list beside it, the stream of messages beside that, a composer at the foot. |
| `steam` | Steam | A dark navigation along the top, a large cover below it and rows of game cards; lists of a thumbnail, a name and a green price tag. |
| `notion` | Notion | Like a page of paper: a large title at the upper left, roomy text, elements without boxes, layered by indent and white space, almost no color. |
| `antd` | Alipay, DingTalk, Feishu, Ant Design | A menu on the left and breadcrumbs on top when wide, white cards on grey holding tables and forms; on a phone, white cards on grey with four bottom tabs. |
| `casual` | Royal Match, Candy Crush, Monopoly GO, Clash Royale, Coin Master | A row of cream capsules for coins, lives and stars on top; a full-screen scene in the middle; two big glossy buttons just above the bottom bar, whose chosen tab rises and brightens. |
| `blocks` | Block Blast | Almost no menus: a crown and best score at the upper left, settings at the upper right, a big score in the middle, the navy board and the pieces below it. |
| `survival` | Whiteout Survival, Last War, Kingshot | An avatar and power at the upper left, a row of resource figures at the right; round feature icons along the edges; a navy row of entries at the foot; action cards rising from below. |
| `anime` | Genshin Impact, Honkai: Star Rail | A column of categories at the left with the chosen one a cream capsule; a grid of items in the middle; a detail card at the right with capsule buttons at its foot; a round close at the upper right. |
| `moba` | Honor of Kings, League of Legends: Wild Rift | A hero portrait on one side, a navy list on the other; bottom tabs whose chosen one glows gold from below; thin gold lines and diamonds throughout. |
| `souls` | Elden Ring, Baldur's Gate 3 | Nearly black: a column of words at the left whose chosen row is lit by a dark-gold band fading to the right; small dense columns of figures; a line of key hints along the foot. |
| `wukong` | Black Myth: Wukong | Pure black with a large faint calligraphic character at the upper left; a line of text tabs on top with the chosen one a pale band; a text list at the left, emptiness or a picture at the right; key hints at the lower right. |
| `cyber` | Cyberpunk 2077 | A title with a cyan underline on top, a column of dark crimson panels with cut corners at the right, each row a capital label and a value; a row of cyan key hints along the foot; small technical text scattered at the edges. |
| `rivals` | Marvel Rivals | A slim navigation on top with the chosen item bright yellow; a hero and slanted color blocks on one side, white panels on the other; bold italic capital titles; a slanted yellow streak on victory. |
| `fps` | Apex Legends, VALORANT, PUBG, Counter-Strike 2 | A line of capital navigation on top with the chosen item a red parallelogram; the character standing in the middle; a column of match buttons and a big ready button at the lower left; currency at the upper right. |
| `stardew` | Stardew Valley, Terraria | The scene fills the screen; a dialog sits low on it with words at the left and a portrait with a scroll nameplate at the right; a row of square item slots along the foot serves as navigation. |

<!-- styles:end -->

Use the same style for the whole app. The screens are laid out by the style's rules when the document arrives: margins, gaps, where the navigation stands, and every row in reading order, so nothing has to be measured. On a screen with a `scene` behind it the parts are a composition rather than rows: each stays in the corner or along the edge you put it by, so place a HUD where it should stand. `recipes` and `ux` only count in a document that has been let off the rules with `"strict": false`, and only when asked: `{ "style": "ios", "strict": false, "recipes": { "tabs": "boxed" }, "ux": { "margin": 24, "nav": "top" } }`. The kinds of `recipes` are `button`, `surface`, `tabs`, `toggle`, `slider`, `nav`, `field`, `bar`, `meter`, `list`, `dialog`, `avatar`, `chip`, `check`, `dialogue` and `feedback`. `ux` holds `margin`, `gap`, `tight`, `nav` (`keep | bottom | rail | top`) and `place` (`top | center | bottom | spread`).

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
- `w`, `h` (optional): the screen's size. Left out it is a phone, 412 by 892; a tablet is 834 by 1194 and a desktop 1280 by 800.
- `deviceBars` (optional): `true` draws the device's status bar and keeps parts clear of it.
- `variantOf` (optional): the id of the screen this one is another size of. Keep the same `name`, put it beside the original with the size in `w` and `h`, and lay its parts out for that size. Each size has parts of its own; the preview's width switch moves between them and navigation lands on the matching size.

### Parts (`groups`)

Every part sits in a **group**: one part, or several parts laid out along the group's axis (`"axis": "x"` side by side, `"axis": "y"` stacked) that move as a unit. Buttons that belong together are one `button-group`, and list rows are one `item` with several rows, not a group of parts. Coordinates are **canvas coordinates**, so add the screen's `x` and `y`. Later groups draw on top of earlier ones. A part that lies wholly inside a container (`container`, `window`, `dock`, …) belongs to it, and moves with it.

Every part has the same shape: an `id`, `"kind": "component"`, the part's name in `component`, and the values you set in `props`. A prop you leave out takes the part's default. `label` is `""`, `icon` is `null` and `variant` is `"filled"` on every part.

```json
{ "id": "g1", "x": 0, "y": 0, "axis": "x", "items": [ { "id": "bar", "kind": "component", "component": "app-bar", "label": "", "icon": null, "variant": "filled", "props": { "title": "Recipes" } } ] }
{ "id": "g2", "x": 16, "y": 112, "axis": "y", "items": [ { "id": "r1", "kind": "component", "component": "item", "label": "", "icon": null, "variant": "filled", "props": { "items": [ { "label": "Tomato soup", "icon": "restaurant" } ], "description": "30 min" }, "action": { "to": "detail", "transition": "slide" } } ] }
{ "id": "g3", "x": 340, "y": 716, "axis": "x", "items": [ { "id": "fab", "kind": "component", "component": "fab", "label": "", "icon": null, "variant": "filled", "props": { "icon": "add" }, "note": "Opens the new recipe form." } ] }
{ "id": "g4", "x": 0, "y": 828, "axis": "x", "items": [ { "id": "nav", "kind": "component", "component": "navigation-bar", "label": "", "icon": null, "variant": "filled", "props": { "items": [ { "icon": "home", "label": "Home" }, { "icon": "search", "label": "Search" }, { "icon": "settings", "label": "Settings" } ], "selected": 0 }, "actions": { "tab:2": { "to": "settings", "transition": "fade" } } } ] }
```

Fields any part may carry beside `props`:

- `note`: what the part does, in your words. It goes into the prompt verbatim, so say what happens on tap, what is saved, what is validated.
- `action`: `{ "to": "<frame id>" | "back", "transition": "slide" | "slideLeft" | "slideUp" | "slideDown" | "fade" | "expand" | "none" }`, the screen a tap opens.
- `actions`: the same per place inside a part that has several, such as `"tab:2"` for the third row of a bar, list or menu, `"dismiss"` and `"confirm"` for the two buttons of a dialog, or `"main"` for the main half of a split button and `"more"` for its arrow when it has no menu.
- In an action, `"to": "none"` goes nowhere, and these are optional: `effects`, steps run in order before it goes; `when`, a condition it runs on; `else`, `{ "to", "transition", "effects" }` run when the condition fails.
- An effect is one of `{ "do": "show" | "hide" | "toggle" | "open" | "close", "part": "<item id>" }`, `{ "do": "setVar", "var": "<variable id>", "value": … }`, `{ "do": "toggleVar", "var" }`, `{ "do": "addVar", "var", "by": 1 }`, `{ "do": "setProp", "part", "prop": "<prop key>", "value": … }`, `{ "do": "snackbar", "message": "…" }`.
- A condition is `{ "var": "<variable id>", "op": "eq" | "neq", "value": … }` or `{ "filled": "<item id of an input>" }`.
- `bind`: `{ "<prop key>": "<variable id>" }`, the props that follow a variable. An input (`input`, `text-field`, `textarea`, `switch`, `checkbox`, `slider`, `select`, `radio-group`) also writes to the variable its value prop is bound to.
- `fill`: a background role, the same names as a screen's `bg`. `textColor`: `onSurface | onSurfaceVariant | primary | secondary | onPrimaryContainer | onSecondaryContainer | onTertiaryContainer | inverseOnSurface`. What is inside follows a fill by itself, so set `textColor` only to differ.
- `flowFill: true`: in an auto layout, the part takes the room left along the run.
- `look`: the part's effects, for a crafted look (a game button, a glass panel, a title); most parts need none. Colors in it are an M3 role in kebab case (`primary`, `on-surface`, `surface-container-high`), a role at a share (`primary/40`) or a hex (`#rrggbb`, `#rrggbbaa`), nothing else. Fields: `fills` (paint layers, top first: `{ "type": "solid", "color" }` or `{ "type": "linear" | "radial" | "conic", "stops": [{ "color", "at" }], "angle", "x", "y" }`), `clearFill`, `stroke` (`{ "width", "color", "style", "position" }`), `shadows` (`[{ "x", "y", "blur", "spread", "color", "inset" }]`), `elevation` (0–4, the style's own shadow), `opacity`, `blur`, `glass`, `blend`, `filter`, `rotate`, `transform` (`scaleX`, `scaleY`, `skewX`, `skewY`, `flipX`, `flipY`), `text` (`color`, `size`, `weight`, `letterSpacing`, `lineHeight`, `case`, `italic`, `decoration`, `shadows`, `stroke`, `gradient`) and `texture` (`{ "kind": "noise" | "paper" | "dots" | "grid" | "stripes" | "diagonal" | "checker" | "carbon" | "scanlines" | "crosshatch" | "halftone", "color", "opacity", "size" }`). Anything malformed is dropped when the document arrives.
- In an auto layout, also: `flowSize: { "w": "fixed" | "hug" | "fill", "h": … }` sizes the part on each axis (`hug` only for a container with a layout of its own); `alignSelf: "start" | "center" | "end" | "stretch" | "baseline"` overrides the container's `align` for this part; `flowAbsolute: true` leaves it where it is put, over the layout (a badge on a card); `flowMin` / `flowMax: { "w", "h" }` bound what the layout makes it; `flowSpan: 2` takes two columns of a grid.

Fields a group may carry: `name`, what the layers and the prompt call it; `hidden: true` starts it hidden, with no hole left in an auto layout; `showWhen`, a condition, shows it only while that holds; `pane`, a number, is the tab of the `dock` it stands on; `inFlow`, see below.

#### Auto layout

Prefer this to placing parts one by one: it stays tidy when text changes, and the code comes out as nested flex and grid. `box`, `container`, `dock`, `supporting-pane`, `window` and `custom` take `"layout": "row" | "column" | "grid"` in `props`, with `gap`, `padX`, `padY`, `align` (`start | center | end | stretch | baseline`), `justify` (`start | center | end | between | around | evenly`), `wrap` (a row), `columns` (a grid), `hugWidth` and `hugHeight`, which size the container to its contents. `gapY` is the gap between the lines of a wrapping row or the rows of a grid, and `padTop`, `padRight`, `padBottom`, `padLeft` pad one side; left out, `gap`, `padX` and `padY` say them. `grid-view` is always a grid.

Each part in it names it by group id with `inFlow`, in the order the parts come in the document. The editor works out their `x` and `y`, so any values do; the container must come before them. A container may stand in another.

```json
{ "id": "col", "x": 0, "y": 64, "axis": "x", "items": [ { "id": "c", "kind": "component", "component": "container", "label": "", "icon": null, "variant": "filled", "props": { "layout": "column", "gap": 12, "padX": 16, "padY": 16, "align": "stretch", "fill": "none", "border": "none", "width": 412, "height": 400 } } ] }
{ "id": "a", "x": 0, "y": 0, "axis": "x", "inFlow": "col", "items": [ { "id": "t", "kind": "component", "component": "text-field", "label": "", "icon": null, "variant": "filled", "props": { "label": "Email" } } ] }
{ "id": "b", "x": 0, "y": 0, "axis": "x", "inFlow": "col", "items": [ { "id": "s", "kind": "component", "component": "button", "label": "", "icon": null, "variant": "filled", "props": { "label": "Sign in" } } ] }
```

#### Composing from atoms

The parts come in two tiers. **Composites** (an `app-bar`, a `search`, a `card`) are ready-made. **Atoms** (`box`, `text`, `icon`, `svg`, `image`, `button`, `icon-button`, `input`, `textarea`, `switch`, `chip`, `avatar`, `badge`, `dot`…) cannot be split, and anything the composites do not have is built from them in nested boxes, the way a designer nests auto-layout frames: a Claude-style prompt box is a card `box` holding a `textarea` and a row `box` of buttons.

- `box` is the frame. Auto layout is on (`layout` `column` by default), it hugs its contents both ways (`hugWidth`, `hugHeight`), and it draws nothing but its `surface`: `none` (default, invisible), `card`, `panel`, `field` (the container of an input), `bar`, `chip`, `button`, `sheet`, `overlay`, `well`. The style dresses each surface as its own, so name the role rather than painting it. Give the outermost box a `width` and `"hugWidth": false`; a row inside a column with `"align": "stretch"` takes the column's width.
- `text` with `"fit": "auto"` hugs its words (a label in a row); with `"fit": "fixed"` (the default) it wraps in its `width`, which a stretching column sets, and `maxLines` cuts it off with an ellipsis.
- `input` and `textarea` with `"variant": "plain"` are bare entries with no border, background or padding: the box around them is the field. A plain `textarea` with `autoGrow` grows with the words from `rows`.
- `flowFill: true` on an item makes it take the room left along its row or column: the entry of a search bar, the two lines of a list row. Two filling boxes on either side of a title center it.
- `button` takes `trailingIcon` (a chevron after "Model"); `icon-button` and `button` take the `ghost` variant (neutral, no container).
- `svg` draws a shape of the library (`preset`), one path (`"mode": "path"`, `path` and `viewBox`) or pasted markup (`"mode": "markup"`); it paints with the text color unless the markup sets its own. Markup is cleaned: no scripts, styles, event handlers, links or foreign content.

```json
{ "id": "pb", "x": 16, "y": 600, "axis": "x", "items": [ { "id": "pb1", "kind": "component", "component": "box", "label": "", "icon": null, "variant": "filled", "props": { "surface": "card", "layout": "column", "align": "stretch", "gap": 16, "padX": 16, "padY": 16, "width": 380, "hugWidth": false } } ] }
{ "id": "pt", "x": 0, "y": 0, "axis": "x", "inFlow": "pb", "items": [ { "id": "pt1", "kind": "component", "component": "textarea", "label": "", "icon": null, "variant": "filled", "props": { "variant": "plain", "placeholder": "How can I help you today?", "rows": 2 } } ] }
{ "id": "pr", "x": 0, "y": 0, "axis": "x", "inFlow": "pb", "items": [ { "id": "pr1", "kind": "component", "component": "box", "label": "", "icon": null, "variant": "filled", "props": { "layout": "row", "align": "center", "justify": "between", "padX": 0, "padY": 0 } } ] }
{ "id": "pa", "x": 0, "y": 0, "axis": "x", "inFlow": "pr", "items": [ { "id": "pa1", "kind": "component", "component": "icon-button", "label": "", "icon": null, "variant": "filled", "props": { "icon": "add", "label": "Add files", "variant": "outlined", "size": "xs" } } ] }
{ "id": "ps", "x": 0, "y": 0, "axis": "x", "inFlow": "pr", "items": [ { "id": "ps1", "kind": "component", "component": "icon-button", "label": "", "icon": null, "variant": "filled", "props": { "icon": "arrow_upward", "label": "Send", "variant": "filled", "size": "xs" } } ] }
```

The kits below are such compositions the person can add from the palette; write the same tree of boxes when one is what a screen needs.

<!-- kits:begin -->

- `claude-prompt` (AI): Claude-style prompt box, a card holding a growing plain textarea over a row of attach / tools buttons, a model picker and a square send button. Variants: `home` (home, large); `thread` (in a conversation).
- `codex-prompt` (AI): Codex-style prompt box, a dark panel with a growing plain textarea, repository and branch pickers, a mic, and Ask / Code buttons. Variants: `phone` (phone, stacked); `wide` (desktop, one row).
- `chatgpt-composer` (AI): ChatGPT-style composer, a rounded field: attach button, a plain entry that takes the rest, a mic and a round voice / send button; or the same over two rows. Variants: `pill` (one line); `box` (two rows).
- `search-bar` (Menus & search): Search bar, a field box in a row: a search icon, a plain entry that takes the rest, and a mic, an avatar or a shortcut key at the end. Variants: `material` (material, full round); `soft` (small, rounded (ios-like)); `desktop` (desktop, with a shortcut).
- `top-app-bar` (Navigation): Top app bar, a bar box: the way back, the title (at the start, centered between two equal sides, or large under the bar) and action buttons. Variants: `start` (title at the start); `center` (title centered); `large` (large title).
- `list-row` (Lists): List row, a row box: a leading icon or avatar, a column of a title and a supporting line that takes the rest, and a chevron, a switch or a value at the end. Variants: `icon` (icon, two lines, chevron); `avatar` (avatar, two lines, time); `switch` (icon, two lines, switch); `value` (title, value, chevron).
- `settings-row` (Lists): Settings row, a row box: a setting's icon (on a small colored tile where the style groups lists), its name taking the rest, and a switch or its value and a chevron. Variants: `switch` (with a switch); `value` (with a value).
- `media-card` (Layout): Media card, a card box: a picture, an overline, a title, a few lines that wrap, and a row of actions at the end. Variants: `media` (picture on top); `side` (picture at the side); `text` (words only).
- `login-form` (Forms): Login form, a column box: a heading and a line, email and password inputs as wide as the column, a forgot-password link, a wide sign-in button and a sign-up link. Variants: `email` (email and password); `card` (on a card); `phone` (phone and code).
- `resource-pill` (Game): Resource pill, a chip box: a currency icon or vector mark, the amount in bold, and a small filled plus button. Variants: `coins` (coins with a plus); `gems` (gems); `energy` (energy with a cap).

<!-- kits:end -->

Variables sit on the document: `"vars": [ { "id": "count", "name": "count", "type": "text" | "number" | "bool", "value": 0 } ]`. They live while the prototype runs and start over each time.

#### Reusing parts (optional)

**Components.** `"components": [ { "id": "card", "name": "Card", "w": 380, "h": 180, "groups": [ … ] } ]` on the document holds definitions: ordinary groups, placed relative to the definition's own top left. An instance is a group that names one, with `items` left empty: the editor gives it the single item that stands in for it.

```json
{ "id": "c1", "x": 16, "y": 120, "axis": "x", "instanceOf": "card", "overrides": { "title1/title": "Tomato soup", "photo1/src": "https://example.com/soup.jpg" }, "items": [] }
```

`overrides` is keyed `itemId/propKey`, by the ids inside the definition, and may change text, icon, image and bool props. Changing a definition changes every instance. An instance is as big as its definition comes to. It may stand in an auto layout through `inFlow`, and a definition may use auto layout and hold instances of other definitions, but never one of itself: such a loop draws nothing.

**Data.** `"collections": [ { "id": "posts", "name": "Posts", "fields": ["title", "body"], "rows": [["First", "…"], ["Second", "…"]] } ]` on the document holds rows. A layout container (one with auto layout) may carry `"repeat": { "collection": "posts", "limit": 10 }`: its first child, and whatever that holds, is drawn once per row. Write `{{title}}` in its words to show a field. A tap on a row runs with that row as the current one: a detail screen can show `{{current.title}}`, and a condition can read `{ "var": "row.title", "op": "eq", "value": "First" }`. Give the container `hugHeight: true` so that it grows with its rows.

Icons are Material Symbols names (`home`, `search`, `add`, `favorite`, `settings`, `arrow_back`, `more_vert`, `edit`, `delete`, `share`, `restaurant`, `photo_camera`, …).

### The parts

These are all the parts there are; a `component` that is not here shows as an unknown part. A `kind` other than `component` makes the whole file unreadable. Numbers are in dp unless they say otherwise.

<!-- parts:begin -->

#### Atoms

They cannot be split. Compose them in `box`es to build anything the composites do not have.

##### Basics

| component | what it is | props (all optional) |
|---|---|---|
| `box` | Box | `surface` none / card / panel / field / bar / chip / button / sheet / overlay / well; `layout` free / row / column / grid; `gap` 0–96; `gapY` 0–96; `padX` 0–96; `padY` 0–96; `padTop` 0–96; `padRight` 0–96; `padBottom` 0–96; `padLeft` 0–96; `align` start / center / end / stretch / baseline; `justify` start / center / end / between / around / evenly; `wrap` true / false; `columns` 1–12; `hugWidth` true / false; `hugHeight` true / false; `width` 0–2400; `height` 0–2400 |
| `svg` | Vector | `mode` preset / markup / path; `preset` ribbon / starburst / star / sparkle / wave / hexagon / diamond / shield / squircle / blob / speech-tail / tag / chevron / corner / arc / ring; `markup` text; `path` text; `viewBox` text; `outline` true / false; `strokeWidth` 0.5–24; `color` current / default / muted / primary / secondary / tertiary / error / outline / primary-container / secondary-container / tertiary-container / surface-container-high / on-primary; `stretch` true / false; `label` text; `width` 4–1600; `height` 4–1600 |
| `label` | Label | `text` text; `control` checkbox / switch / none; `disabled` true / false |
| `separator` | Separator | `orientation` horizontal / vertical; `length` 8–1600; `thickness` 1–64; `color` default / primary / primary-container / secondary-container / tertiary-container / surface-container / surface-container-high / outline |
| `icon` | Icon | `name` icon; `size` 16–96; `filled` true / false; `color` default / primary / secondary / tertiary / error / muted / on-surface / on-primary / inverse |
| `shape` | Shape | `name` 4-leaf-clover / 4-sided-cookie / 6-sided-cookie / 7-sided-cookie / 8-leaf-clover / 9-sided-cookie / 12-sided-cookie / burst / oval / pentagon / pill / soft-burst / sunny / very-sunny / bun / boom / arch / arrow / diamond / fan / flower / gem / ghost-ish / heart / hexagon / pixel-circle / pixel-triangle / puffy / puffy-diamond / semicircle / slanted / soft-boom / square / circle / triangle; `color` primary / secondary / tertiary / primary-container / secondary-container / tertiary-container / surface-container / surface-container-high / outline / error; `width` 8–800; `height` 8–800 |
| `text` | Text | `text` text; `style` display / headline / title / heading / subtitle / lead / body / label / caption / tiny; `color` default / muted / primary / secondary / tertiary / error / outline / on-primary / inverse; `align` start / center / end; `bold` true / false; `fit` auto / fixed; `width` 40–1600; `maxLines` 0–6 |
| `image` | Image | `src` https address; `alt` text; `fit` cover / contain; `radius` 0–120; `width` 24–1600; `height` 24–1600 |
| `spacer` | Spacer | `height` 4–800; `width` 4–1920 |

##### Controls

| component | what it is | props (all optional) |
|---|---|---|
| `radio` | Radio button | `label` text; `checked` true / false; `disabled` true / false |
| `button` | Button | `label` text; `icon` icon; `variant` filled / tonal / elevated / outlined / text / ghost; `size` xs / sm / md / lg / xl; `trailingIcon` icon; `shape` round / square; `width` 48–640; `iconWidth` default / narrow / wide; `disabled` true / false; `toggle` true / false; `onIcon` icon; `onLabel` text; `onLook` same / filled / tonal / elevated / outlined / text |
| `chip` | Chip | `items` rows of `{ "label", "icon" }`; `kind` assist / filter / input; `selected` -1–7; `variant` flat / elevated; `size` default / md / lg |
| `toggle` | Toggle | `icon` icon; `label` text; `variant` default / filled / tonal / outline / elevated; `size` xs / sm / default / md / lg; `shape` round / square; `pressed` true / false; `disabled` true / false |
| `switch` | Switch | `label` text; `checked` true / false; `size` default / sm; `disabled` true / false; `width` 52–520 |
| `checkbox` | Checkbox | `label` text; `checked` true / false; `indeterminate` true / false; `error` true / false; `disabled` true / false |
| `slider` | Slider | `label` text; `value` 0–100; `range` true / false; `end` 0–100; `disabled` true / false; `width` 120–800 |
| `input` | Input | `placeholder` text; `value` text; `type` text / email / password / number / search / tel / url; `variant` outlined / filled / plain; `size` default / sm; `error` true / false; `disabled` true / false; `width` 120–1280 |
| `textarea` | Textarea | `placeholder` text; `value` text; `variant` outlined / filled / plain; `rows` 1–10; `autoGrow` true / false; `error` true / false; `disabled` true / false; `width` 120–1280 |
| `rating` | Rating | `value` 0–10; `count` 1–10; `readOnly` true / false |
| `link` | Link | `label` text; `href` text |
| `icon-button` | Icon button | `icon` icon; `label` text; `variant` filled / tonal / elevated / outlined / text / ghost; `size` xs / sm / default / md / lg / xl; `disabled` true / false; `iconFill` true / false |

##### Indicators

| component | what it is | props (all optional) |
|---|---|---|
| `dot` | Status dot | `color` primary / secondary / tertiary / error / outline / muted / surface; `size` 4–32; `ring` true / false |
| `badge` | Badge | `kind` label / dot / count; `label` text; `variant` default / secondary / tertiary / destructive / outline / ghost / link; `icon` icon; `count` 1–2000 |
| `progress` | Progress | `value` 0–100; `indeterminate` true / false; `variant` flat / wavy; `thickness` 2–16; `label` text; `showValue` true / false; `width` 80–560 |
| `circular-progress` | Circular progress | `value` 0–100; `indeterminate` true / false; `variant` flat / wavy; `size` 24–120; `thickness` 2–16 |
| `loading-indicator` | Loading indicator | `variant` default / contained; `size` 24–128; `speed` 0–3 |
| `spinner` | Spinner | `size` xs / sm / md / lg; `color` primary / secondary / tertiary / error / on-surface |
| `skeleton` | Skeleton | `layout` profile / text / card / block; `lines` 1–8; `width` 80–560; `height` 8–320 |
| `avatar` | Avatar | `initials` text; `size` sm / default / lg; `image` https address; `count` 1–5 |
| `kbd` | Kbd | `keys` rows of `{ "label" }`; `caption` text |
| `page-dots` | Page dots | `count` 1–12; `current` 0–11 |
| `typing-indicator` | Typing indicator | `label` text |

#### Composites

Ready-made, each one part. The ones marked *(splits)* can be split into atoms in the editor.

##### Actions

| component | what it is | props (all optional) |
|---|---|---|
| `fab` | FAB | `icon` icon; `label` text; `size` sm / default / md / lg; `color` primary-container / secondary-container / tertiary-container / primary / secondary / tertiary / surface; `lowered` true / false; `collapsed` true / false; `toggle` true / false; `onIcon` icon; `onLabel` text |
| `toggle-group` | Toggle group | `items` rows of `{ "label", "icon" }`; `selected` 0–5; `connected` true / false; `variant` default / filled / tonal / outline / elevated; `size` xs / sm / default / md; `multiple` true / false |
| `button-group` | Button group | `items` rows of `{ "label", "icon" }`; `variant` connected / standard; `orientation` horizontal / vertical; `buttonVariant` filled / tonal / elevated / outlined / text; `size` xs / sm / md / lg / xl |
| `split-button` | Split button | `label` text; `icon` icon; `variant` filled / tonal / elevated / outlined / text; `size` xs / sm / md / lg / xl; `menu` true / false; `menuItems` rows of `{ "label", "icon" }` |
| `fab-menu` | FAB menu | `items` rows of `{ "label", "icon" }`; `icon` icon; `open` true / false |
| `function-button` | Function button | `label` text; `icon` icon; `timer` 0–999; `unit` second / minute / hour; `size` 32–120 |
| `brand-button` | Sign-in or pay button | `label` text; `width` 120–800 |

##### Forms

| component | what it is | props (all optional) |
|---|---|---|
| `radio-group` | Radio group | `items` rows of `{ "label" }`; `selected` 0–5; `layout` column / row; `error` true / false; `disabled` true / false |
| `text-field` | Text field | `label` text; `value` text; `supporting` text; `variant` outlined / filled; `leadingIcon` icon; `trailingIcon` icon; `error` true / false; `multiline` true / false; `width` 120–520 |
| `input-group` | Input group | `placeholder` text; `leadingIcon` icon; `leadingText` text; `trailingText` text; `button` text; `error` true / false; `disabled` true / false; `width` 160–520 |
| `input-otp` | Input OTP | `length` 2–8; `group` 0–8; `value` text; `error` true / false; `disabled` true / false |
| `field` | Field | `label` text; `control` input / textarea / checkbox / switch; `placeholder` text; `description` text; `error` text; `disabled` true / false; `width` 160–520 |
| `form` | Form | `fields` rows of `{ "label" }`; `submit` text; `width` 200–800 |
| `copy-row` | Copy row | `text` text; `width` 120–800 |
| `quantity-stepper` | Quantity stepper | `value` 0–999; `min` 0–999; `max` 0–999; `width` 120–400 |
| `tag-input` | Tag input | `items` rows of `{ "label" }`; `placeholder` text; `width` 160–1280 |
| `phone-input` | Phone number | `code` text; `placeholder` text; `width` 160–640 |
| `file-upload` | File upload | `title` text; `hint` text; `action` text; `multiple` true / false; `accept` text; `width` 200–800 |
| `auth-form` | Sign-in form | `mode` sign-in / sign-up; `title` text; `subtitle` text; `upTitle` text; `nameLabel` text; `emailLabel` text; `passwordLabel` text; `confirmLabel` text; `remember` text; `forgot` text; `action` text; `upAction` text; `toUp` text; `toIn` text; `others` rows of `{ "label" }`; `minLength` 1–32; `badEmail` text; `badPassword` text; `badConfirm` text; `success` text; `width` 240–640 |
| `number-pad` | Number pad | `mode` amount / pin / phone; `prefix` text; `length` 1–20; `action` text; `done` text; `width` 200–480 |
| `signature-pad` | Signature pad | `hint` text; `clear` text; `action` text; `done` text; `height` 80–480; `width` 200–800 |
| `rich-text-editor` | Rich text editor | `text` text; `placeholder` text; `counter` true / false; `height` 80–800; `width` 280–1280 |

##### Pickers

| component | what it is | props (all optional) |
|---|---|---|
| `select` | Select | `items` rows of `{ "label" }`; `selected` -1–7; `variant` outlined / filled; `label` text; `placeholder` text; `supporting` text; `size` default / sm; `disabled` true / false; `width` 120–520 |
| `native-select` | Native select | `items` rows of `{ "label" }`; `selected` 0–7; `size` default / sm; `disabled` true / false; `width` 120–520 |
| `combobox` | Combobox | `items` rows of `{ "label" }`; `selected` -1–9; `placeholder` text; `clear` true / false; `disabled` true / false; `width` 120–520 |
| `calendar` | Calendar | `mode` single / multiple / range; `months` 1–2; `outside` true / false; `weekStart` sunday / monday |
| `date-picker` | Date picker | `variant` docked / modal; `label` text; `placeholder` text; `width` 160–480; `mode` single / range; `title` text; `defaultView` calendar / input; `disabled` true / false |
| `time-picker` | Time picker | `title` text; `hours` 0–23; `minutes` 0–59; `hour24` true / false; `mode` dial / input; `width` 296–560 |
| `color-field` | Color field | `label` text; `value` text |
| `wheel-picker` | Wheel picker | `label` text; `items` rows of `{ "label" }`; `selected` 0–19; `width` 120–640 |
| `item-picker` | Item picker | `items` rows of `{ "label", "icon" }`; `columns` 1–8; `selected` 0–23; `width` 120–800 |
| `multi-select` | Multiple choice | `items` rows of `{ "label" }`; `selected` text; `width` 120–800 |
| `color-palette` | Color palette | `colors` text; `selected` 0–63; `width` 120–800 |
| `number-picker` | Number picker | `value` -100000–100000; `min` -100000–100000; `max` -100000–100000; `step` 1–1000; `unit` text; `width` 56–240 |
| `transfer-list` | Transfer list | `items` rows of `{ "label" }`; `chosen` text; `from` text; `to` text; `width` 280–960; `height` 120–800 |
| `region-picker` | Region picker | `label` text; `placeholder` text; `data` `{ "columns": ["Province", "City", "District"], "rows": [[…]] }`; `action` text; `height` 120–480; `width` 240–960 |
| `seat-map` | Seat map | `rows` 1–20; `columns` 1–20; `aisle` 0–20; `taken` text; `price` 0–100000; `currency` text; `most` 1–20; `screen` text; `pickedText` text; `action` text; `width` 240–960 |

##### Bars & navigation

| component | what it is | props (all optional) |
|---|---|---|
| `navigation-bar` | Navigation bar | `items` rows of `{ "label", "icon" }`; `selected` 0–4; `tall` true / false; `layout` vertical / horizontal; `elevated` true / false; `badge` 0–99; `badgeOn` 1–5; `width` 240–1280 |
| `app-bar` | App bar *(splits)* | `title` text; `subtitle` text; `size` small / medium / large; `leading` icon; `trailing` icon; `trailing2` icon; `centered` true / false; `scrolled` true / false; `width` 240–1280 |
| `tabs` | Tabs | `items` rows of `{ "label", "icon" }`; `selected` 0–7; `variant` primary / secondary / segmented; `width` 160–1280 |
| `navigation-rail` | Navigation rail | `items` rows of `{ "label", "icon" }`; `selected` 0–6; `expanded` true / false; `narrow` true / false; `modal` true / false; `compact` true / false; `menu` true / false; `fab` true / false; `height` 240–10000 |
| `toolbar` | Toolbar | `kind` floating / docked; `color` standard / vibrant; `orientation` horizontal / vertical; `items` rows of `{ "label", "icon" }`; `toggles` true / false; `width` 240–1280 |
| `breadcrumb` | Breadcrumb | `items` rows of `{ "label" }`; `separator` chevron / slash; `collapse` true / false |
| `pagination` | Pagination | `pages` 1–99; `current` 1–99; `previous` text; `next` text; `width` 240–1280 |
| `navigation-menu` | Navigation menu | `menus` rows of `{ "label" }`; `pages` rows of `{ "label" }`; `links` rows of `{ "label" }` |
| `sidebar` | Sidebar | `label` text; `items` rows of `{ "label", "icon" }`; `selected` 0–7; `size` default / sm / lg; `width` 200–400; `height` 200–800 |
| `steps` | Steps | `items` rows of `{ "label" }`; `current` 0–7; `width` 160–1200 |
| `side-tabs` | Side tabs | `items` rows of `{ "label" }`; `selected` 0–11; `width` 80–320 |
| `floating-nav` | Floating navigation | `items` rows of `{ "label", "icon" }`; `selected` 0–4; `width` 200–800 |
| `mini-program-header` | Mini program header | `title` text; `back` true / false; `width` 240–1280 |
| `toc` | Table of contents | `title` text; `items` rows of `{ "label" }`; `selected` 0–39; `width` 120–480 |
| `slide-group` | Slide group | `items` rows of `{ "label" }`; `width` 160–1280 |
| `icon-grid` | Icon grid | `items` rows of `{ "label", "icon" }`; `columns` 1–8; `badge` text; `width` 160–960 |
| `onboarding` | Onboarding | `data` `{ "columns": ["Icon", "Title", "Text"], "rows": [[…]] }`; `skip` text; `next` text; `done` text; `width` 240–800; `height` 280–1200 |

##### Menus & search

| component | what it is | props (all optional) |
|---|---|---|
| `search` | Search *(splits)* | `kind` view / bar; `style` elevated / outlined; `placeholder` text; `leading` icon; `trailing` icon; `size` default / sm; `results` rows of `{ "label", "icon" }`; `width` 200–640 |
| `command` | Command | `placeholder` text; `heading` text; `items` rows of `{ "label", "icon" }`; `width` 240–640 |
| `dropdown-menu` | Dropdown menu | `label` text; `variant` filled / tonal / elevated / outlined / text; `items` rows of `{ "label", "icon" }`; `destructive` text |
| `context-menu` | Context menu | `label` text; `items` rows of `{ "label", "icon" }`; `width` 120–640; `height` 64–480 |
| `filter-bar` | Filter bar | `placeholder` text; `filters` rows of `{ "label" }`; `width` 200–1200 |
| `cascading-menu` | Cascading menu | `label` text; `items` rows of `{ "label", "icon" }`; `subLabel` text; `subItems` rows of `{ "label" }` |

##### Overlays

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

##### Feedback

| component | what it is | props (all optional) |
|---|---|---|
| `sonner` | Snackbar | `label` text; `variant` filled / tonal / elevated / outlined / text; `message` text; `action` text; `closeButton` true / false |
| `alert` | Alert *(splits)* | `variant` default / info / tertiary / destructive; `icon` icon; `title` text; `description` text; `width` 200–640 |
| `empty` | Empty *(splits)* | `title` text; `description` text; `icon` icon; `action` text; `bordered` true / false; `width` 200–640 |
| `pull-to-refresh` | Pull to refresh | `hint` text; `width` 160–800; `height` 80–1200 |
| `number-ticker` | Number ticker | `value` -1000000000–1000000000; `prefix` text; `suffix` text; `size` title / headline / display |
| `timer` | Timer | `seconds` 1–86400; `countdown` true / false; `width` 160–480 |
| `banner` | Banner *(splits)* | `icon` icon; `text` text; `action` text; `secondary` text; `closable` true / false; `width` 200–1280 |
| `notice-bar` | Notice bar *(splits)* | `icon` icon; `items` rows of `{ "label" }`; `seconds` 1–30; `closable` true / false; `width` 160–1280 |

##### Layout

| component | what it is | props (all optional) |
|---|---|---|
| `card` | Card *(splits)* | `title` text; `description` text; `variant` filled / elevated / outlined; `imagePos` none / top / bottom / leading / trailing / background; `image` https address; `imageIcon` icon; `imageSize` 40–320; `textAlign` start / center / end; `contentAlign` start / center / end; `size` sm / default / lg; `interactive` true / false; `action` text; `width` 160–520; `height` 0–480 |
| `accordion` | Accordion | `items` rows of `{ "label" }`; `content` text; `openFirst` true / false; `multiple` true / false; `width` 200–640 |
| `collapsible` | Collapsible | `trigger` text; `variant` filled / tonal / elevated / outlined / text; `content` text; `open` true / false; `width` 160–520 |
| `scroll-area` | Scroll area | `scrollbars` vertical / horizontal / both; `label` text; `count` 1–100; `width` 120–560; `height` 80–480 |
| `aspect-ratio` | Aspect ratio | `ratio` 16:9 / 4:3 / 1:1 / 3:4 / 21:9; `label` text; `width` 120–640 |
| `container` | Container | `label` text; `note` text; `place` center / start; `fill` none / surface / surface-container-low / surface-container / surface-container-high / surface-container-highest / primary-container / secondary-container / tertiary-container; `border` none / solid / dashed; `radius` 0–48; `blur` 0–40; `layout` free / row / column / grid; `gap` 0–96; `gapY` 0–96; `padX` 0–96; `padY` 0–96; `padTop` 0–96; `padRight` 0–96; `padBottom` 0–96; `padLeft` 0–96; `align` start / center / end / stretch / baseline; `justify` start / center / end / between / around / evenly; `wrap` true / false; `columns` 1–12; `hugWidth` true / false; `hugHeight` true / false; `width` 40–2400; `height` 40–2400 |
| `stack` | Stack | `label` text; `note` text; `width` 40–2400; `height` 40–2400 |
| `grid-view` | Grid | `label` text; `note` text; `columns` 1–12; `rows` 1–12; `gap` 0–96; `gapY` 0–96; `padX` 0–96; `padY` 0–96; `padTop` 0–96; `padRight` 0–96; `padBottom` 0–96; `padLeft` 0–96; `align` start / center / end / stretch / baseline; `width` 40–2400; `height` 40–2400 |
| `dock` | Dock | `items` rows of `{ "label" }`; `selected` 0–11; `layout` free / row / column / grid; `gap` 0–96; `gapY` 0–96; `padX` 0–96; `padY` 0–96; `padTop` 0–96; `padRight` 0–96; `padBottom` 0–96; `padLeft` 0–96; `align` start / center / end / stretch / baseline; `justify` start / center / end / between / around / evenly; `wrap` true / false; `columns` 1–12; `hugWidth` true / false; `hugHeight` true / false; `width` 40–2400; `height` 40–2400 |
| `supporting-pane` | Supporting pane | `label` text; `note` text; `icon` icon; `layout` free / row / column / grid; `gap` 0–96; `gapY` 0–96; `padX` 0–96; `padY` 0–96; `padTop` 0–96; `padRight` 0–96; `padBottom` 0–96; `padLeft` 0–96; `align` start / center / end / stretch / baseline; `justify` start / center / end / between / around / evenly; `wrap` true / false; `columns` 1–12; `hugWidth` true / false; `hugHeight` true / false; `width` 40–2400; `height` 40–2400 |
| `custom` | Custom component | `name` text; `description` text; `layout` free / row / column / grid; `gap` 0–96; `gapY` 0–96; `padX` 0–96; `padY` 0–96; `padTop` 0–96; `padRight` 0–96; `padBottom` 0–96; `padLeft` 0–96; `align` start / center / end / stretch / baseline; `justify` start / center / end / between / around / evenly; `wrap` true / false; `columns` 1–12; `hugWidth` true / false; `hugHeight` true / false; `width` 40–2400; `height` 40–2400 |
| `section-header` | Section header *(splits)* | `title` text; `subtitle` text; `action` text; `width` 120–1280 |

##### Lists

| component | what it is | props (all optional) |
|---|---|---|
| `item` | List item *(splits)* | `items` rows of `{ "label", "icon" }`; `iconFill` none / primary-container / secondary-container / tertiary-container / primary / surface; `description` text; `variant` default / outline / muted / segmented; `size` default / sm / xs; `trailing` none / icon / switch / checkbox / radio / slider / text; `trailingIcon` icon; `checked` true / false; `trailingText` text; `width` 160–520 |
| `description-list` | Description list | `data` `{ "columns": ["Name", "Value"], "rows": [[…]] }`; `width` 160–960 |
| `timeline` | Timeline | `data` `{ "columns": ["Time", "Title", "Detail"], "rows": [[…]] }`; `current` 0–100; `width` 160–960 |
| `tracker` | Status tracker | `title` text; `states` text; `width` 120–1280 |
| `sortable-list` | Sortable list | `items` rows of `{ "label" }`; `width` 160–800 |
| `swipe-row` | Swipe row | `title` text; `note` text; `action` text; `width` 160–800 |
| `notification-list` | Notifications | `title` text; `data` `{ "columns": ["Title", "Body", "Time", "Icon"], "rows": [[…]] }`; `unread` 0–99; `markAll` text; `width` 240–800 |
| `file-list` | Files | `data` `{ "columns": ["Name", "Size", "Date"], "rows": [[…]] }`; `removable` true / false; `selected` -1–99; `width` 240–800 |
| `settings-group` | Settings group | `title` text; `data` `{ "columns": ["Icon", "Label", "Control", "Value"], "rows": [[…]] }`; `width` 240–800 |
| `todo-list` | To-do list | `title` text; `items` rows of `{ "label" }`; `placeholder` text; `width` 200–800 |

##### Data & charts

| component | what it is | props (all optional) |
|---|---|---|
| `chart` | Chart | `type` bar / line / area / stacked-bar / pie / radar; `title` text; `subtitle` text; `data` `{ "columns": ["Month", "Desktop", "Mobile"], "rows": [[…]] }`; `width` 200–1200; `height` 120–600 |
| `scatter-plot` | Scatter plot | `title` text; `subtitle` text; `data` `{ "columns": ["X", "Y"], "rows": [[…]] }`; `width` 160–960; `height` 96–600 |
| `heatmap` | Heatmap | `title` text; `subtitle` text; `data` `{ "columns": ["Mon", "Tue", "Wed", "Thu", "Fri"], "rows": [[…]] }`; `width` 160–960 |
| `gauge` | Gauge | `label` text; `value` 0–100 |
| `stat-card` | Stat card *(splits)* | `title` text; `value` text; `trend` text; `direction` up / down / flat; `width` 120–480 |
| `table` | Table | `title` text; `data` `{ "columns": ["Invoice", "Status", "Amount"], "rows": [[…]] }`; `caption` text; `selected` 0–100; `alignLast` true / false; `width` 200–960 |
| `markdown` | Markdown | `text` text; `width` 160–1280 |
| `sparkline` | Sparkline | `title` text; `value` text; `trend` text; `values` text; `kind` line / area / bar; `height` 16–240; `width` 96–640 |
| `bar-list` | Bar list | `title` text; `data` `{ "columns": ["Label", "Value"], "rows": [[…]] }`; `sorted` true / false; `selected` -1–99; `width` 200–800 |
| `data-table` | Data table | `title` text; `data` `{ "columns": ["Order", "Customer", "Status", "Total"], "rows": [[…]] }`; `search` text; `selectable` true / false; `pageSize` 1–100; `width` 280–1600 |
| `kanban` | Kanban board | `data` `{ "columns": ["To do", "In progress", "Done"], "rows": [[…]] }`; `add` text; `width` 240–1920 |
| `agenda` | Event calendar | `year` 1900–2200; `month` 1–12; `day` 1–31; `data` `{ "columns": ["Date", "Time", "Title"], "rows": [[…]] }`; `weekStart` sunday / monday; `empty` text; `width` 260–800 |
| `review-summary` | Review summary | `score` text; `count` text; `values` text; `tags` rows of `{ "label" }`; `action` text; `width` 240–960 |
| `funnel-chart` | Funnel chart | `title` text; `data` `{ "columns": ["Step", "Value"], "rows": [[…]] }`; `width` 200–960 |
| `gantt-chart` | Gantt chart | `title` text; `data` `{ "columns": ["Task", "Start", "Length", "Done"], "rows": [[…]] }`; `units` 1–52; `unit` text; `today` -1–52; `width` 240–960 |

##### Commerce

| component | what it is | props (all optional) |
|---|---|---|
| `subscription` | Subscription plans | `title` text; `description` text; `plans` rows of `{ "label" }`; `action` text; `width` 200–640 |
| `product-card` | Product card | `image` https address; `title` text; `subtitle` text; `price` text; `original` text; `badge` text; `rating` 0–5; `action` text; `done` text; `layout` vertical / horizontal; `liked` true / false; `width` 140–640 |
| `price-tag` | Price | `currency` text; `amount` text; `original` text; `discount` text; `size` small / medium / large |
| `cart-list` | Shopping cart | `data` `{ "columns": ["Name", "Variant", "Price", "Quantity"], "rows": [[…]] }`; `currency` text; `selectAll` text; `total` text; `action` text; `empty` text; `width` 280–800 |
| `coupon` | Coupon | `amount` text; `condition` text; `title` text; `expiry` text; `action` text; `done` text; `width` 260–640 |
| `checkout-bar` | Checkout bar | `label` text; `amount` text; `note` text; `icons` rows of `{ "label", "icon" }`; `action` text; `done` text; `width` 240–1280 |
| `balance-card` | Balance card | `title` text; `amount` text; `change` text; `actions` rows of `{ "label", "icon" }`; `hidden` true / false; `width` 240–800 |
| `transaction-list` | Transactions | `data` `{ "columns": ["Name", "Detail", "Amount"], "rows": [[…]] }`; `filters` rows of `{ "label" }`; `width` 240–800 |
| `route-card` | Route card | `icon` icon; `from` text; `fromTime` text; `to` text; `toTime` text; `duration` text; `note` text; `price` text; `action` text; `done` text; `width` 240–800 |

##### Social & chat

| component | what it is | props (all optional) |
|---|---|---|
| `profile-header` | Profile header | `cover` https address; `showCover` true / false; `avatar` https address; `name` text; `bio` text; `stats` rows of `{ "label" }`; `action` text; `done` text; `following` true / false; `width` 240–800 |
| `post-card` | Post | `author` text; `time` text; `text` text; `image` https address; `showImage` true / false; `likes` 0–1000000; `comments` 0–1000000; `shares` 0–1000000; `width` 240–800 |
| `leaderboard` | Leaderboard | `title` text; `data` `{ "columns": ["Name", "Score", "Change"], "rows": [[…]] }`; `faces` true / false; `selected` -1–99; `width` 240–800 |
| `conversation-list` | Conversations | `data` `{ "columns": ["Name", "Last message", "Time", "Unread"], "rows": [[…]] }`; `selected` -1–99; `width` 240–800 |
| `contact-list` | Contacts | `data` `{ "columns": ["Name", "Note"], "rows": [[…]] }`; `search` text; `grouped` true / false; `trailing` follow / call / message / none; `action` text; `done` text; `width` 240–800 |
| `comment-list` | Comments | `data` `{ "columns": ["Name", "Time", "Comment", "Likes"], "rows": [[…]] }`; `you` text; `now` text; `reply` text; `placeholder` text; `width` 240–800 |
| `story-row` | Stories | `items` rows of `{ "label" }`; `add` true / false; `width` 160–1280 |
| `chat-composer` | Message composer *(splits)* | `placeholder` text; `attach` true / false; `emoji` true / false; `width` 200–1280 |
| `voice-message` | Voice message | `seconds` 1–600; `mine` true / false; `transcript` text; `transcribe` text; `width` 160–480 |
| `video-call` | Video call | `name` text; `connected` true / false; `status` text; `image` https address; `icon` icon; `height` 240–960; `width` 240–960 |

##### AI

| component | what it is | props (all optional) |
|---|---|---|
| `message` | Message | `text` text; `align` start / end; `variant` default / secondary / muted / tinted / outline / ghost / destructive; `avatar` text; `header` text; `footer` text; `width` 200–640 |
| `bubble` | Bubble | `text` text; `variant` default / secondary / muted / tinted / outline / ghost / destructive; `align` start / end; `reaction` text; `width` 160–640 |
| `marker` | Marker | `text` text; `variant` default / separator / border; `icon` icon; `width` 120–640 |
| `attachment` | Attachment | `title` text; `description` text; `icon` icon; `state` done / idle / uploading / processing / error; `size` default / sm / xs; `orientation` horizontal / vertical; `remove` true / false |
| `message-scroller` | Message scroller | `messages` rows of `{ "label" }`; `button` true / false; `width` 240–640; `height` 160–480 |
| `questionnaire` | Questionnaire | `question` text; `description` text; `choices` rows of `{ "label" }`; `multiple` true / false; `steps` 1–3; `width` 240–640 |
| `shimmer-text` | Shimmer text | `text` text |

##### Media

| component | what it is | props (all optional) |
|---|---|---|
| `carousel` | Carousel (Embla) | `slides` rows of `{ "label" }`; `arrows` true / false; `orientation` horizontal / vertical; `itemWidth` 0–480; `gap` 0–32; `width` 160–640; `height` 80–400 |
| `expressive-carousel` | Expressive carousel | `variant` multi-browse / hero / uncontained / full-screen; `slides` rows of `{ "label" }`; `itemWidth` 120–400; `gap` 0–24; `height` 100–320; `width` 240–800 |
| `video` | Video | `src` text; `title` text; `time` text; `width` 160–1280 |
| `web-view` | Web page | `address` text; `load` true / false; `width` 160–1280; `height` 96–900 |
| `animation` | Animation placeholder | `file` text; `size` 48–640 |
| `camera` | Camera placeholder | `width` 120–1280; `height` 120–1280 |
| `map` | Map placeholder | `label` text; `width` 120–1280; `height` 96–1280 |
| `photo-grid` | Photo grid | `count` 1–30; `columns` 1–6; `width` 120–800 |
| `audio-player` | Audio player | `title` text; `artist` text; `src` text; `seconds` 1–36000; `width` 200–800 |
| `marquee` | Marquee | `text` text; `seconds` 2–120; `width` 80–1600 |
| `playlist` | Playlist or lessons | `title` text; `data` `{ "columns": ["Title", "Detail", "Length", "State"], "rows": [[…]] }`; `selected` -1–99; `width` 240–800 |
| `qr-code` | QR code | `text` text; `level` L / M / Q / H; `caption` text; `copy` text; `copied` text; `tooLong` text; `size` 64–640 |
| `scene` | Scene | `prompt` text; `style` text; `motion` still / animated; `frames` 2–64; `frameMs` 20–2000; `image` https address; `scrim` none / top / bottom / both / full; `hotspots` `{ "columns": ["Label", "x", "y", "w", "h"], "rows": [[…]] }`; `icon` icon; `height` 120–2400; `width` 120–1600 |
| `image-viewer` | Image viewer | `images` rows of `{ "label" }`; `height` 120–720; `thumbnails` true / false; `width` 160–960 |
| `image-cropper` | Image cropper | `image` https address; `aspect` free / 1:1 / 4:3 / 3:4 / 16:9; `action` text; `reset` text; `doneText` text; `height` 120–960; `width` 200–960 |

##### Game

| component | what it is | props (all optional) |
|---|---|---|
| `prize-wheel` | Prize wheel | `label` text; `prizes` rows of `{ "label", "icon" }`; `result` -1–11; `size` 120–480 |
| `grid-draw` | Grid draw | `label` text; `prizes` rows of `{ "label", "icon" }`; `result` -1–11; `size` 120–480 |
| `gacha` | Gacha | `label` text; `prizes` rows of `{ "label", "icon" }`; `result` -1–11; `size` 120–480 |
| `slot-machine` | Slot machine | `label` text; `prizes` rows of `{ "label", "icon" }`; `result` -1–11; `size` 120–480 |
| `money-tree` | Money tree | `label` text; `prizes` rows of `{ "label", "icon" }`; `result` -1–11; `size` 120–480 |
| `egg-smash` | Egg smash | `label` text; `prizes` rows of `{ "label", "icon" }`; `result` -1–11; `size` 120–480 |
| `asset-pill` | Asset pill *(splits)* | `value` text; `icon` icon |
| `inventory` | Inventory | `columns` 1–12; `rows` 1–12; `filled` 0–144; `width` 160–800 |
| `item-cell` | Item cell | `icon` icon; `name` text; `count` text; `rarity` text; `rarityColor` text; `badge` text; `size` 32–160 |
| `task-row` | Task row | `title` text; `action` text; `done` text; `width` 200–800 |
| `reward-track` | Reward track | `data` `{ "columns": ["At", "Label", "Icon"], "rows": [[…]] }`; `value` 0–100000; `max` 1–100000; `action` text; `width` 200–800 |
| `check-in` | Daily check-in | `title` text; `days` 7–31; `signed` 0–31; `width` 200–640 |
| `joystick` | Joystick | `size` 64–320; `angle` 0–360; `autoCenter` true / false |
| `stat-bar` | Stat bar | `icon` icon; `label` text; `value` 0–1000000; `max` 1–1000000; `color` error / primary / secondary / tertiary; `numbers` true / false; `width` 80–800 |
| `skill-button` | Skill button | `icon` icon; `label` text; `cooldown` 0–600; `size` 40–160 |
| `level-map` | Level map | `levels` 1–60; `current` 1–60; `stars` text; `perRow` 2–8; `width` 200–960 |
| `character-card` | Character card | `image` https address; `icon` icon; `name` text; `role` text; `level` text; `rarity` text; `data` `{ "columns": ["Stat", "Value", "Max"], "rows": [[…]] }`; `action` text; `width` 200–480 |
| `game-result` | Game result | `title` text; `stars` 0–3; `scoreLabel` text; `score` text; `rewards` rows of `{ "label", "icon" }`; `retry` text; `next` text; `width` 220–520 |
| `dialogue-box` | Dialogue box | `speaker` text; `icon` icon; `image` https address; `lines` rows of `{ "label" }`; `choices` rows of `{ "label" }`; `next` text; `width` 220–960 |
| `game-board` | Game board | `mode` mark / select; `rows` 1–20; `columns` 1–20; `cells` text; `marks` text; `need` 2–10; `turnText` text; `winText` text; `drawText` text; `reset` text; `width` 160–720 |

##### Desktop

| component | what it is | props (all optional) |
|---|---|---|
| `resizable` | Resizable | `orientation` horizontal / vertical; `first` text; `second` text; `split` 10–90; `handle` true / false; `width` 160–2400; `height` 80–2400 |
| `menubar` | Menubar | `menus` rows of `{ "label" }`; `items` rows of `{ "label", "icon" }` |
| `title-bar` | Title bar | `title` text; `controls` mac / windows / none; `width` 240–1920 |
| `status-bar` | Status bar | `text` text; `icon` icon; `trailing` text; `width` 240–1920 |
| `tree` | Tree | `items` rows of `{ "label", "icon" }`; `selected` 0–19; `width` 120–640 |
| `window` | Window | `title` text; `controls` mac / windows / none; `layout` free / row / column / grid; `gap` 0–96; `gapY` 0–96; `padX` 0–96; `padY` 0–96; `padTop` 0–96; `padRight` 0–96; `padBottom` 0–96; `padLeft` 0–96; `align` start / center / end / stretch / baseline; `justify` start / center / end / between / around / evenly; `wrap` true / false; `columns` 1–12; `hugWidth` true / false; `hugHeight` true / false; `width` 200–2400; `height` 120–2400 |
| `code-block` | Code block | `code` text; `language` text; `width` 200–1280 |
| `file-diff` | File diff | `file` text; `diff` text; `width` 200–1280 |

<!-- parts:end -->

### Screen templates

The editor's Templates tab adds these as new screens, in auto layout. A document cannot name them; if one fits, say so to the person.

<!-- templates:begin -->

- `auth-flow`: Sign-in flow, phone, 5 linked screens
- `start-flow`: First launch flow, phone, 3 linked screens
- `shop-flow`: Shop flow, phone, 5 linked screens
- `game-flow`: Game flow, phone, 5 linked screens
- `splash`: Splash, phone
- `onboarding`: Onboarding, phone
- `login`: Log in, phone
- `sign-up`: Sign up, phone
- `phone-login`: Phone sign-in, phone
- `forgot-password`: Forgot password, phone
- `verify-code`: Verification code, phone
- `reset-password`: New password, phone
- `category-browse`: Categories, phone
- `product-list`: Product list, phone
- `product-detail`: Product detail, phone
- `cart`: Cart, phone
- `checkout`: Checkout, phone
- `order-success`: Order success, phone
- `order-list`: Orders, phone
- `order-detail`: Order detail, phone
- `refund-request`: Refund request, phone
- `write-review`: Write a review, phone
- `coupon-list`: Coupons, phone
- `address-list`: Addresses, phone
- `me-center`: Me, phone
- `contacts`: Contacts, phone
- `ai-chat`: AI assistant, phone
- `short-video`: Short video, phone
- `home-feed`: Home feed, phone
- `post-detail`: Post detail, phone
- `profile`: Profile, phone
- `chat-list`: Chat list, phone
- `chat-thread`: Chat thread, phone
- `group-chat`: Group chat, phone
- `notifications`: Notifications, phone
- `search-home`: Search, phone
- `video-detail`: Video, phone
- `booking`: Booking, phone
- `help-center`: Help center, phone
- `search-results`: Search results, phone
- `article-detail`: Article, phone
- `pricing`: Pricing, phone
- `calendar`: Calendar, phone
- `event-detail`: Event detail, phone
- `course-detail`: Course detail, phone
- `music-player`: Music player, phone
- `map-route`: Map and route, phone
- `wallet`: Wallet, phone
- `error-state`: Error, phone
- `loading-state`: Loading, phone
- `permission`: Permission request, phone
- `feedback`: Feedback, phone
- `about`: About, phone
- `settings`: Settings, phone
- `form`: Form, phone
- `empty-state`: Empty state, phone
- `game-title`: Title screen, phone
- `game-loading`: Loading screen, phone
- `game-lobby`: Lobby, phone
- `game-lobby-landscape`: Lobby, landscape, landscape
- `world-map`: World map, phone
- `level-select`: Level select, phone
- `level-start`: Level start, phone
- `match-found`: Match found, landscape
- `battle-hud`: Battle, landscape
- `puzzle-board`: Puzzle board, phone
- `pause-menu`: Pause menu, phone
- `victory`: Victory, phone
- `defeat`: Defeat, phone
- `story-dialogue`: Story dialogue, phone
- `game-inventory`: Inventory, phone
- `game-character`: Character, phone
- `character-upgrade`: Character upgrade, phone
- `character-select`: Choose a hero, phone
- `game-shop`: Game shop, phone
- `gacha-pull`: Summon, phone
- `event-wheel`: Lucky wheel, phone
- `daily-check-in`: Daily check-in, phone
- `game-quests`: Quests, phone
- `battle-pass`: Season pass, phone
- `game-leaderboard`: Leaderboard, phone
- `game-friends`: Friends, phone
- `game-guild`: Guild, phone
- `game-mail`: Mail, phone
- `game-settings`: Game settings, phone
- `pc-main-menu`: PC main menu, desktop
- `pc-hud`: PC in game, desktop
- `pc-inventory`: PC character and bag, desktop
- `desktop-login`: Desktop sign-in, desktop
- `desktop-settings`: Desktop settings, desktop
- `mail-inbox`: Three-pane inbox, desktop
- `dashboard`: Dashboard, desktop
- `admin-table`: Admin table, desktop
- `file-manager`: File manager, desktop
- `desktop-chat`: Desktop chat, desktop
- `kanban-board`: Kanban board, desktop
- `editor-workspace`: Editor workspace, desktop
- `landing-page`: Landing page, desktop

<!-- templates:end -->

## Scenes

For a game or an immersive screen, the picture and the interface are separate things:

- The scene is one `scene` part filling the screen (`x` and `y` of the screen, `width` 412, `height` 892 on a phone), first among the screen's groups. Its `prompt` says what the picture shows, in a sentence or two. With a `theme.style`, leave the scene's own `style` out: the pictures are painted in the document's style. Without one, its `style` says how it is drawn, and every scene of an app has the same `style`, word for word, so the pictures belong together. An image model paints it; do not set `image`.
- Never ask the picture for anything the player reads or presses: no text, buttons, bars or menus in the `prompt`. Those are real parts standing on the scene (`stat-bar`, `skill-button`, `dialogue-box`, `button`, `game-result`…), as ordinary groups after it.
- What the player taps in the picture itself (a door, a chest) is a row of `hotspots`: `label`, then `x`, `y`, `w`, `h` in percent of the scene. Its action is in `actions` as `"tab:0"`, `"tab:1"`… Leave the area in the `prompt` so the thing is really there: "a wooden chest in the lower left".
- `motion`: `animated` paints a looping GIF instead of a still, for a scene where gentle movement adds something (candlelight, rain, water). It is smaller and costs more, so leave the rest `still`. `frames` and `frameMs` set its length.
- `scrim` darkens part of the picture so what stands on it can be read: `top`, `bottom`, `both` or `full`. Words with no surface of their own (`text`, `stat-bar`…) should stand where it is dark; for long text, use a part with a surface such as `dialogue-box` or `card`.
- Leave scenes out of ordinary app screens. A scene never reacts to the player: a `still` does not move, and an `animated` one only repeats its loop.

## Keep it simple

- Leave what the app does not need out. An app bar with just a title is normal; not every bar needs a menu and a search icon, not every list row needs a trailing chevron.
- Do not add parts to fill space. A screen with a bar, a list and a FAB is complete.
- One idea per screen. If a screen needs a second scroll of parts, it is two screens.
- Prefer the default sizes. Say what the app should look like with one `theme.style`, and leave the rest of the look to it; the person retunes it afterwards.
- A main action on its own gets `"size": "md"` and a width of 380 (the full content width); two side by side get 182 each. Do not scatter small buttons around a screen.
- Put a main action right under what it acts on, not far below it at the foot of the screen. Only a screen whose content fills it keeps the action at the foot.
- Put a screen that opens from another next to it in `frames`: a detail screen comes straight after the list that leads to it.
- A list of similar rows is one `item` with several `items`, not a column of cards. Its `description` is one line shared by every row, so leave it empty unless all rows say the same; put what differs in each row's `label`.
- A `navigation-bar` is 64 tall: on a phone it stands at `y` 828, so it meets the bottom of the screen.
- A prop you leave out shows the part's sample words. Set a text prop to `""` when the part should say nothing there.
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
