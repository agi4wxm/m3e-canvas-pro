/* What an exported mini-program tells the kit about itself (src/generated/app.ts writes it from the design): its screens
 * (each a page), the variables, the calls a tap can make and the sign-in. And what a tap is, as the design has it: the
 * same plain data as the editor's `Action` (lib/tokens.ts), printed into the screens as constants and run by the
 * screen's runtime (./screen.tsx), as the editor's preview runs it (lib/interact.ts). */

export type VarValue = string | number | boolean;
export type VarType = "text" | "number" | "bool" | "color";

/** a condition as the design writes it (lib/actions/model.ts): an expression, or an input that holds something */
export type Condition = { filled: string } | { expr: string };

export type Optimistic = { source: string; remove?: boolean; patch?: Record<string, string> };

export type Effect =
  | { do: "show" | "hide" | "toggle" | "open" | "close"; part: string }
  | { do: "setVar"; var: string; value: VarValue; expr?: string }
  | { do: "toggleVar"; var: string }
  | { do: "addVar"; var: string; by: number }
  | { do: "setProp"; part: string; prop: string; value: VarValue }
  | { do: "snackbar"; message: string }
  | { do: "call"; operationId: string; args?: Record<string, string>; body?: string; then?: Answer; catch?: Answer; optimistic?: Optimistic }
  | { do: "invoke"; capability: string; args?: Record<string, string>; then?: Answer; catch?: Answer }
  | { do: "refresh"; source: string }
  | { do: "loadMore"; source: string }
  | { do: "submit"; form?: string }
  | { do: "signOut" };

/** where a tap goes once its effects have run: a screen's key, "back", "link", or "none" */
export type ActionBody = { to: string; transition?: string; url?: string; effects?: Effect[]; overlay?: boolean; scrollTo?: string; params?: Record<string, string>; motion?: { kind: string; dir?: string; easing?: string; ms?: number } };

export type Action = ActionBody & { when?: Condition; else?: ActionBody };
/** what runs when a call or an invoke is answered: a body that may branch on the answer (docs/交互规则.md, 回答上的条件) */
export type Answer = ActionBody & { when?: Condition; else?: ActionBody };

export type ParamSpec = { name: string; type?: string; example?: unknown };

export type ScreenSpec = {
  /** its page, from the source folder: "pages/products/index" */
  path: string;
  params?: ParamSpec[];
  /** "required": only with a session; "login": the sign-in screen */
  auth?: "required" | "login";
  /** its place in the tab bar, when the app has one and the screen is one of its tabs */
  tab?: number;
};

export type VarSpec = { id: string; name: string; type: VarType; value: VarValue };

/** One call a tap makes: the operation's arguments by name (its path and query parameters, the rest as fields of its
 *  JSON body) and the whole body when the tap gives one. The generated client's typed function sits behind it. */
export type CallFn = (args: Record<string, unknown>, body: unknown, init?: { signal?: { readonly aborted: boolean }; onUploadProgress?: (sent: number, total: number) => void }) => Promise<unknown>;

export type AppSpec = {
  screens: Record<string, ScreenSpec>;
  /** the screen the app opens on */
  start: string;
  vars: VarSpec[];
  calls: Record<string, CallFn>;
  /** the status each operation answers with when it goes well (the client gives only the body) */
  status: Record<string, number>;
  /** the operation that signs in, whose form's success returns to where the app was sent from */
  login?: string;
};
