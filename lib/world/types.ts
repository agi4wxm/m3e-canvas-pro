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

/** What a world view is handed from the design: the world's state it shows (bindable to data), and the input actions the
 *  world says it takes. */
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
  /** the input actions the world takes (`move`, `attack`…): the design sends only these */
  inputs?: string[];
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

/** The local channel a world view's inputs come in on: synchronous, through no network and no app state. */
export interface WorldChannel {
  /** hears every input from now on; gives back how to stop */
  listen(fn: WorldListener): () => void;
  /** what each input holds now: the direction last sent, whether a button is held down */
  held(): Record<string, WorldInput>;
}

/** a rectangle of the view, in its own pixels */
export type WorldRect = { x: number; y: number; w: number; h: number };

/** a touch or a pointer that landed on the world and on no control of the screen */
export type WorldPointer = { kind: "down" | "move" | "up"; x: number; y: number; at: number };

/** What an engine implements to be hosted in a world view (docs/边界与契约.md): mounted on what the platform gives it,
 *  told which part of it the HUD covers, sent the input actions with their time and the pointer that fell through, read
 *  for a small snapshot, listened to for its events, and asked for its own clock and to pause. */
export interface World {
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
  clock(): { now: number; paused: boolean };
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
