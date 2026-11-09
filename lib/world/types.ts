/* A world view's contract (docs/边界与契约.md “实时玩法”, docs/组件规范.md “世界视口”): what M3E hands the engine that
 * draws a world and what it takes back. The picture, the physics, the camera and the rules are the engine's; M3E
 * decides the screen around it, how the visitor's input reaches it (input actions on a channel of its own, never
 * through the app's state) and what the design does on its events. Types only, so the file goes into an exported app's
 * runtime as it is. */

import type { Vec2, WorldInput } from "../actions/host";

export type { Vec2, WorldInput };

/** Something in the world as the design reads it: its id, what kind it is (`player`, `enemy`, `item`…), where it stands
 *  (x and y from 0 to 100, across and down the view), its words. The engine's own positions may be anything: this is
 *  the small snapshot a HUD and a stand-in read. */
export type WorldEntity = { id: string; kind: string; x: number; y: number; label?: string };

/** how the world is going, as it says */
export type WorldStatus = "running" | "paused" | "ended";

/** what an input action carries: a direction (`vec2`, x and y from -1 to 1) or a button held or not (`bool`) */
export type WorldInputType = "vec2" | "bool";

/** an input action the world takes, by its name and its type, as the document declares it once (a world view's `inputs`:
 *  `"move: vec2, attack: bool"`): what a joystick, a skill key and later a keyboard or a gamepad are mapped to */
export type WorldInputDecl = { name: string; type?: WorldInputType };

/** What a world view is handed from the design: the world's state it shows (bindable to data), and the input actions the
 *  world says it takes. Plain JSON: it crosses to any engine (a web canvas, Cocos, Godot) as it is. */
export type WorldState = {
  /** what the design calls the world */
  label?: string;
  /** what the picture is, in words (the stand-in shows them; a prompt for an engine's art) */
  scene?: string;
  entities?: WorldEntity[];
  /** the entity the camera follows, by its id */
  follow?: string;
  score?: number;
  status?: WorldStatus;
  /** the input actions the world takes, each with its type (`move: vec2`, `attack: bool`): the design sends only these */
  inputs?: WorldInputDecl[];
};

/** the events a world view sends, by name, with what each carries */
export type WorldEvents = {
  /** something was hit: what, and by what */
  hit: { id: string; by: string };
  /** something was picked up */
  collected: { id: string; kind: string };
  /** the round is over, with the world's score */
  ended: { score: number };
};

export type WorldEventName = keyof WorldEvents;

/** every event a world view sends */
export const WORLD_EVENTS: readonly WorldEventName[] = ["hit", "collected", "ended"];

/** hears each input sent to a world as it is sent: its name, its value, the time (ms on the app's clock) */
export type WorldListener = (action: string, value: WorldInput, at: number) => void;

/** What a host tells a world besides its inputs (docs/世界宿主契约.md): to stand still or go on (`World.requestPause`), which
 *  of the view the HUD covers (`World.occlude`), a pointer that fell through every layer onto it (`World.pointer`). */
export type HostSignal = { pause: boolean } | { occlude: WorldRect[] } | { pointer: WorldPointer };

/** The local channel a world view's inputs come in on: synchronous, through no network and no app state. */
export interface WorldChannel {
  /** hears every input from now on; gives back how to stop */
  listen(fn: WorldListener): () => void;
  /** what each input holds now: the direction last sent, whether a button is held down */
  held(): Record<string, WorldInput>;
  /** hears what the host tells the world from now on (`HostSignal`); a channel that never says anything may leave it out */
  watch?(fn: (signal: HostSignal) => void): () => void;
  /** what the host has told the world so far: whether it is to stand still, what the HUD covers */
  hosted?(): { paused: boolean; occluded: WorldRect[] };
}

/** a rectangle of the view, in its own pixels */
export type WorldRect = { x: number; y: number; w: number; h: number };

/** a touch or a pointer that landed on the world and on no control of the screen */
export type WorldPointer = { kind: "down" | "move" | "up"; x: number; y: number; at: number };

/** The world's own time (docs/世界宿主契约.md “时钟”): `now` in ms of world time, whether it stands still, and how fast it
 *  runs against the app's clock (the domain clock the app's transport gives). A HUD's cooldowns and countdowns of the world
 *  are read off this, never off the device's wall clock. */
export type WorldClock = { now: number; paused: boolean; rate: number };

/** What an engine implements to be hosted in a world view (docs/世界宿主契约.md): mounted on what the host gives it,
 *  told which part of it the HUD covers, sent the input actions with their time and the pointer that fell through, read
 *  for a small snapshot, listened to for its events, and asked for its own clock and to pause. Everything that crosses
 *  is plain JSON (numbers, strings, `Vec2`, ids), so the same interface stands between M3E and any engine; the snapshot
 *  and the events are described by JSON Schema in the world's contract (contract.ts). */
export interface World {
  /** `host` is whatever the host gives its engine to draw on, the host's to define and never assumed to be a DOM node:
   *  a canvas element on the web, a native view's handle on a phone, a Cocos node in a mini-game, nothing for an engine
   *  with no picture of its own (the host then draws `view()`). It starts the world's own loop; `unmount` stops it. */
  mount(host: unknown, size: { w: number; h: number }): void;
  /** the parts of the view the HUD covers */
  occlude(rects: WorldRect[]): void;
  /** an input action, with the time it was made */
  input(action: string, value: WorldInput, at: number): void;
  pointer(e: WorldPointer): void;
  /** the small snapshot the HUD reads */
  view(): WorldState;
  /** told whenever the snapshot changed */
  subscribe(changed: () => void): () => void;
  on<K extends WorldEventName>(event: K, run: (payload: WorldEvents[K]) => void): () => void;
  /** the world's own time */
  clock(): WorldClock;
  /** a world played with others may say no */
  requestPause(paused: boolean): Promise<{ accepted: boolean; reason?: string }>;
  unmount(): void;
}

/** What a world view's slot (`src/custom/slots/<Name>.tsx`, written once) is handed: the world's state from the design,
 *  the size the design gives it, the channel its inputs come in on, a way to send its events (the design's actions on
 *  them run), and the design's stand-in, which it draws until an engine is plugged in (children). */
export type WorldSlotProps<F = unknown> = WorldState & {
  width: number;
  height: number;
  channel: WorldChannel;
  onEvent?: <K extends WorldEventName>(name: K, payload: WorldEvents[K]) => void;
  children?: F;
};
