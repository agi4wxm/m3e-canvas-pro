/* What a gameplay contract (format.ts) becomes in a document (docs/玩法契约.md):
 *
 * - a command sent `via: "api"` is an interface operation `<namespace>.<name>` (the plan's K2: the `game.*` operations
 *   of the OpenAPI are the game loop's), its parameters the JSON body, its result the 200 answer, each of its rejection
 *   codes an RFC 9457 problem whose `type` the design's `catch` branches on (`when: {expr: "error.type == '…'"}`);
 * - a command sent `via: "input"` is an input action of the world (lib/world: `move: vec2`, `attack: bool`), sent with
 *   `move`, `press` and `release` and never through the API;
 * - its snapshot, events and clock are the world's contract (lib/world/contract.ts `WorldContract`): an imported
 *   contract takes the place of M3E's example engine's;
 * - its rejections are scenarios of the mock library, so the preview can be shown each refusal's design;
 * - its facts are listed and never mapped: a design never sends what only another system may say.
 *
 * The operations it makes carry `x-m3e-game` (written into the exported OpenAPI as it is), which marks them as the
 * contract's: the tools refuse to change one, and importing the contract again replaces them all. */

import { PROBLEM_TYPE, problemModel, problemResponse, PROBLEM_MODEL_NAME } from "../api/defaults";
import type { ApiEndpoint, ApiModel, ApiResponse, JsonSchema } from "../api/types";
import type { MockScenario } from "../mocks/types";
import type { WorldContract } from "../world/contract";
import { apiCommands, inputCommands, type GameApiCommand, type GameContract } from "./format";

/** the OpenAPI extension that marks an operation as a gameplay contract's */
export const GAME_EXTENSION = "x-m3e-game";

/** what `x-m3e-game` says of an operation: whose it is, which version, which command */
export type GameMark = { namespace: string; contractVersion: string; command: string };

/** the operation a command is sent as */
export const gameOperationId = (namespace: string, command: string) => `${namespace}.${command}`;
/** the path a command is sent to, under the API's root; a game loop's own transport may go by the operationId alone */
export const gamePath = (namespace: string, command: string) => `/${namespace}/commands/${command}`;

/** the status a rejection answers with when the contract gives none */
export const REJECTION_STATUS = 409;

/** the problem type a rejection answers with: its own, or the contract's base and the code */
export function rejectionType(c: Pick<GameContract, "namespace" | "problemBase">, code: string, own?: string): string {
  return own ?? `${c.problemBase ?? `urn:${c.namespace}:problem:`}${code}`;
}

/** One way a command is refused, as a design branches on it. */
export type GameRefusal = { operationId: string; command: string; code: string; type: string; status: number; title: string; summary?: string; condition: string };

/** the condition a `catch` holds on for one refusal: the problem's type, quoted as an expression's string */
export const refusalCondition = (type: string) => `error.type == '${type.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** every refusal of a command, in the contract's order */
export function refusalsOf(c: GameContract, command: string, cmd: GameApiCommand): GameRefusal[] {
  return Object.entries(cmd.rejections ?? {}).map(([code, r]) => {
    const type = rejectionType(c, code, r.type);
    return { operationId: gameOperationId(c.namespace, command), command, code, type, status: r.status ?? REJECTION_STATUS, title: r.title, ...(r.summary ? { summary: r.summary } : {}), condition: refusalCondition(type) };
  });
}

/** every refusal of every command */
export const gameRefusals = (c: GameContract): GameRefusal[] => apiCommands(c).flatMap(([name, cmd]) => refusalsOf(c, name, cmd));

const problemOf = (types: string[], status: number): JsonSchema => ({
  type: "object",
  description: "A refusal of the game loop's, as RFC 9457 problem details: its type says which.",
  properties: {
    type: { type: "string", enum: types },
    title: { type: "string" },
    status: { type: "integer", const: status },
    detail: { type: "string" },
  },
  required: ["type", "title", "status"],
});

/** One command as the interface operation it is sent as: a POST of its parameters, its result the 200, each status it
 *  refuses with a problem of the types it says, any other the usual problem. */
export function gameEndpoint(c: GameContract, name: string, cmd: GameApiCommand): ApiEndpoint {
  const refusals = refusalsOf(c, name, cmd);
  const byStatus = new Map<number, GameRefusal[]>();
  for (const r of refusals) byStatus.set(r.status, [...(byStatus.get(r.status) ?? []), r]);
  const responses: Record<string, ApiResponse> = {
    "200": { description: "What the command came to", ...(cmd.result !== undefined ? { content: { "application/json": { schema: cmd.result } } } : {}) },
  };
  for (const [status, list] of [...byStatus].sort((a, b) => a[0] - b[0])) responses[String(status)] = { description: `Refused: ${list.map((r) => `${r.code} (${r.title})`).join("; ")}`, content: { [PROBLEM_TYPE]: { schema: problemOf(list.map((r) => r.type), status) } } };
  responses.default = problemResponse();
  const mark: GameMark = { namespace: c.namespace, contractVersion: c.contractVersion, command: name };
  return {
    operationId: gameOperationId(c.namespace, name),
    method: "post",
    path: gamePath(c.namespace, name),
    ...(cmd.summary ? { summary: cmd.summary } : {}),
    tags: [c.namespace],
    ...(cmd.params ? { requestBody: { required: true, content: { "application/json": { schema: cmd.params } } } } : {}),
    responses,
    extra: { [GAME_EXTENSION]: mark },
  };
}

/** every operation a contract's commands are sent as, in its order */
export const gameEndpoints = (c: GameContract): ApiEndpoint[] => apiCommands(c).map(([name, cmd]) => gameEndpoint(c, name, cmd));

/** the models the operations lean on: the problem details every operation's default answer is */
export const gameModels = (): ApiModel[] => [problemModel()];
export { PROBLEM_MODEL_NAME };

/** what marks an operation as a gameplay contract's, when it is one */
export function gameMarkOf(e: Pick<ApiEndpoint, "extra"> | undefined): GameMark | undefined {
  const m = e?.extra?.[GAME_EXTENSION];
  return m && typeof m === "object" && !Array.isArray(m) && typeof (m as GameMark).command === "string" ? (m as GameMark) : undefined;
}
export const isGameEndpoint = (e: Pick<ApiEndpoint, "extra"> | undefined) => gameMarkOf(e) !== undefined;

/** the input actions the world takes, as a world view's `inputs` declares them (`move: vec2, attack: bool`) */
export const gameInputsText = (c: GameContract) => inputCommands(c).map(([name, cmd]) => `${name}: ${cmd.input}`).join(", ");

/** The contract of the world the design's world views are drawn to, from a gameplay contract: its input commands are
 *  the world's input actions, its snapshot, events and clock are the world's (lib/world/contract.ts). What a game loop
 *  says replaces what M3E's example engine says. */
export function worldContractOf(c: GameContract): WorldContract {
  return {
    version: 1,
    ...(c.summary ? { summary: c.summary } : {}),
    inputs: Object.fromEntries(inputCommands(c).map(([name, cmd]) => [name, { type: cmd.input, ...(cmd.summary ? { summary: cmd.summary } : {}) }])),
    snapshot: c.snapshot,
    events: Object.fromEntries(Object.entries(c.events).map(([name, e]) => [name, { ...(e.summary ? { summary: e.summary } : {}), payload: e.payload }])),
    clock: { unit: c.clock.unit, pausable: c.clock.pausable, rates: [...c.clock.rates] },
  };
}

/** the id of the scenario that shows one refusal */
export const refusalScenarioId = (r: Pick<GameRefusal, "operationId" | "code">) => `${r.operationId}.${r.code}`.slice(0, 64);

/** One scenario of the mock library per refusal: the operation answers with that refusal's problem, so the preview can
 *  be put in it and the design of that refusal looked at. The game loop's words, as it wrote them. */
export const gameScenarios = (c: GameContract): MockScenario[] =>
  gameRefusals(c).map((r) => ({
    id: refusalScenarioId(r),
    name: `${r.operationId}: ${r.title}`,
    description: `The game loop refuses ${r.operationId} with ${r.code}${r.summary ? `: ${r.summary}` : ""}`,
    ops: { [r.operationId]: { status: r.status, body: { type: r.type, title: r.title, status: r.status, ...(r.summary ? { detail: r.summary } : {}) } } },
  }));
