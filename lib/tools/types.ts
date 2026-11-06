/* What a tool is: one typed thing a model (the in-app agent) or a client (an MCP server) may do with a document, with
 * its input as JSON Schema, a description written for the model, and whether it only reads or can take something
 * away. Every tool works on a `DocStore` (lib/core/store.ts), so it runs the same in the editor, in Node and in tests. */

import type { CoreState, DocStore, HistoryMode, OpErrorCode, Origin, Schema } from "../core";
import type { AiSettings } from "../ai";
import type { Adapter } from "../llm/types";
import type { Pixels } from "./pixels";

/** the subsets a client can be given: reading, building, styling, data and behaviour, and drawing with a model */
export type ToolGroup = "read" | "edit" | "style" | "data" | "generate";

export const TOOL_GROUPS: readonly ToolGroup[] = ["read", "edit", "style", "data", "generate"];

/** what went wrong, in a form a model can act on: a code, what happened, and what to do about it */
export type ToolErrorCode = OpErrorCode | "unknown_tool" | "unavailable" | "aborted" | "failed";
export type ToolError = { code: ToolErrorCode; message: string; hint?: string; about?: string };

/** what a call gave back: a JSON-safe result (and pictures, as data URLs), or an error */
export type ToolOutcome = { ok: true; result: unknown; images?: string[] } | { ok: false; error: ToolError };

/** what a tool's own `run` returns */
export type ToolReturn = { result: unknown; images?: string[] };

/** Pictures of what the document looks like. The editor draws a screen offscreen (src/editor/useScreenshots.ts); the
 *  MCP server's file backend will draw it in headless Chromium. */
export interface Renderer {
  /** a screen, or one part cut out of its screen, as a PNG data URL; `scale` 1 is one pixel per dp */
  screenshot(id: string, o?: { scale?: number; signal?: AbortSignal }): Promise<string>;
}

/** What the generative tools draw with: the author's settings (keys stay in the browser, or in the MCP server's
 *  environment), an adapter of the text model for SVG written as code, and a fetch to send it through. */
export type GenerateEnv = {
  settings: AiSettings;
  adapter?: Adapter;
  fetch?: typeof fetch;
  /** how many drawings the caller still allows (a turn's budget); undefined is no limit */
  budget?: { left: number };
  /** Draws somewhere else and hands back only what was drawn: an editor tab paired with the MCP server asks the
   *  server, which holds the key. `settings` and `adapter` are then not read. */
  remote?: RemoteDrawing;
};

/** A picture the author handed over with a request (a screenshot to copy, a mood board): named by its id ("ref1")
 *  in what the model is told, so a tool can be pointed at it. */
export type Attachment = { id: string; dataUrl: string; name?: string; w?: number; h?: number };

/** an SVG drawn for the vector atom: its markup, ready for the canvas, and how it was made */
export type SvgDrawing = { markup: string; route: "image" | "code"; warnings: string[]; ms: number };

/** what the generative tools ask of whoever draws for them (generate.ts `drawSvg`, `paintPicture`) */
export interface RemoteDrawing {
  /** the generate_svg arguments that say what to draw */
  svg(args: Record<string, unknown>, signal?: AbortSignal): Promise<SvgDrawing>;
  /** a picture for a box of this size, as a data URL */
  image(args: { prompt: string; box: { w: number; h: number } }, signal?: AbortSignal): Promise<string>;
}

/** what a tool runs with */
export type ToolEnv = {
  store: DocStore;
  origin: Origin;
  /** how each change is kept in the history (the in-app agent runs its turn as one step: `none`) */
  history?: HistoryMode;
  /** told after a call changed the document, with the state it changed from */
  onWrite?: (prev: CoreState) => void;
  renderer?: Renderer;
  signal?: AbortSignal;
  gen?: GenerateEnv;
  /** the pictures the author attached in this conversation */
  attachments?: Attachment[];
  /** decodes a picture to pixels (lib/tools/pixels.ts `readPixels` when left out) */
  pixels?: (dataUrl: string) => Promise<Pixels>;
};

export type Tool<A = Record<string, unknown>> = {
  name: string;
  group: ToolGroup;
  /** for the model: what it does, when to use it, and what it gives back */
  description: string;
  /** a JSON Schema object */
  input: Schema;
  /** what the result holds, in words */
  output?: string;
  /** reads and never changes the document */
  readOnly: boolean;
  /** takes away something the author made (a client asks the author before such a call) */
  destructive: boolean;
  run(args: A, env: ToolEnv): ToolReturn | Promise<ToolReturn>;
};

/** defines a tool; the identity function, for its types */
export const tool = <A>(t: Tool<A>): Tool<A> => t;

/** a tool's error, thrown from its `run` */
export class ToolFailure extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "ToolFailure";
  }
}
