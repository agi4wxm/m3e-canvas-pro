/* src/generated/types.ts of the server: the contract's models as TypeScript (schemaToTs), and per operation what its
 * handler is given and answers (Operations), per realtime channel what goes over it (Channels). Names of the export's
 * own are chosen apart from the models' names, so a model may be called anything; the names of parameters, fields and
 * messages are keys in quotes, so no word of the contract is ever a name in the code. */

import { freeName } from "../../api/clean";
import { isRecord, mapRefs } from "../../api/schema";
import { schemaToTs, schemaTypeTs } from "../../api/typescript";
import { refModel, type JsonSchema } from "../../api/types";
import { GENERATED, str } from "../code";
import type { ServerContract, ServerOperation, ServerParam, ServerResponse } from "./contract";
import { Examples } from "./examples";

export type TypeNames = { file: string; fileReply: string; cursorPage: string; offsetPage: string; operations: string; channels: string };

/** the names types.ts declares besides the models', none of them a model's */
export function typeNames(c: ServerContract): TypeNames {
  const taken = new Set((c.spec.models ?? []).map((m) => m.name));
  const pick = (name: string) => {
    const n = freeName(name, taken);
    taken.add(n);
    return n;
  };
  return { file: pick("UploadedFile"), fileReply: pick("FileReply"), cursorPage: pick("CursorPage"), offsetPage: pick("OffsetPage"), operations: pick("Operations"), channels: pick("Channels") };
}

const EMPTY = "Record<never, never>";

export class TypePrinter {
  private readonly models: Set<string>;
  readonly examples: Examples;

  constructor(
    private readonly c: ServerContract,
    readonly names: TypeNames,
  ) {
    this.models = new Set((c.spec.models ?? []).map((m) => m.name));
    this.examples = new Examples(c.spec);
  }

  /** a schema as a type: references to models by name, a reference to anything else `unknown` */
  ts(schema: JsonSchema | undefined, indent = "    "): string {
    if (schema === undefined) return "unknown";
    const known = mapRefs(schema, (ref) => {
      const m = refModel(ref);
      return m !== undefined && this.models.has(m) ? ref : null;
    });
    return schemaTypeTs(known, { comments: false, binary: this.names.file }, indent);
  }

  private object(params: ServerParam[], key: (p: ServerParam) => string, optional: (p: ServerParam) => boolean): string {
    if (!params.length) return EMPTY;
    return `{ ${params.map((p) => `${str(key(p))}${optional(p) ? "?" : ""}: ${this.ts(p.schema, "      ")}`).join("; ")} }`;
  }

  /** what a response holds, as a type */
  answer(r: ServerResponse | undefined, none: string): string {
    if (!r) return "unknown";
    if (r.kind === "none") return none;
    if (r.kind === "file") return this.names.fileReply;
    if (r.kind === "text") return "string";
    return this.ts(r.schema);
  }

  /** the type of the items of a paged answer, read off its schema */
  private itemType(s: ServerOperation): string {
    const p = s.pagination;
    const top = this.examples.resolve(s.success?.schema);
    const field = p && isRecord(top) && isRecord(top.properties) ? top.properties[p.items] : undefined;
    const items = isRecord(field) ? (this.examples.resolve(field as JsonSchema) as Record<string, unknown> | undefined)?.items : undefined;
    return items === undefined ? "unknown" : this.ts(items as JsonSchema, "      ");
  }

  operation(s: ServerOperation): string {
    const n = this.names;
    const of = (where: ServerParam["in"]) => s.params.filter((p) => p.in === where);
    const body = s.body;
    let bodyType = "undefined";
    if (body) {
      const t = body.kind === "binary" ? n.file : body.kind === "text" ? "string" : this.ts(body.schema);
      bodyType = body.required ? t : `${t} | undefined`;
    }
    const responses = s.responses.map((r) => `${/^\d{3}$/.test(r.status) ? r.status : str(r.status)}: ${this.answer(r, "undefined")}`);
    const secured = s.security.length > 0 && s.security.every((r) => Object.keys(r).length > 0);
    const p = s.pagination;
    const item = p ? this.itemType(s) : "";
    const pageAnswer = p ? `{ ${str(p.items)}: ${item}[]; ${p.style === "cursor" ? `${str(p.nextField)}: string | null` : `${str(p.totalField)}: number`} }` : "";
    return [
      `  ${s.op.name}: {`,
      `    params: ${this.object(of("path"), (x) => x.name, () => false)}`,
      `    query: ${this.object(
        of("query"),
        (x) => x.name,
        (x) => !x.required && !(isRecord(x.schema) && "default" in x.schema),
      )}`,
      `    headers: ${this.object(
        of("header"),
        (x) => x.name.toLowerCase(),
        (x) => !x.required,
      )}`,
      `    body: ${bodyType}`,
      `    responses: ${responses.length ? `{ ${responses.join("; ")} }` : EMPTY}`,
      `    result: ${this.answer(s.success, "void")}`,
      `    secured: ${secured}`,
      `    page: ${p ? (p.style === "cursor" ? n.cursorPage : n.offsetPage) : "undefined"}`,
      `    paginate: ${p ? `(all: readonly ${item}[]) => ${pageAnswer}` : "undefined"}`,
      "  }",
    ].join("\n");
  }

  source(): string {
    const n = this.names;
    const models = (this.c.spec.models ?? []).map((m) => ({ name: m.name, schema: mapRefs(m.schema, (ref) => (this.models.has(refModel(ref) ?? "\u0000") ? ref : null)) }));
    const modelTypes = schemaToTs({ models }, { comments: false, binary: n.file }).trim();
    const channels = this.c.channels.map((ch) => {
      const payload = (name: string) => this.ts(ch.messages.find((m) => m.name === name)?.payload, "      ");
      const map = (names: string[]) => (names.length ? `{ ${names.map((m) => `${str(m)}: ${payload(m)}`).join("; ")} }` : EMPTY);
      return [`  ${ch.name}: {`, `    params: ${ch.routeParams.length ? `{ ${ch.routeParams.map((p) => `${str(p.name)}: string`).join("; ")} }` : EMPTY}`, `    send: ${map(ch.send)}`, `    receive: ${map(ch.receive)}`, "  }"].join("\n");
    });
    return `${GENERATED}
/* The contract as TypeScript: its models, what each operation's handler is given and answers, what goes over each
   realtime channel. */

export type ${n.file} = import("./uploads").UploadedFile
export type ${n.fileReply} = import("./uploads").FileReply
export type ${n.cursorPage} = import("./pagination").CursorPage
export type ${n.offsetPage} = import("./pagination").OffsetPage

${modelTypes === "export {};" ? "/* the contract has no models */" : modelTypes}

/** every operation of the contract: its parameters, query, headers and body as the handler is given them (checked
 *  against the contract), its answers by status, and what the handler returns when it goes well */
export type ${n.operations} = ${this.c.operations.length ? `{\n${this.c.operations.map((s) => this.operation(s)).join("\n")}\n}` : EMPTY}

/** every realtime channel: the parameters of its address, what the server sends and what it receives */
export type ${n.channels} = ${channels.length ? `{\n${channels.join("\n")}\n}` : EMPTY}
`;
  }
}
