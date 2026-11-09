/* Spawned on events (docs/交互规则.md “按事件生成”, docs/游戏阶段整改计划.md H4): a template drawn once per event rather
 * than once per row. A group that says `spawn` is the template; a `spawn` effect (on a world view's `on:hit`, a
 * subscription's `on:message`, any action) makes an instance of it. An instance reads what its step read (`event.*`
 * above all), fixed as it is spawned; it lives `life` seconds of the app's clock (the domain clock: the back end's, the
 * mocks' in a preview, which may stand still or run faster), so a paused clock keeps it on show; at most `max` live at
 * once, and one more takes the place of the oldest still alive. Each host draws a template's instances from a pool of
 * `max` copies it lays out once, filled and shown by no state of the app's (the preview's and the web apps' copies are
 * the page's own nodes, lib/spawnDom.ts): a spawn is no React commit.
 *
 * This file is the rules every host shares: the pool (which place an instance takes, which gives way, which are alive
 * at a time), what an instance's words come to, and how far along its life it is. Plain TypeScript, importing only the
 * expressions, so it goes into an exported app's runtime as it is (as lib/actions and lib/world do). The way it is
 * written follows the repeat over data (lib/collections.ts): a template, copies of it each reading a scope of its own;
 * here the copies come and go with time instead of with rows. */

import { evaluate, fillTemplate, type EvalContext, type Scope } from "./bindings/expr";

/** how an instance moves over its life: rising as it fades (a damage number), fading where it stands, or neither */
export type SpawnMotion = "float" | "fade" | "none";

/** What a template says of its instances (`Group.spawn`): how long each lives (seconds of the app's clock), how many may
 *  live at once, where it goes (`at`, an expression read at its step: the id of the entity it stands over, which a host
 *  that anchors to the world places it by; nothing places it yet but the template's own place), how it moves. */
export type SpawnSpec = { life: number; max: number; at?: string; motion?: SpawnMotion };

/** the bounds of a template's numbers: a life of a tenth of a second to a minute, one to fifty alive at once */
export const SPAWN_LIMITS = { life: { min: 0.1, max: 60 }, max: { min: 1, max: 50 } } as const;
/** what a template says when it says nothing of them */
export const SPAWN_DEFAULTS = { life: 1, max: 8, motion: "none" as SpawnMotion };
export const SPAWN_MOTIONS: readonly SpawnMotion[] = ["float", "fade", "none"];

/** how far a floating instance rises over its life, in pixels */
export const FLOAT_RISE = 32;

/** A template's numbers kept to their bounds, a field of the wrong kind left to its default: what every host reads. */
export function spawnSpecOf(raw: unknown): SpawnSpec | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, d: number, b: { min: number; max: number }) => (typeof v === "number" && Number.isFinite(v) ? Math.min(b.max, Math.max(b.min, v)) : d);
  const motion = SPAWN_MOTIONS.includes(r.motion as SpawnMotion) ? (r.motion as SpawnMotion) : undefined;
  return {
    life: num(r.life, SPAWN_DEFAULTS.life, SPAWN_LIMITS.life),
    max: Math.round(num(r.max, SPAWN_DEFAULTS.max, SPAWN_LIMITS.max)),
    ...(typeof r.at === "string" && r.at.trim() ? { at: r.at.trim() } : {}),
    ...(motion ? { motion } : {}),
  };
}

/** One instance: its serial (the order instances were spawned in, across every template), the place of its template's
 *  pool it is drawn in, when it was spawned and when it is gone (ms of the app's clock), what its words read, and the
 *  entity it stands over (`at`, when its template says one). */
export type Spawned = { serial: number; slot: number; born: number; ends: number; scope: Scope; at?: string };

/** What a host keeps of its templates' instances. Plain data and functions of the clock: what is alive is read at a
 *  time (`live`), so a host needs no timer of its own for an instance to go, and a paused clock keeps it. */
export type Spawns = {
  /** a new instance of the template `group`, spawned at `now` (ms of the app's clock) with what its step read; the oldest
   *  alive gives way when `max` are */
  spawn(group: string, spec: SpawnSpec, scope: Scope, now: number, ctx?: EvalContext): Spawned;
  /** the instances of a template alive at `now`, oldest first */
  live(group: string, now: number): Spawned[];
  /** the templates that have spawned anything */
  groups(): string[];
  /** forgets every instance (the app started over) */
  clear(): void;
  /** told after every spawn and clear; gives back how to stop */
  subscribe(fn: () => void): () => void;
};

const alive = (s: Spawned, now: number) => now < s.ends;

/** a host's instances, for every template it has */
export function createSpawns(): Spawns {
  const pools = new Map<string, Spawned[]>();
  const told = new Set<() => void>();
  let serial = 0;
  const tell = () => [...told].forEach((fn) => fn());
  return {
    spawn(group, spec, scope, now, ctx) {
      const s = spawnSpecOf(spec) ?? { life: SPAWN_DEFAULTS.life, max: SPAWN_DEFAULTS.max };
      /* what is gone by now has given its place back */
      const list = (pools.get(group) ?? []).filter((x) => alive(x, now));
      /* full: the oldest alive gives way, and the new one is drawn where it was */
      const gone = list.length >= s.max ? list.splice(0, list.length - s.max + 1) : [];
      const taken = new Set(list.map((x) => x.slot));
      let slot = gone.length ? gone[gone.length - 1].slot : 0;
      if (!gone.length) while (taken.has(slot)) slot++;
      const at = s.at ? evaluate(s.at, scope, ctx) : undefined;
      const made: Spawned = { serial: ++serial, slot, born: now, ends: now + s.life * 1000, scope, ...(at !== undefined && at !== null && at !== "" ? { at: String(at) } : {}) };
      list.push(made);
      pools.set(group, list);
      tell();
      return made;
    },
    live: (group, now) => (pools.get(group) ?? []).filter((x) => alive(x, now)),
    groups: () => [...pools.keys()],
    clear() {
      pools.clear();
      tell();
    },
    subscribe(fn) {
      told.add(fn);
      return () => void told.delete(fn);
    },
  };
}

/* An instance's words: every `{{expression}}` of its template is read once, as it is spawned, in what its step read.
 * The copies a host lays out ahead of time cannot hold the expressions as they are written (whatever draws them would
 * read them in its own scope, where `event` is nothing), so they hold them marked (`⟦event.amount⟧`), and what fills an
 * instance reads the marks. */

/** where an expression of a template's words starts and ends, as its copies are drawn before any instance is */
export const SPAWN_MARK = ["⟦", "⟧"] as const;
const TOKEN = /\{\{([^{}]*)\}\}/g;
const MARKED = /⟦([^⟦⟧]*)⟧/g;

/** a template's words as its copies are drawn: each `{{expression}}` marked, read once an instance is spawned */
export const markSpawnWords = (text: string): string => (text.includes("{{") ? text.replace(TOKEN, (_, inner: string) => `${SPAWN_MARK[0]}${inner}${SPAWN_MARK[1]}`) : text);

/** whether words drawn for a template's copy hold what an instance fills */
export const hasSpawnMarks = (text: string): boolean => text.includes(SPAWN_MARK[0]);

/** a copy's marked words as an instance fills them: each mark read in the instance's scope */
export const fillSpawnWords = (text: string, s: Pick<Spawned, "scope">, ctx?: EvalContext): string =>
  hasSpawnMarks(text) ? text.replace(MARKED, (_, inner: string) => fillTemplate(`{{${inner}}}`, s.scope, ctx)) : text;

/** a template's words as written (`-{{event.amount}}`), as an instance shows them */
export const spawnedWords = (text: string, s: Pick<Spawned, "scope">, ctx?: EvalContext): string => fillSpawnWords(markSpawnWords(text), s, ctx);

/** how far along its life an instance is at `now`, from 0 (just spawned) to 1 (gone) */
export const spawnProgress = (s: Pick<Spawned, "born" | "ends">, now: number): number => (s.ends <= s.born ? 1 : Math.min(1, Math.max(0, (now - s.born) / (s.ends - s.born))));

/** How an instance is drawn at a point of its life: how opaque, how far it has risen (px). A floating one rises the
 *  whole way and a fading one stays; both fade over the last two fifths of their life. */
export function spawnLook(motion: SpawnMotion | undefined, progress: number): { opacity: number; rise: number } {
  if (!motion || motion === "none") return { opacity: 1, rise: 0 };
  const opacity = progress < 0.6 ? 1 : Math.max(0, 1 - (progress - 0.6) / 0.4);
  return { opacity: Math.round(opacity * 1000) / 1000, rise: motion === "float" ? Math.round(FLOAT_RISE * progress * 100) / 100 : 0 };
}

/** Where a host anchors an instance (the hook a host that projects the world's entities fills, docs/游戏阶段整改计划.md
 *  H3): the offset from the template's place, in px, for the entity it stands over; nothing leaves it at the template's
 *  place. */
export type SpawnPlace = (at: string, s: Spawned) => { x: number; y: number } | undefined;
