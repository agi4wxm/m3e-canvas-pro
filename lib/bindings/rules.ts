/* The rules a form's fields are checked by and the errors a call comes back with, as the app reads them: what is wrong
 * with a value against its schema (required, lengths, formats, ranges, enums, patterns), a value as its schema's type
 * has it, RFC 9457 problem details read out of an error answer, and the field a JSON Pointer names. Plain functions
 * over plain data, with no imports but the app's words (messages.ts) and the schema's type: the preview reads them
 * through contract.ts, and the exported apps run this very file (packages/app-runtime copies it), so a field says the
 * same thing in both. */

import type { JsonSchemaObject } from "../api/types";
import { appMessage } from "./messages";

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** a schema's type, the one that is not null, or what its keywords say it is */
export const schemaType = (s: JsonSchemaObject | undefined): string | undefined => {
  if (!s) return undefined;
  const t = Array.isArray(s.type) ? s.type.find((x) => x !== "null") : s.type;
  return t ?? (s.properties ? "object" : s.items ? "array" : undefined);
};

/** what kind of input a field is entered with */
export type FieldKind = "text" | "email" | "password" | "number" | "integer" | "date" | "datetime" | "url" | "tel" | "textarea" | "select" | "switch" | "file";

/** one field of a form, as its schema says it is entered and checked */
export type FieldSpec = {
  /** where it goes in the body: "email", "address.city" */
  name: string;
  /** what a person is shown: the schema's title, else the name in words */
  title: string;
  description?: string;
  kind: FieldKind;
  required: boolean;
  /** the values a select offers */
  options?: string[];
  schema: JsonSchemaObject;
};

/** what checking a field needs of it: how it is entered, whether it must be given, its schema */
export type FieldRule = Pick<FieldSpec, "kind" | "required" | "schema">;

/** a field's name in words: displayName → Display name */
export const titleOf = (name: string) => {
  const last = name.split(".").at(-1) ?? name;
  const words = last.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1).toLowerCase() : name;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** whether a value is nothing a person entered */
export const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && !v.length);

/** a pattern the schema gives, made once; one that is not a regular expression, or too long to trust, checks nothing */
function patternOf(p: unknown): RegExp | null {
  if (typeof p !== "string" || p.length > 500) return null;
  try {
    return new RegExp(p, "u");
  } catch {
    return null;
  }
}

/** What is wrong with a value against its field's schema, in the app's language; null when nothing is. */
export function fieldError(spec: FieldRule, value: unknown, lang: string): string | null {
  const s = spec.schema;
  if (isBlank(value) || value === false) {
    if (spec.required && !(spec.kind === "switch" && value === false)) return appMessage("required", lang);
    return null;
  }
  if (spec.kind === "number" || spec.kind === "integer" || schemaType(s) === "number" || schemaType(s) === "integer") {
    const n = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isFinite(n)) return appMessage("number", lang);
    if ((spec.kind === "integer" || schemaType(s) === "integer") && !Number.isInteger(n)) return appMessage("integer", lang);
    if (typeof s.minimum === "number" && n < s.minimum) return appMessage("minimum", lang, s.minimum);
    if (typeof s.exclusiveMinimum === "number" && n <= s.exclusiveMinimum) return appMessage("minimum", lang, s.exclusiveMinimum);
    if (typeof s.maximum === "number" && n > s.maximum) return appMessage("maximum", lang, s.maximum);
    if (typeof s.exclusiveMaximum === "number" && n >= s.exclusiveMaximum) return appMessage("maximum", lang, s.exclusiveMaximum);
    return null;
  }
  if (Array.isArray(s.enum) && s.enum.length && !s.enum.some((x) => String(x) === String(value))) return appMessage("enum", lang);
  if (typeof value !== "string") return null;
  const len = [...value].length;
  if (typeof s.minLength === "number" && len < s.minLength) return appMessage("minLength", lang, s.minLength);
  if (typeof s.maxLength === "number" && len > s.maxLength) return appMessage("maxLength", lang, s.maxLength);
  const v = value.trim();
  if (s.format === "email" && !EMAIL.test(v)) return appMessage("email", lang);
  if ((s.format === "uri" || s.format === "url") && !/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(v)) return appMessage("url", lang);
  if (s.format === "uuid" && !UUID.test(v)) return appMessage("uuid", lang);
  if (s.format === "date" && (!DATE.test(v) || !Number.isFinite(Date.parse(v)))) return appMessage("date", lang);
  if (s.format === "date-time" && !Number.isFinite(Date.parse(v))) return appMessage("dateTime", lang);
  const re = patternOf(s.pattern);
  if (re && !re.test(value.slice(0, 10_000))) return appMessage("pattern", lang);
  return null;
}

/** a value as the schema's type has it: a number field's words become a number, a boolean's a boolean */
export function typedValue(s: JsonSchemaObject, v: unknown): unknown {
  const t = schemaType(s);
  if ((t === "number" || t === "integer") && typeof v === "string") return v.trim() === "" ? undefined : Number.isFinite(Number(v)) ? Number(v) : v;
  if (t === "boolean" && typeof v === "string") return v === "true" ? true : v === "false" ? false : v;
  if (t === "string" && typeof v === "number") return String(v);
  return v;
}

/* ---------- errors ---------- */

/** RFC 9457 problem details as the bindings read them: status always, the rest when the server said */
export type Problem = { status: number; title: string; detail?: string; type?: string; errors?: { pointer?: string; detail: string; in?: "body" | "query" | "path" | "header" }[] };

/** the words HTTP names its statuses by ("Unprocessable Content"): a server's name for the status, not words for a person */
const REASONS = new Set(
  ["bad request", "unauthorized", "payment required", "forbidden", "not found", "method not allowed", "not acceptable", "request timeout", "conflict", "gone", "content too large", "payload too large", "request entity too large", "unsupported media type", "unprocessable", "unprocessable content", "unprocessable entity", "too many requests", "internal server error", "server error", "error", "not implemented", "bad gateway", "service unavailable", "gateway timeout"].map((w) => w.replace(/\s+/g, "")),
);
const isReason = (title: string) => REASONS.has(title.toLowerCase().replace(/[^a-z]/g, ""));

/** what a failed call is called for a person when the server says nothing of its own, by its status */
export function statusMessage(status: number, lang: string): string {
  if (status === 0) return appMessage("network", lang);
  if (status === 401) return appMessage("signInFirst", lang);
  if (status === 403) return appMessage("forbiddenDetail", lang);
  if (status === 404) return appMessage("notFoundDetail", lang);
  if (status === 409) return appMessage("conflict", lang);
  if (status === 413) return appMessage("tooLarge", lang);
  if (status === 400 || status === 422) return appMessage("submitFailed", lang);
  if (status === 429) return appMessage("tooMany", lang);
  if (status >= 500) return appMessage("serverError", lang);
  return appMessage("failed", lang);
}

/** The problem an error answer is: its problem details where the body has them, else what its status says. Status 0
 *  is a call that never reached the server. A title that only names the status ("Unprocessable Content") is said in
 *  the app's language, as a person reads it. */
export function problemOf(status: number, body: unknown, lang: string): Problem {
  const b = isRecord(body) ? body : {};
  const errors = Array.isArray(b.errors)
    ? b.errors
        .slice(0, 200)
        .flatMap((x) =>
          isRecord(x) && typeof x.detail === "string"
            ? [{ ...(typeof x.pointer === "string" ? { pointer: x.pointer } : {}), detail: x.detail.slice(0, 500), ...(x.in === "body" || x.in === "query" || x.in === "path" || x.in === "header" ? { in: x.in as "body" | "query" | "path" | "header" } : {}) }]
            : [],
        )
    : undefined;
  const own = typeof b.title === "string" && b.title.trim() && !isReason(b.title) ? b.title.slice(0, 300) : undefined;
  const code = typeof b.status === "number" && b.status >= 100 && b.status <= 599 ? b.status : status;
  const title = own ?? statusMessage(code, lang);
  return {
    status: typeof b.status === "number" && b.status >= 100 && b.status <= 599 ? b.status : status,
    title,
    ...(typeof b.detail === "string" ? { detail: b.detail.slice(0, 2000) } : typeof body === "string" && body.trim() && body.length < 500 ? { detail: body } : {}),
    ...(typeof b.type === "string" ? { type: b.type } : {}),
    ...(errors?.length ? { errors } : {}),
  };
}

/** the field of a form an error's JSON Pointer names: "#/email" or "/address/city" → "email", "address.city" */
export function pointerField(pointer: string | undefined): string | undefined {
  if (!pointer) return undefined;
  const p = pointer.replace(/^#/, "");
  if (!p.startsWith("/")) return p || undefined;
  const parts = p
    .slice(1)
    .split("/")
    .map((x) => x.replace(/~1/g, "/").replace(/~0/g, "~"));
  return parts.filter(Boolean).join(".") || undefined;
}

/** The errors a problem names field by field, by field: what it says of the request body lands on the form's fields (a
 *  query, path or header parameter is no field a person typed: the form's own error says it), the first word on each. */
export function problemFieldErrors(problem: Problem | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const x of problem?.errors ?? []) {
    if (x.in && x.in !== "body") continue;
    const f = pointerField(x.pointer);
    if (f && !out[f]) out[f] = x.detail;
  }
  return out;
}

/** The words a form shows for its call's failure: the server's own explanation where it gave one, else what the status
 *  says in the app's language. A bare status title ("Unprocessable Content", "Bad Request") is the server's word for the
 *  status, not for the person, so it never stands alone. */
export function problemMessage(problem: Problem | null | undefined, lang: string): string {
  if (!problem) return "";
  if (problem.detail?.trim()) return problem.detail.trim();
  return problem.title && !isReason(problem.title) ? problem.title : statusMessage(problem.status, lang);
}
