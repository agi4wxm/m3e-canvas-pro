/* The interactions of a design, as one model and one interpreter every host runs (docs/交互规则.md): model.ts is what a
 * tap is, host.ts what the interpreter asks of the app it runs in, run.ts the rules. consistency/ holds the table every
 * host is checked against. */

export * from "./model";
export type { CallArgs, Change, FormRef, GoOptions, Host, Outcome, Tap } from "./host";
export { asBool, asNumber, chooseBranch, coerce, conditionHolds, fillCurrent, run, startOf, tapScope } from "./run";
