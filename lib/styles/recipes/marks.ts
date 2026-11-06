import type { Recipes } from "./catalog";
import { HEADINGS, OUTLINED, anyPart, mix, role, type RecipeCss } from "./shared";

/* How words and icons are marked: the treatment of headings, and of the icons that lead a row or a tile. */

/** the heading treatment: what a game's title or a desktop tool's section head looks like */
export const TEXT_CSS: RecipeCss<Recipes["text"]> = {
  m3: "",
  /* the shooters, Wild Rift: capitals, spaced out */
  caps: `${HEADINGS}{text-transform:uppercase;letter-spacing:.08em}`,
  /* Marvel Rivals: heavy, leaning capitals */
  italic: `${HEADINGS}{font-style:italic;font-weight:800;text-transform:uppercase;letter-spacing:.01em}`,
  /* the casual games: white words with a dark outline and a drop, in the display face */
  outlined: `${HEADINGS}{color:#fff;font-family:var(--st-display,inherit);${OUTLINED("var(--st-stroke)")}}`,
  /* Cyberpunk 2077: the words lit in their own color */
  glow: `${HEADINGS}{text-shadow:0 0 8px ${mix("primary", 60)},0 0 1px ${role("primary")}}`,
  /* Elden Ring, Wild Rift: titles cast in pale gold */
  gilded: `${HEADINGS}{background-image:linear-gradient(180deg,#FFF6D8 0%,var(--st-rim) 60%,var(--st-rim-dark) 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}`,
};

/** the icon at the head of a row, a tile or a menu entry: where a style may set it on a tile or a disc */
const GLYPHS = `:is([data-slot=item-media][data-variant=icon],${anyPart("glyph")})`;
export const ICON_CSS: RecipeCss<Recipes["icon"]> = {
  m3: "",
  /* iOS Settings: a white glyph on a small square of color */
  tile: `${GLYPHS}{display:inline-flex;align-items:center;justify-content:center;flex:none;width:30px;height:30px;border-radius:7px;background-color:${role("primary")};color:${role("on-primary")}}
${GLYPHS} [data-slot=icon]{width:18px;height:18px;color:${role("on-primary")}}`,
  /* WhatsApp, Android settings in some apps: a glyph on a round disc of a soft color */
  disc: `${GLYPHS}{display:inline-flex;align-items:center;justify-content:center;flex:none;width:40px;height:40px;border-radius:50%;background-color:${role("primary-container")};color:${role("on-primary-container")}}
${GLYPHS} [data-slot=icon]{width:22px;height:22px}`,
  /* desktop software: the glyphs grey, the accent kept for what is chosen */
  muted: `${GLYPHS},${GLYPHS} [data-slot=icon]{color:${role("on-surface-variant")}}`,
  /* Cyberpunk 2077: every icon lit in its own color */
  glow: `[data-slot=icon]{filter:drop-shadow(0 0 3px currentColor)}`,
  /* the games: icons stand off the panel on a dark drop */
  emboss: `[data-slot=icon]{filter:drop-shadow(0 1px 0 rgb(0 0 0/.45)) drop-shadow(0 -1px 0 rgb(255 255 255/.25))}`,
};

/** A texture laid over a screen's background, under everything on it. Drawn where the canvas draws the screen, outside
 *  any part's scope, so it names no role: grey at a low strength reads on any ground. */
export const SCREEN_TEXTURE: Record<Recipes["screen"], string> = {
  m3: "",
  scan: "repeating-linear-gradient(0deg, rgb(0 0 0 / 0.07) 0 1px, transparent 1px 3px)",
  grid: "repeating-linear-gradient(0deg, rgb(128 128 128 / 0.10) 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, rgb(128 128 128 / 0.10) 0 1px, transparent 1px 24px)",
  dots: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Ccircle cx='2' cy='2' r='1' fill='%23808080' fill-opacity='0.28'/%3E%3C/svg%3E")`,
  /* the noise does not read the rect, so the rect is clear: where the filter is not applied (a screen drawn to a
     picture through an SVG image) it leaves nothing, not a black square */
  paper: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.45 0 0 0 0 0.4 0 0 0 0.09 0'/%3E%3C/filter%3E%3Crect width='160' height='160' fill-opacity='0' filter='url(%23n)'/%3E%3C/svg%3E")`,
  vignette: "radial-gradient(120% 90% at 50% 40%, transparent 55%, rgb(0 0 0 / 0.32) 100%)",
};

const BAR = `[data-slot=scroll-area-scrollbar]`;
const THUMB = `[data-slot=scroll-area-thumb]`;
/** the scroll bars of a scrolling area */
export const SCROLL_CSS: RecipeCss<Recipes["scroll"]> = {
  m3: "",
  /* the desktop and the web apps: a thin grey thumb, no track */
  thin: `${BAR}{width:6px;padding:1px}
${THUMB}{border-radius:999px;background-color:${mix("on-surface", 28)}}`,
  /* VS Code, the games: a square thumb on a visible track */
  block: `${BAR}{width:10px;padding:0;background-color:${mix("on-surface", 6)}}
${THUMB}{border-radius:0;background-color:${mix("on-surface", 34)}}`,
  /* the phones: nothing until it scrolls */
  hidden: `${BAR}{opacity:0}`,
};
