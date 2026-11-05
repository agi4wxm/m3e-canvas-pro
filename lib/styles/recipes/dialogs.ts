import type { Recipes } from "./catalog";
import { role, type RecipeCss } from "./shared";

/* Dialogs, and a story's dialogue box. */

const DIALOG = `:is([data-slot=dialog-content],[data-slot=alert-dialog-content])`;
const FOOT = `:is([data-slot=dialog-footer],[data-slot=alert-dialog-footer])`;
const TITLE = `:is([data-slot=dialog-title],[data-slot=alert-dialog-title])`;
const WORDS = `:is([data-slot=dialog-description],[data-slot=alert-dialog-description])`;
const SPLIT_FOOT = `${DIALOG} ${FOOT}{flex-direction:row;gap:0;margin:8px -16px 0;border-top:1px solid ${role("outline-variant")}}
${DIALOG} ${FOOT} [data-button]{flex:1;height:44px;border-radius:0}
${DIALOG} ${FOOT} [data-button]+[data-button]{border-left:1px solid ${role("outline-variant")}}`;
export const DIALOG_CSS: RecipeCss<Recipes["dialog"]> = {
  m3: "",
  /* iOS: a small centered card, its words centered, its buttons split across the foot */
  alert: `${DIALOG}{max-width:280px;min-width:0;padding:20px 16px 0;gap:6px;text-align:center;border-radius:var(--md-sys-shape-corner-large-increased)}
${DIALOG} ${TITLE}{font-size:17px;line-height:22px;font-weight:600}
${DIALOG} ${WORDS}{font-size:13px;line-height:18px}
${SPLIT_FOOT}`,
  /* WeUI: the same, a little wider, with room around its words */
  weui: `${DIALOG}{max-width:320px;min-width:0;padding:24px 16px 0;gap:8px;text-align:center;border-radius:12px}
${DIALOG} ${TITLE}{font-size:17px;line-height:24px;font-weight:600}
${DIALOG} ${WORDS}{font-size:15px;line-height:22px}
${SPLIT_FOOT}`,
  /* Fluent, Ant Design, VS Code: left-aligned, smaller, its buttons at the right */
  modal: `${DIALOG}{padding:20px;gap:8px;border-radius:var(--md-sys-shape-corner-large)}
${DIALOG} ${TITLE}{font-size:16px;line-height:24px;font-weight:600}
${DIALOG} ${WORDS}{font-size:14px;line-height:20px}`,
  /* the casual games: a colored band across the head, the words centered in it */
  game: `${DIALOG}{padding:0 16px 16px;gap:12px;text-align:center;overflow:hidden}
${DIALOG} ${TITLE}{margin:0 -16px;padding:12px 16px;background-color:var(--st-bar-bg);color:var(--st-on-bar);font-family:var(--st-display,inherit)}
${DIALOG} ${FOOT}{justify-content:center;flex-direction:row}`,
  /* Elden Ring, Black Myth: words centered, square, nothing else */
  plain: `${DIALOG}{padding:24px;gap:10px;text-align:center;border-radius:0}
${DIALOG} ${FOOT}{justify-content:center;flex-direction:row}`,
};

const TALK = `[data-slot=dialogue-box]`;
const SPEAKER = `[data-slot=dialogue-speaker]`;
const PORTRAIT = `[data-slot=dialogue-portrait]`;
const SPEAKER_NAME = `[data-slot=dialogue-name]`;
const LINES = `:is([data-slot=dialogue-words],[data-slot=dialogue-choices],[data-slot=dialogue-next])`;
export const DIALOGUE_CSS: RecipeCss<Recipes["dialogue"]> = {
  m3: "",
  /* Stardew Valley: the words at the left, and at the right a portrait over a nameplate */
  portrait: `${TALK}{display:grid;grid-template-columns:minmax(0,1fr) 132px;column-gap:12px;align-content:start}
${LINES}{grid-column:1}
${SPEAKER}{grid-column:2;grid-row:1/span 4;flex-direction:column;align-items:stretch;gap:6px;padding-left:12px;border-left:3px solid var(--st-rim)}
${PORTRAIT}{width:100%;height:auto;aspect-ratio:1;border-radius:0;border:3px solid var(--st-rim)}
${SPEAKER_NAME}{flex:none;text-align:center;padding:2px 4px;background-color:${role("surface-container-lowest")};color:${role("on-surface")};border:1px solid var(--st-rim)}`,
  /* Genshin Impact, Honkai Star Rail: no box, the name over the words on a band fading up into the picture */
  band: `${TALK}{background:linear-gradient(transparent,rgb(0 0 0/.72) 32%);border:none;outline:none;border-radius:0;box-shadow:none;align-items:center;text-align:center;padding-top:32px;-webkit-mask-image:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent);mask-image:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)}
${SPEAKER}{justify-content:center}
${PORTRAIT}{display:none}
${SPEAKER_NAME}{flex:none;color:${role("primary")}}
[data-slot=dialogue-words]{color:#fff;text-align:center;min-height:0}`,
};
