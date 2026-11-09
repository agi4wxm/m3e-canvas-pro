/* What a host of a world promises it and asks of it (docs/世界宿主契约.md), as data and types: the same whether M3E's app
 * hosts the world in a view (the web, an H5 page) or an engine hosts M3E's screens over its own (Cocos, Godot: the plan's
 * batches 6 to 10). Nothing here is the web's: it names what happens, not how a platform does it. Plain data and no
 * imports beyond types, so it goes into an exported app's runtime as it is, and an engine-side host can read it. */

import type { WorldInputType } from "./types";

/** the steps of a world's life in a host, in order */
export const WORLD_LIFECYCLE = ["create", "mount", "connect", "running", "paused", "unmount"] as const;
export type WorldLifecycleStep = (typeof WORLD_LIFECYCLE)[number];

/** Who gets a touch or a key first. `hud` (the default): a control of the screen over the world (a joystick, a skill
 *  button) takes what lands on it, and only what lands on no control goes to the world (`World.pointer`); a touch keeps
 *  going where it started (capture) until it ends. `world`: the world takes everything, the HUD only what it is handed. */
export type InputPriority = "hud" | "world";

/** What the host does to the world while an overlay (a dialog, a sheet, a menu, a screen laid over) is open over it: every
 *  held input let go (a direction back to the middle, a button released: `Worlds.release`), and nothing more delivered
 *  until it closes; with `pause`, the world is asked to stand still (`requestPause(true)`) and to go on when it closes. */
export type OverlayPolicy = { release: true; pause: boolean };

/** When the host asks the world to pause (`requestPause(true)`): the app going into the background, an overlay (with
 *  `OverlayPolicy.pause`), the design asking. A world played with others may say no (`accepted: false`): the host then
 *  shows it running and does not wait for it. */
export type PausePolicy = { onBackground: boolean; onOverlay: boolean; mayRefuse: true };

/** The HUD regions over the world, in the view's own pixels: the host measures the controls laid over it and tells the
 *  world (`occlude`) whenever they move, so the world keeps what matters out from under them. */
export type OcclusionPolicy = { from: "hud-controls"; when: "layout-changes" };

/** what the world's clock is read against: the app's domain clock (the transport's `now`, never the device's), and what
 *  the HUD reads the world's own times off (`World.clock()`) */
export type ClockPolicy = { domain: "app"; hudReads: "world-clock" };

/** The layers a screen can be marked as, from the bottom up (docs/世界宿主契约.md “分层”, docs/交互规则.md “分层”): the
 *  `world` (a screen that holds a world view, a page of its own), a `hud` laid over it, a `dialog` over that, a `toast`
 *  over everything. A layer above is drawn over one below and is asked first for what lands on it. */
export const SCREEN_LAYERS = ["world", "hud", "dialog", "toast"] as const;
export type ScreenLayer = (typeof SCREEN_LAYERS)[number];

/** What a layer takes of the visitor's input. `all`: whatever lands on it (a page, a world). `controls`: only what lands
 *  on its controls, the rest falls through to the layer under it (a HUD over the world, a toast). `modal`: everything,
 *  and nothing under it takes any while it is up (a dialog, a screen laid over by `overlay`). */
export type LayerInput = "all" | "controls" | "modal";

/** How layers stand over a page: their order from the bottom up, what each takes of the input, which of them let go of
 *  what the worlds under them hold as they open (the overlay policy's `release`), and who says a layer pauses the world:
 *  the design (`Frame.pauses` on a dialog layer), else the overlay policy's `pause`. Going back closes the topmost layer
 *  the visitor opened; a HUD that stands with its page (`over`) goes with the page. */
export type LayerPolicy = {
  order: readonly ScreenLayer[];
  input: Record<ScreenLayer, LayerInput>;
  releases: readonly ScreenLayer[];
  pause: "design";
  back: "top-opened";
};

/** A host's contract with the worlds it hosts. */
export type WorldHostContract = {
  version: 1;
  lifecycle: readonly WorldLifecycleStep[];
  input: { priority: InputPriority; capture: true; types: readonly WorldInputType[]; timed: "app-clock" };
  occlusion: OcclusionPolicy;
  overlay: OverlayPolicy;
  pause: PausePolicy;
  layers: LayerPolicy;
  clock: ClockPolicy;
  /** everything that crosses between M3E and the world is plain JSON: numbers, strings, `Vec2`, ids */
  serialisable: true;
};

/** what every host of M3E's promises today */
export const WORLD_HOST_CONTRACT: WorldHostContract = {
  version: 1,
  lifecycle: WORLD_LIFECYCLE,
  input: { priority: "hud", capture: true, types: ["vec2", "bool"], timed: "app-clock" },
  occlusion: { from: "hud-controls", when: "layout-changes" },
  overlay: { release: true, pause: false },
  pause: { onBackground: true, onOverlay: false, mayRefuse: true },
  layers: { order: SCREEN_LAYERS, input: { world: "all", hud: "controls", dialog: "modal", toast: "controls" }, releases: ["dialog"], pause: "design", back: "top-opened" },
  clock: { domain: "app", hudReads: "world-clock" },
  serialisable: true,
};
