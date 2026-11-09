/* The mock library's worlds (docs/模拟库.md “世界脚本”): the scripts a world view with no engine plays (lib/world/
 * script.ts), the contracts their snapshots and events are held to, the scripts the library has of its own, and the
 * check of a script against its contract. The library's scripts are fixtures to design a HUD against: `battle` (twenty
 * enemies with hit points, positions, the hero's skill cooldowns and the damage numbers of the last second, for the
 * battle template's head-top bars and floating numbers) and `meadow` (M3E's example engine's world: the hero walks,
 * picks up the coins, hits the slime, the round ends).
 *
 * A script's picture is a mock file of the document (a picture, or a 3D model: glb, gltf, obj, stl), an address, or one
 * the library makes: `image:<words>` (a picture with those words) and `model:<shape>` (a 3D model: box, sphere, torus,
 * cylinder, gem, or any words as its seed). `resolveWorldScript` turns each into a data URL a stand-in can draw.
 *
 * The editor's own (and the MCP server's): an exported app gets the script it plays already resolved. */

import { EXAMPLE_WORLD_CONTRACT, type WorldContract, type WorldSchema } from "../world/contract";
import { orderedSteps, startScene, applyStep, type WorldScript, type WorldScriptStep } from "../world/script";
import { dataUrl, utf8 } from "./bytes";
import { checkValue, type FieldError } from "./check";
import { svgPicture } from "./formats/svg";
import { glbOf, meshOf, SHAPES } from "./formats/mesh";
import type { MockFile, MockSpec, MockWorldScript } from "./types";

/* ---------- contracts ---------- */

const num = { type: "number" } as const;
const str = { type: "string" } as const;
const pos = { type: "number", minimum: 0, maximum: 100 } as const;
const payload = (props: Record<string, unknown>, required = Object.keys(props)): WorldSchema => ({ type: "object", properties: props, required, additionalProperties: false });

/** The contract of the library's battle world: a hero and enemies with hit points, the hero's skills with their
 *  cooldowns (`readyAt` in world time: a HUD counts down to it off the world's clock), the damage dealt in the last
 *  second (for floating numbers), the wave. What the battle template's HUD is drawn to. */
export const BATTLE_WORLD_CONTRACT: WorldContract = {
  version: 1,
  summary: "The mock library's battle: a hero fights twenty enemies; each hit takes hit points off one, the hero's skills cool down.",
  inputs: {
    move: { type: "vec2", summary: "the way the hero goes" },
    attack: { type: "bool", summary: "the hero's basic attack" },
    skill1: { type: "bool", summary: "a strong blow on one enemy" },
    skill2: { type: "bool", summary: "a blow on the enemies around" },
  },
  snapshot: {
    type: "object",
    properties: {
      entities: {
        type: "array",
        items: payload({ id: str, kind: { type: "string", enum: ["player", "enemy"] }, x: pos, y: pos, label: str, hp: { type: "number", minimum: 0 }, maxHp: { type: "number", minimum: 1 } }, ["id", "kind", "x", "y", "hp", "maxHp"]),
      },
      follow: str,
      score: { type: "number", minimum: 0 },
      status: { type: "string", enum: ["running", "paused", "ended"] },
      wave: { type: "integer", minimum: 1 },
      cooldowns: { type: "object", additionalProperties: payload({ readyAt: { type: "number", minimum: 0 }, total: { type: "number", minimum: 0 } }) },
      hits: { type: "array", items: payload({ id: str, amount: { type: "number", minimum: 0 }, crit: { type: "boolean" }, at: { type: "number", minimum: 0 } }, ["id", "amount", "at"]) },
    },
    required: ["entities", "score", "status"],
    additionalProperties: false,
  },
  events: {
    hit: { summary: "something was hit", payload: payload({ id: str, by: str }) },
    collected: { summary: "something was picked up", payload: payload({ id: str, kind: str }) },
    ended: { summary: "the round is over", payload: payload({ score: num }) },
    damaged: { summary: "an enemy lost hit points", payload: payload({ id: str, amount: num, crit: { type: "boolean" } }, ["id", "amount"]) },
    defeated: { summary: "an enemy has none left", payload: payload({ id: str }) },
  },
  clock: { unit: "ms", pausable: true, rates: [0.5, 1, 2] },
};

/** the contracts a script can name: M3E's example engine's, and the battle's */
export const WORLD_CONTRACTS: Record<string, WorldContract> = { example: EXAMPLE_WORLD_CONTRACT, battle: BATTLE_WORLD_CONTRACT };

/** the contract a script is held to: the one it names, the one it writes out, else the example engine's */
export function contractOf(script: Pick<WorldScript, "contract">): WorldContract | undefined {
  const c = script.contract;
  if (c === undefined) return EXAMPLE_WORLD_CONTRACT;
  if (typeof c === "string") return WORLD_CONTRACTS[c];
  return c && typeof c === "object" && c.version === 1 && c.snapshot !== undefined && c.events && typeof c.events === "object" ? (c as unknown as WorldContract) : undefined;
}

/* ---------- the library's scripts ---------- */

/** a number from a seed, the same every time: 0 ≤ n < 1 */
function seq(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** How many enemies the battle has, and how long its round is. */
export const BATTLE = { enemies: 20, roundMs: 24_000, everyMs: 400, skills: { skill1: 3000, skill2: 6000 } } as const;

/** The library's battle: the hero in the middle, twenty slimes around it in rows, each with its own hit points. Every
 *  0.4 s the hero hits one (`hit` and `damaged`, a critical one now and then), a slime with none left is `defeated` and
 *  goes; every 3 s the hero's first skill strikes harder and cools down, every 8 s its second strikes the ones around;
 *  the slimes creep towards the hero; the last one gone, the round is `ended` and starts over. */
export function battleScript(): MockWorldScript {
  const rnd = seq(20);
  type Foe = { id: string; x: number; y: number; hp: number; maxHp: number };
  const foes: Foe[] = Array.from({ length: BATTLE.enemies }, (_, i) => {
    const maxHp = 40 + Math.round(rnd() * 5) * 10;
    return { id: `e${i + 1}`, x: 12 + (i % 5) * 19, y: 12 + Math.floor(i / 5) * 12, hp: maxHp, maxHp };
  });
  /* where they stand at the start (the loop below moves them) */
  const start = foes.map((f) => ({ ...f }));
  const hero = { id: "hero", kind: "player", x: 50, y: 82, label: "Hero", hp: 100, maxHp: 100 };
  const steps: WorldScriptStep[] = [];
  const hits: { id: string; amount: number; crit: boolean; at: number }[] = [];
  let score = 0;
  let heroHp = hero.hp;
  let wave = 1;
  const cool: Record<string, { readyAt: number; total: number }> = { skill1: { readyAt: 0, total: BATTLE.skills.skill1 }, skill2: { readyAt: 0, total: BATTLE.skills.skill2 } };
  let target = 0;
  for (let at = BATTLE.everyMs; at < BATTLE.roundMs - 2000; at += BATTLE.everyMs) {
    const alive = foes.filter((f) => f.hp > 0);
    if (!alive.length) break;
    const step: WorldScriptStep = { at, entities: [], events: [] };
    const strike = (f: Foe, amount: number, crit: boolean) => {
      const dealt = Math.min(f.hp, amount);
      f.hp -= dealt;
      score += dealt;
      hits.push({ id: f.id, amount: dealt, crit, at });
      step.events!.push({ name: "hit", payload: { id: f.id, by: "hero" } }, { name: "damaged", payload: { id: f.id, amount: dealt, crit } });
      if (f.hp <= 0) {
        step.entities!.push({ id: f.id, gone: true });
        step.events!.push({ name: "defeated", payload: { id: f.id } });
      } else step.entities!.push({ id: f.id, hp: f.hp });
    };
    /* the skills, when they are ready; else the basic attack on the next slime in turn */
    if (at >= cool.skill2.readyAt && alive.length >= 3 && at >= 4000) {
      for (const f of alive.slice(0, 6)) strike(f, 20 + Math.round(rnd() * 8), false);
      cool.skill2 = { readyAt: at + BATTLE.skills.skill2, total: BATTLE.skills.skill2 };
    } else if (at >= cool.skill1.readyAt && at >= 1200) {
      const f = alive[target++ % alive.length];
      strike(f, 40 + Math.round(rnd() * 10), true);
      cool.skill1 = { readyAt: at + BATTLE.skills.skill1, total: BATTLE.skills.skill1 };
    } else {
      const f = alive[target++ % alive.length];
      const crit = rnd() < 0.15;
      strike(f, (crit ? 2 : 1) * (14 + Math.round(rnd() * 12)), crit);
    }
    /* every second the slimes left creep towards the hero, and one of them bites */
    if (at % 1200 === 0) {
      for (const f of foes.filter((x) => x.hp > 0)) {
        f.x = r1(f.x + Math.sign(hero.x - f.x) * Math.min(Math.abs(hero.x - f.x), 1.5));
        f.y = r1(Math.min(70, f.y + 1.2));
        const mine = step.entities!.find((e) => e.id === f.id);
        if (mine) Object.assign(mine, { x: f.x, y: f.y });
        else step.entities!.push({ id: f.id, x: f.x, y: f.y });
      }
      heroHp = Math.max(20, heroHp - (3 + Math.round(rnd() * 4)));
      step.entities!.push({ id: "hero", hp: heroHp });
    }
    const left = foes.filter((f) => f.hp > 0).length;
    if (left <= BATTLE.enemies / 2 && wave === 1) {
      wave = 2;
      step.scene = "Half of the slimes are down; the rest close in";
    }
    if (left <= 3 && wave === 2) {
      wave = 3;
      step.scene = "The last slimes";
    }
    step.set = { score, wave, cooldowns: JSON.parse(JSON.stringify(cool)), hits: hits.filter((h) => h.at > at - 1000) };
    if (!left) {
      step.set.status = "ended";
      step.scene = "Victory: every slime is down";
      step.picture = "model:gem";
      step.events!.push({ name: "ended", payload: { score } });
    }
    steps.push(step);
  }
  return {
    id: "battle",
    name: "Battle: 20 enemies",
    description: "The hero fights twenty slimes: hit points, positions, damage numbers and skill cooldowns change every 0.4 s; the round ends and starts over.",
    contract: "battle",
    start: { entities: [hero, ...start.map((f) => ({ id: f.id, kind: "enemy", x: f.x, y: f.y, label: "Slime", hp: f.maxHp, maxHp: f.maxHp }))], follow: "hero", score: 0, status: "running", wave: 1, cooldowns: { skill1: { readyAt: 0, total: BATTLE.skills.skill1 }, skill2: { readyAt: 0, total: BATTLE.skills.skill2 } }, hits: [] },
    scene: "A ring of twenty slimes around the hero, on a stone floor",
    picture: "image:Battle arena",
    steps,
    loop: BATTLE.roundMs,
  };
}

/** The library's meadow, the example engine's world played as a script: the hero walks right, hits the slime it passes,
 *  picks up the two coins; the round ends and starts over. */
export function meadowScript(): MockWorldScript {
  const steps: WorldScriptStep[] = [];
  for (let i = 1; i <= 8; i++) steps.push({ at: i * 250, entities: [{ id: "hero", x: 20 + i * 5, y: 40 }] });
  steps[1].events = [{ name: "hit", payload: { id: "slime", by: "hero" } }];
  steps[3] = { ...steps[3], entities: [...steps[3].entities!, { id: "coin1", gone: true }], set: { score: 1 }, events: [{ name: "collected", payload: { id: "coin1", kind: "coin" } }] };
  steps[7] = { ...steps[7], entities: [...steps[7].entities!, { id: "coin2", gone: true }], set: { score: 2, status: "ended" }, scene: "Both coins picked up", events: [{ name: "collected", payload: { id: "coin2", kind: "coin" } }, { name: "ended", payload: { score: 2 } }] };
  return {
    id: "meadow",
    name: "Meadow walk",
    description: "M3E's example world played as a script: the hero walks right, hits the slime, picks up both coins, and the round ends.",
    contract: "example",
    start: { entities: [{ id: "hero", kind: "player", x: 20, y: 40, label: "Hero" }, { id: "coin1", kind: "coin", x: 40, y: 40 }, { id: "coin2", kind: "coin", x: 60, y: 40 }, { id: "slime", kind: "enemy", x: 25, y: 52, label: "Slime" }], score: 0, status: "running" },
    scene: "A meadow seen from above",
    picture: "image:Meadow",
    steps,
    loop: 5000,
  };
}

/** the scripts the library has of its own, by id */
export const WORLD_SCRIPT_LIBRARY: readonly string[] = ["battle", "meadow"];

/** a script of the library's own, made afresh (they are plain data a document may copy and change) */
export function libraryWorldScript(id: string): MockWorldScript | undefined {
  return id === "battle" ? battleScript() : id === "meadow" ? meadowScript() : undefined;
}

/** every script a document can play: its own, then the library's it has none of the same id of */
export function worldScriptsOf(mocks: Pick<MockSpec, "worlds"> | undefined): MockWorldScript[] {
  const own = mocks?.worlds ?? [];
  return [...own, ...WORLD_SCRIPT_LIBRARY.filter((id) => !own.some((s) => s.id === id)).map((id) => libraryWorldScript(id)!)];
}

/** a script a document can play, by id */
export const findWorldScript = (mocks: Pick<MockSpec, "worlds"> | undefined, id: string | undefined): MockWorldScript | undefined => (id ? (mocks?.worlds?.find((s) => s.id === id) ?? libraryWorldScript(id)) : undefined);

/* ---------- pictures ---------- */

const URL_LIKE = /^(data:|https?:\/\/|blob:|svg:|m3e-asset:|\/)/;

/** A script's picture as a stand-in draws it: a data URL (a picture, or a 3D model) or an address; undefined when it
 *  names nothing there is. */
export function pictureUrl(picture: string | undefined, files: readonly MockFile[] = []): string | undefined {
  if (!picture) return undefined;
  if (URL_LIKE.test(picture)) return picture;
  const file = files.find((f) => f.id === picture);
  if (file) return file.data;
  const made = /^(image|model):([^]+)$/.exec(picture);
  if (!made) return undefined;
  const words = made[2].trim().slice(0, 120);
  if (made[1] === "image") return dataUrl("image/svg+xml", utf8(svgPicture({ seed: `world:${words}`, title: words, w: 640, h: 400 })));
  const shape = (SHAPES as readonly string[]).includes(words) ? (words as (typeof SHAPES)[number]) : undefined;
  return dataUrl("model/gltf-binary", glbOf(meshOf(`world:${words}`, words, 0.6, shape)));
}

/** A script with each picture made a data URL or an address, ready for a stand-in, an exported app or a screenshot. */
export function resolveWorldScript(script: WorldScript, files: readonly MockFile[] = []): WorldScript {
  const memo = new Map<string, string>();
  const at = (p: string | undefined) => {
    if (p === undefined || p === "") return p;
    if (!memo.has(p)) memo.set(p, pictureUrl(p, files) ?? "");
    return memo.get(p);
  };
  return { ...script, ...(script.picture !== undefined ? { picture: at(script.picture) } : {}), steps: script.steps.map((s) => (s.picture !== undefined ? { ...s, picture: at(s.picture) } : s)) };
}

/* ---------- the check ---------- */

/** a problem of a script: where (a JSON Pointer from the script) and what */
export type WorldScriptProblem = FieldError;

/** Everything wrong with a script against its contract: the snapshot at its start and after each step held to the
 *  contract's schema, each event's name and payload to the contract's events, the entities a step changes there to be
 *  changed (or brought in whole), each picture something there is. Empty when it plays as its contract says. */
export function checkWorldScript(script: WorldScript, o: { files?: readonly MockFile[]; base?: Record<string, unknown> } = {}): WorldScriptProblem[] {
  const out: WorldScriptProblem[] = [];
  const contract = contractOf(script);
  if (!contract) return [{ pointer: "#/contract", detail: typeof script.contract === "string" ? `there is no world contract ${JSON.stringify(script.contract)} (the library has ${Object.keys(WORLD_CONTRACTS).join(", ")})` : "is no world contract (version 1, inputs, snapshot, events, clock)" }];
  const api = {};
  /* a snapshot that is wrong stays wrong until a step mends it: said at the step that made it so */
  const wrong = new Set<string>();
  const check = (schema: WorldSchema, value: unknown, at: string, snapshot = false) => {
    const now = new Set<string>();
    for (const e of checkValue(api, schema as never, value, { locale: "en", direction: "response" })) {
      if (!snapshot) {
        out.push({ pointer: `${at}${e.pointer.slice(1)}`, detail: e.detail });
        continue;
      }
      const words = `${e.pointer.slice(1) || "/"} ${e.detail}`;
      now.add(words);
      if (!wrong.has(words)) out.push({ pointer: at, detail: `makes a snapshot the contract refuses: ${words}` });
    }
    if (snapshot) {
      wrong.clear();
      for (const w of now) wrong.add(w);
    }
  };
  const picture = (p: string | undefined, at: string) => {
    if (p && pictureUrl(p, o.files) === undefined) out.push({ pointer: at, detail: `names no mock file, address or made picture (${JSON.stringify(p)}): a file's id, image:<words> or model:<shape>` });
  };
  const scene = startScene(script, o.base);
  check(contract.snapshot, scene.snapshot, "#/start", true);
  picture(script.picture, "#/picture");
  const order = orderedSteps(script);
  const index = new Map(order.map((s) => [s, script.steps.indexOf(s)]));
  if (typeof script.loop === "number" && order.some((s) => s.at >= script.loop!)) out.push({ pointer: "#/loop", detail: "comes before some of the steps, which never play" });
  for (const step of order) {
    const at = `#/steps/${index.get(step) ?? 0}`;
    const ids = new Set(((scene.snapshot.entities as { id?: unknown }[] | undefined) ?? []).map((e) => String(e?.id)));
    for (const [i, e] of (step.entities ?? []).entries()) if (e.gone && !ids.has(e.id)) out.push({ pointer: `${at}/entities/${i}`, detail: `takes away ${JSON.stringify(e.id)}, which is not there then` });
    for (const [i, e] of (step.events ?? []).entries()) {
      const declared = contract.events[e.name];
      if (!declared) out.push({ pointer: `${at}/events/${i}/name`, detail: `is no event of the contract (its events are ${Object.keys(contract.events).join(", ")})` });
      else check(declared.payload, e.payload ?? {}, `${at}/events/${i}/payload`);
    }
    picture(step.picture, `${at}/picture`);
    applyStep(scene, step);
    check(contract.snapshot, scene.snapshot, at, true);
    if (out.length >= 50) break;
  }
  return out.slice(0, 50);
}
