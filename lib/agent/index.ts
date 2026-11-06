/* The in-app agent: a turn runner on lib/llm's agent loop and lib/tools, what it is told, and what a turn changed.
 * The editor's side is src/editor/useAgent.ts. */

export { runTurn, agentSetup, type TurnEvent, type TurnOptions, type TurnResult } from "./turn";
export { agentSystem, turnContext, LANG_NAME } from "./prompt";
export { diffDocs, isEmptyDiff, touchedScreens, type DocDiff, type Named } from "./diff";
