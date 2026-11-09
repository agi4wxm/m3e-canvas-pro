/* A world script (docs/模拟库.md “世界脚本”, docs/世界宿主契约.md): what a mock world does, written down as a timeline,
 * for a world view with no engine behind it. It starts from a snapshot of the world (or from the design's own state)
 * and, at each step, lays fields over the snapshot, moves, changes, brings in or takes away entities, changes the words
 * and the picture that say what the scene is, and sends events. A world played from it (scripted.ts) runs its time off
 * the app's domain clock, so it stands still when the mocks' clock does and runs faster at its rate; what it shows at a
 * time is a function of the script and that time alone (`sceneAt`), so a screenshot can take the scene at any moment.
 *
 * The snapshots and the events a script makes are held to a world's contract (contract.ts: JSON Schemas): the mock
 * library checks them (lib/mocks/world.ts). The shape is kept open: a game loop's fixture (one known state, the plan's
 * batch 7) is a script with a start and no steps; a recording of a session is one with many.
 *
 * Plain data and functions with no imports, so it goes as it is into an exported app's runtime and its mocks. */

/** an event the world sends at a step: its name in the world's contract, and what it carries */
export type WorldScriptEvent = { name: string; payload?: unknown };

/** An entity changed at a step, by its id: its other fields are laid over the entity of that id (one not there yet comes
 *  in, at the end); `gone: true` takes it away. */
export type WorldScriptEntity = { id: string; gone?: boolean; [field: string]: unknown };

/** One moment of a script: when (ms of world time from the start) and what changes then. */
export type WorldScriptStep = {
  at: number;
  /** fields of the snapshot laid over it (score, status, follow, or any field the world's contract names: cooldowns…);
   *  `null` takes a field away */
  set?: Record<string, unknown>;
  /** the entities that change */
  entities?: WorldScriptEntity[];
  /** what the picture is now, in words (the stand-in shows them over the picture) */
  scene?: string;
  /** the picture now: a mock file's id (a picture, or a 3D model: glb, gltf, obj, stl) or an address; "" takes it away */
  picture?: string;
  /** the events the world sends at this moment, in order */
  events?: WorldScriptEvent[];
};

/** A mock world's timeline. */
export type WorldScript = {
  /** a short identifier: battle, meadow, boss-fight */
  id: string;
  name: string;
  description?: string;
  /** The contract its snapshots and events are held to: a contract the mock library knows by name ("example": M3E's
   *  example engine's, "battle"), or one written out (a WorldContract as JSON). The example engine's when left out. */
  contract?: string | Record<string, unknown>;
  /** the snapshot it starts from, over the design's own state (the world view's entities, score, status) */
  start?: Record<string, unknown>;
  /** what the picture is at the start, in words */
  scene?: string;
  /** the picture at the start: a mock file's id or an address */
  picture?: string;
  steps: WorldScriptStep[];
  /** ms of world time after which it starts over (a new round: its time back to 0); it plays once when left out */
  loop?: number;
  /** the world views it plays on, by item id; every one when left out */
  views?: string[];
};

/** an event as it was sent: at what world time (within the round), which, with what */
export type WorldScriptFired = { at: number; name: string; payload: unknown };

/** What a script shows at a moment: the world's snapshot, the words and the picture of the scene. */
export type WorldScene = { snapshot: Record<string, unknown>; scene?: string; picture?: string };

/** the most steps a script plays */
export const MAX_SCRIPT_STEPS = 5000;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const copy = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** the steps in the order they play: by time, those at the same time as they are written */
export function orderedSteps(script: Pick<WorldScript, "steps">): WorldScriptStep[] {
  const steps = Array.isArray(script.steps) ? script.steps.slice(0, MAX_SCRIPT_STEPS) : [];
  return steps
    .map((s, i) => ({ s, i, at: typeof s?.at === "number" && Number.isFinite(s.at) ? Math.max(0, s.at) : 0 }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map((x) => (x.s.at === x.at ? x.s : { ...x.s, at: x.at }));
}

/** how long a round of the script is: its loop, else the time of its last step */
export function scriptLength(script: Pick<WorldScript, "steps" | "loop">): number {
  if (typeof script.loop === "number" && script.loop > 0) return script.loop;
  const steps = orderedSteps(script);
  return steps.length ? steps[steps.length - 1].at : 0;
}

/** where a round is at a world time: within the loop when the script loops */
export function roundTime(script: Pick<WorldScript, "steps" | "loop">, t: number): number {
  const time = Number.isFinite(t) ? Math.max(0, t) : 0;
  return typeof script.loop === "number" && script.loop > 0 ? time % script.loop : time;
}

/** the scene the script starts from: its start laid over the design's state */
export function startScene(script: WorldScript, base: Record<string, unknown> = {}): WorldScene {
  const snapshot = { ...copy(base), ...copy(isObj(script.start) ? script.start : {}) };
  if (!Array.isArray(snapshot.entities)) snapshot.entities = [];
  return { snapshot, ...(typeof script.scene === "string" ? { scene: script.scene } : {}), ...(typeof script.picture === "string" ? { picture: script.picture } : {}) };
}

/** One step played onto a scene, in place: what it sets, the entities it changes, its words and its picture. */
export function applyStep(scene: WorldScene, step: WorldScriptStep): void {
  const snap = scene.snapshot;
  if (isObj(step.set)) for (const [k, v] of Object.entries(step.set)) if (v === null) delete snap[k];
  else snap[k] = copy(v);
  if (Array.isArray(step.entities) && step.entities.length) {
    const list = (Array.isArray(snap.entities) ? snap.entities : []).filter(isObj) as Record<string, unknown>[];
    const byId = new Map(list.map((e, i) => [String(e.id), i]));
    let out = list.slice();
    const gone = new Set<string>();
    for (const change of step.entities) {
      if (!isObj(change) || typeof change.id !== "string") continue;
      if (change.gone) {
        gone.add(change.id);
        continue;
      }
      gone.delete(change.id);
      const { gone: _g, ...fields } = change;
      const at = byId.get(change.id);
      if (at === undefined) {
        byId.set(change.id, out.length);
        out.push(copy(fields));
      } else out[at] = { ...out[at], ...copy(fields) };
    }
    if (gone.size) out = out.filter((e) => !gone.has(String(e.id)));
    snap.entities = out;
  }
  if (typeof step.scene === "string") scene.scene = step.scene;
  if (typeof step.picture === "string") {
    if (step.picture) scene.picture = step.picture;
    else delete scene.picture;
  }
}

/** What the script shows at a world time (within its round when it loops), from the design's state `base`. */
export function sceneAt(script: WorldScript, t: number, base?: Record<string, unknown>): WorldScene {
  const time = roundTime(script, t);
  const scene = startScene(script, base);
  for (const step of orderedSteps(script)) {
    if (step.at > time) break;
    applyStep(scene, step);
  }
  return scene;
}

/** The events a round sends after `from` and up to `to` (ms of round time), in order; those at 0 come with `from` < 0. */
export function eventsBetween(script: WorldScript, from: number, to: number): WorldScriptFired[] {
  const out: WorldScriptFired[] = [];
  for (const step of orderedSteps(script)) {
    if (step.at > to) break;
    if (step.at <= from) continue;
    for (const e of Array.isArray(step.events) ? step.events : []) if (isObj(e) && typeof e.name === "string") out.push({ at: step.at, name: e.name, payload: copy(e.payload ?? {}) });
  }
  return out;
}

/** whether a script plays on a world view, by its item id */
export const playsOn = (script: Pick<WorldScript, "views">, part: string | undefined): boolean => !Array.isArray(script.views) || !script.views.length || (part !== undefined && script.views.includes(part));
