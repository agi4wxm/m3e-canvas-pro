/* The gameplay contract (docs/玩法契约.md): the file a game loop writes and M3E reads, never writes (the plan's K2: every
 * contract has one author). It says the commands the game takes (their parameters, what each answers, the codes it
 * refuses with), the events it sends, its snapshot as JSON Schema, its clock, and the "facts" it takes from systems
 * other than the player's app. The format is `m3e-game`, version 1; m3e-game.schema.json is its JSON Schema, which the
 * game loop can check its output against. This file reads one: strictly, because the contract is the game loop's and
 * M3E mends nothing in it. A file that is not one says why, and nothing of it is taken. No DOM, no Node. */

import { checkValue } from "../mocks/check";
import type { JsonSchema, JsonSchemaObject } from "../api/types";
import type { WorldInputType } from "../world/types";
import FORMAT_SCHEMA from "./m3e-game.schema.json";

export const GAME_FORMAT = "m3e-game";
export const GAME_FORMAT_VERSION = 1;
/** what a contract file is called: `<anything>.m3e-game.json` */
export const GAME_FILE_SUFFIX = ".m3e-game.json";

/** the format's own JSON Schema (2020-12), as the game loop checks its output against it */
export const GAME_CONTRACT_SCHEMA = FORMAT_SCHEMA as unknown as JsonSchemaObject;

/** what names a namespace, a command, an event, a fact: a small letter, then letters and digits (`pull`, `checkIn`) */
export const GAME_NAME = /^[a-z][a-zA-Z0-9]{0,31}$/;
/** what names a rejection: small letters, digits and hyphens (`insufficient-resources`, `cooldown`) */
export const REJECTION_CODE = /^[a-z][a-z0-9-]{0,47}$/;

/** A code a command is refused with, and how the refusal reads: its HTTP status (409 when left out), its title, and the
 *  problem type (RFC 9457) it answers with, `problemBase` + code when it gives none. */
export type GameRejection = { status?: number; title: string; summary?: string; type?: string };

/** A command the app sends as an interface operation, answered once: what it came to, or a refusal. */
export type GameApiCommand = { via: "api"; summary?: string; params?: JsonSchemaObject; result?: JsonSchema; rejections?: Record<string, GameRejection> };
/** A command the app sends as an input action on the world's own channel, many a second and never answered. */
export type GameInputCommand = { via: "input"; summary?: string; input: WorldInputType };
export type GameCommand = GameApiCommand | GameInputCommand;

/** A command the game loop takes from another system (a payment settled, an operator's grant), never from the app. */
export type GameFact = { summary?: string; from: string; params?: JsonSchemaObject };

/** the game's time: ms of world time, which may stand still and run at a rate against the app's domain clock */
export type GameClock = { unit: "ms"; pausable: boolean; rates: number[] };

export type GameContract = {
  format: typeof GAME_FORMAT;
  version: typeof GAME_FORMAT_VERSION;
  /** the prefix of the operations its commands become (`game` → `game.pull`) */
  namespace: string;
  /** the game loop's own number for this contract (`1.4.0`): what a re-import compares */
  contractVersion: string;
  summary?: string;
  /** what a rejection's problem type starts with; `urn:<namespace>:problem:` when left out */
  problemBase?: string;
  clock: GameClock;
  /** a JSON Schema of what the game's `view()` gives */
  snapshot: JsonSchema;
  events: Record<string, { summary?: string; payload: JsonSchema }>;
  commands: Record<string, GameCommand>;
  facts?: Record<string, GameFact>;
};

/** how much a contract may hold: past this it is refused, not cut */
export const GAME_LIMITS = { nodes: 100_000, depth: 40, text: 1_000_000 };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** how many JSON values a value holds, and how deep, stopping past the limits */
function measure(v: unknown, depth = 0, seen = { nodes: 0, depth: 0 }): typeof seen {
  seen.nodes++;
  seen.depth = Math.max(seen.depth, depth);
  if (seen.nodes > GAME_LIMITS.nodes || depth > GAME_LIMITS.depth) return seen;
  if (Array.isArray(v)) for (const x of v) measure(x, depth + 1, seen);
  else if (isRecord(v)) for (const x of Object.values(v)) measure(x, depth + 1, seen);
  return seen;
}

export type GameRead = { contract: GameContract; problems: [] } | { contract: null; problems: string[] };

/** A gameplay contract read from its file's text or its parsed JSON: the contract, or every reason it is none. */
export function readGameContract(input: unknown): GameRead {
  let value = input;
  if (typeof input === "string") {
    if (input.length > GAME_LIMITS.text) return { contract: null, problems: [`the file is longer than ${GAME_LIMITS.text} characters`] };
    try {
      value = JSON.parse(input);
    } catch {
      return { contract: null, problems: ["the file is not JSON"] };
    }
  }
  if (!isRecord(value)) return { contract: null, problems: ["the file holds no JSON object"] };
  if (value.format !== GAME_FORMAT) return { contract: null, problems: [`format should be "${GAME_FORMAT}"${typeof value.format === "string" ? `, not "${value.format.slice(0, 40)}"` : ""}`] };
  if (value.version !== GAME_FORMAT_VERSION) return { contract: null, problems: [`version ${JSON.stringify(value.version)} is not one this M3E reads (it reads ${GAME_FORMAT_VERSION})`] };
  const size = measure(value);
  if (size.nodes > GAME_LIMITS.nodes || size.depth > GAME_LIMITS.depth) return { contract: null, problems: [`it holds more than ${GAME_LIMITS.nodes} values or nests deeper than ${GAME_LIMITS.depth}`] };
  const problems = checkValue({}, GAME_CONTRACT_SCHEMA, value, { locale: "en" }).map((e) => `${e.pointer.slice(1) || "/"}: ${e.detail}`);
  /* what the checker leaves to the reader: the names of the maps, and a command whose shape is one of two */
  const names = (key: string, re: RegExp, words: string) => {
    if (isRecord(value[key])) for (const n of Object.keys(value[key])) if (!re.test(n)) problems.push(`/${key}: ${JSON.stringify(n.slice(0, 40))} cannot name ${words} (a small letter, then letters and digits)`);
  };
  names("commands", GAME_NAME, "a command");
  names("events", GAME_NAME, "an event");
  names("facts", GAME_NAME, "a fact");
  if (isRecord(value.commands))
    for (const [name, c] of Object.entries(value.commands)) {
      if (!isRecord(c)) continue;
      if (c.via === "input" && GAME_NAME.test(name) && !["vec2", "bool"].includes(c.input as string)) problems.push(`/commands/${name}/input: should be vec2 or bool`);
      if (c.via === "api" && isRecord(c.rejections)) for (const code of Object.keys(c.rejections)) if (!REJECTION_CODE.test(code)) problems.push(`/commands/${name}/rejections: ${JSON.stringify(code.slice(0, 40))} cannot be a code (small letters, digits and hyphens)`);
      if (c.via === "api" && c.params !== undefined && isRecord(c.params) && c.params.type !== undefined && c.params.type !== "object") problems.push(`/commands/${name}/params: should be the schema of an object`);
    }
  if (typeof value.namespace === "string" && !GAME_NAME.test(value.namespace)) problems.push(`/namespace: ${JSON.stringify(value.namespace.slice(0, 40))} cannot be a namespace (a small letter, then letters and digits)`);
  if (problems.length) return { contract: null, problems: [...new Set(problems)].slice(0, 40) };
  /* a copy of plain JSON: nothing the caller holds is shared with what the document keeps */
  return { contract: JSON.parse(JSON.stringify(value)) as GameContract, problems: [] };
}

/** the commands sent as interface operations, by name */
export const apiCommands = (c: GameContract): [string, GameApiCommand][] => Object.entries(c.commands).filter((e): e is [string, GameApiCommand] => e[1].via === "api");
/** the commands sent as input actions, by name */
export const inputCommands = (c: GameContract): [string, GameInputCommand][] => Object.entries(c.commands).filter((e): e is [string, GameInputCommand] => e[1].via === "input");
