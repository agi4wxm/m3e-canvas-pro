import Taro from "@tarojs/taro";

import type { AppSpec } from "./spec";

/* Going from screen to screen: each screen is a page, a screen's params ride in its page's query (encoded here, read back
 * decoded), a tab of the tab bar is switched to (a tab page takes no query), and the stack is kept under the platform's
 * limit of ten pages. Where to come back to after signing in is a screen and its params. */

/** where the app is, or is to go: a screen and what it was opened with */
export type Place = { screen: string; params?: Record<string, unknown> };

/* How many times the visitor has gone somewhere (a page opened or gone back from, a screen laid over another or taken
   off it): an answer that comes after one runs its effects but goes nowhere (lib/actions, docs/交互规则.md “迟到的回答”).
   Counted as each move is asked for, and as the platform makes one by itself: its back button, a swipe back, its tab
   bar change the page stack with no page asked for here, which is seen the next time the moves are read. */
let moves = 0;

/** the page stack as the moves were last read, and whether a page has been asked for since */
let pagesSeen: string | undefined;
let asked = false;

/** the page stack as words: each page's route and query, bottom to top */
const pagesNow = () =>
  Taro.getCurrentPages()
    .map((p) => `${(p as { route?: string }).route ?? ""}?${JSON.stringify((p as { options?: unknown }).options ?? {})}`)
    .join(" ");

/** the visitor's moves so far: a page stack changed by the platform, no page having been asked for, is one more */
export const movesSoFar = () => {
  const now = pagesNow();
  if (pagesSeen !== undefined && now !== pagesSeen) {
    if (asked) asked = false;
    else moves++;
  }
  pagesSeen = now;
  return moves;
};

/** a move that is not a page's (a screen laid over this one, or taken off it) */
export const moved = () => {
  moves++;
};

/** how going back moves: the back action's own motion (lib/screenMotion's `Motion`) */
export type BackOptions = { motion?: { kind: string; dir?: string; easing?: string; ms?: number } };

/** a move between pages as the kit's navigator was told it: whether it went back, and the motion a back action gave */
export type PageMove = { back: boolean } & BackOptions;

/* The platform's page stack plays its own animation (navigateBack takes none on WeChat, Douyin or Taro's H5 router), as
   it does opening a page: a back action's motion is handed this far and kept, for what reads it (the consistency table,
   custom code), and has no say in how the page goes. */
let last: PageMove | undefined;

/** the last move between pages */
export const lastMove = () => last;

/** the most pages a mini-program keeps on its stack */
const MAX_STACK = 10;

/** a query value as words */
const word = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v));

/** the address of a screen with its params */
export function urlOf(spec: AppSpec, place: Place): string | undefined {
  const s = spec.screens[place.screen];
  if (!s) return undefined;
  const q = Object.entries(place.params ?? {})
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(word(v))}`)
    .join("&");
  return `/${s.path}${q && s.tab === undefined ? `?${q}` : ""}`;
}

/** A page's query as the screen was opened with it. WeChat and Douyin hand the values over still encoded; the web reads
 *  them from its address, decoded or not by the browser: what does not decode is kept as it came. */
export function readQuery(query: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(query ?? {})) {
    if (k === "$taroTimestamp" || typeof v !== "string") continue;
    let s = v;
    try {
      s = /%[0-9a-f]{2}/i.test(v) ? decodeURIComponent(v) : v;
    } catch {
      /* not encoded after all */
    }
    out[k] = s;
  }
  return out;
}

/** the screen of a page, by its path */
export function screenOfPath(spec: AppSpec, route: string | undefined): string | undefined {
  const path = (route ?? "").replace(/^\//, "").split("?")[0];
  return Object.keys(spec.screens).find((k) => spec.screens[k].path === path);
}

/** where the app is now: the screen on top of the stack and its query */
export function currentPlace(spec: AppSpec): Place | undefined {
  const pages = Taro.getCurrentPages();
  const top = pages[pages.length - 1] as { route?: string; options?: Record<string, unknown>; $taroParams?: Record<string, unknown> } | undefined;
  const screen = screenOfPath(spec, top?.route);
  if (!screen) return undefined;
  /* what it was opened with, of what it declares (the web's router adds a stamp of its own) */
  const given = readQuery(top?.options ?? top?.$taroParams);
  return { screen, params: Object.fromEntries((spec.screens[screen].params ?? []).filter((p) => p.name in given).map((p) => [p.name, given[p.name]])) };
}

/** Opens a screen: a tab is switched to, another page is pushed (or put in place of this one with `replace`, and
 *  always once the stack is full). */
export function openPlace(spec: AppSpec, place: Place, o: { replace?: boolean } = {}): Promise<unknown> {
  const url = urlOf(spec, place);
  if (!url) return Promise.resolve();
  moved();
  asked = true;
  last = { back: false };
  if (spec.screens[place.screen].tab !== undefined) return Taro.switchTab({ url }).catch(() => Taro.reLaunch({ url }));
  const full = Taro.getCurrentPages().length >= MAX_STACK - 1;
  return (o.replace || full ? Taro.redirectTo({ url }) : Taro.navigateTo({ url })).catch(() => Taro.reLaunch({ url }));
}

/** back a page, with the back action's motion if it gave one; from the first page, to where the app starts */
export function goBack(spec: AppSpec, o: BackOptions = {}): Promise<unknown> {
  moved();
  asked = true;
  last = { back: true, ...(o.motion ? { motion: o.motion } : {}) };
  if (Taro.getCurrentPages().length > 1) return Taro.navigateBack({ delta: 1 });
  return Taro.reLaunch({ url: urlOf(spec, { screen: spec.start }) ?? "/" });
}

/** the sign-in screen's key, if the app has one */
export const loginScreen = (spec: AppSpec) => Object.keys(spec.screens).find((k) => spec.screens[k].auth === "login");
