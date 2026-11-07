/* A request checked against its schema, as a back end would: every field that is wrong, with a JSON Pointer to it and a
 * sentence in the mocks' language, for the app's form to show (RFC 9457 problem details, `errors[].pointer`). The
 * subset of JSON Schema 2020-12 the contract uses: types (null included), enum and const, formats (email, uuid,
 * date-time, date, uri…), lengths, bounds, patterns, items, required and unknown fields, allOf / anyOf / oneOf and
 * references, with a budget. A field the server sets (readOnly) may be left out of a request. */

import { isRecord, pointerRoot, resolvePointer } from "../api/schema";
import { encodePointer, type ApiSpec, type JsonSchema, type JsonSchemaObject } from "../api/types";
import { regexOf } from "./pattern";
import type { MockLocale } from "./types";

export type FieldError = { pointer: string; detail: string };

type Msg = "required" | "type" | "enum" | "const" | "minLength" | "maxLength" | "pattern" | "format" | "minimum" | "maximum" | "above" | "below" | "multipleOf" | "minItems" | "maxItems" | "uniqueItems" | "unknown" | "oneOf" | "not" | "file";

const MESSAGES: Record<MockLocale, Record<Msg, string>> = {
  zh: {
    required: "必填",
    type: "应为{type}",
    enum: "只能是 {values} 之一",
    const: "只能是 {value}",
    minLength: "至少 {n} 个字符",
    maxLength: "最多 {n} 个字符",
    pattern: "格式不对",
    format: "不是有效的{format}",
    minimum: "不能小于 {n}",
    maximum: "不能大于 {n}",
    above: "应大于 {n}",
    below: "应小于 {n}",
    multipleOf: "应为 {n} 的倍数",
    minItems: "至少 {n} 项",
    maxItems: "最多 {n} 项",
    uniqueItems: "不能有重复项",
    unknown: "不认识这个字段",
    oneOf: "不符合任何一种允许的形式",
    not: "不允许这个值",
    file: "应为文件",
  },
  en: {
    required: "is required",
    type: "should be {type}",
    enum: "should be one of {values}",
    const: "should be {value}",
    minLength: "should be at least {n} characters",
    maxLength: "should be at most {n} characters",
    pattern: "is not in the right form",
    format: "is not a valid {format}",
    minimum: "should be at least {n}",
    maximum: "should be at most {n}",
    above: "should be more than {n}",
    below: "should be less than {n}",
    multipleOf: "should be a multiple of {n}",
    minItems: "should have at least {n} items",
    maxItems: "should have at most {n} items",
    uniqueItems: "should not repeat items",
    unknown: "is not a field of this request",
    oneOf: "matches none of the allowed shapes",
    not: "is not allowed",
    file: "should be a file",
  },
  ja: {
    required: "必須です",
    type: "{type}で入力してください",
    enum: "{values} のいずれかにしてください",
    const: "{value} にしてください",
    minLength: "{n} 文字以上で入力してください",
    maxLength: "{n} 文字以内で入力してください",
    pattern: "形式が正しくありません",
    format: "有効な{format}ではありません",
    minimum: "{n} 以上にしてください",
    maximum: "{n} 以下にしてください",
    above: "{n} より大きくしてください",
    below: "{n} より小さくしてください",
    multipleOf: "{n} の倍数にしてください",
    minItems: "{n} 件以上必要です",
    maxItems: "{n} 件までです",
    uniqueItems: "重複はできません",
    unknown: "このリクエストにない項目です",
    oneOf: "許可された形式のどれにも当てはまりません",
    not: "この値は使えません",
    file: "ファイルを指定してください",
  },
  ko: {
    required: "필수 항목입니다",
    type: "{type}이어야 합니다",
    enum: "{values} 중 하나여야 합니다",
    const: "{value}이어야 합니다",
    minLength: "{n}자 이상이어야 합니다",
    maxLength: "{n}자 이하여야 합니다",
    pattern: "형식이 올바르지 않습니다",
    format: "올바른 {format}이 아닙니다",
    minimum: "{n} 이상이어야 합니다",
    maximum: "{n} 이하여야 합니다",
    above: "{n}보다 커야 합니다",
    below: "{n}보다 작아야 합니다",
    multipleOf: "{n}의 배수여야 합니다",
    minItems: "{n}개 이상이어야 합니다",
    maxItems: "{n}개 이하여야 합니다",
    uniqueItems: "중복될 수 없습니다",
    unknown: "이 요청에 없는 항목입니다",
    oneOf: "허용된 형식과 맞지 않습니다",
    not: "허용되지 않는 값입니다",
    file: "파일이어야 합니다",
  },
};

const TYPE_WORDS: Record<MockLocale, Record<string, string>> = {
  zh: { string: "文本", number: "数字", integer: "整数", boolean: "是或否", object: "对象", array: "列表", null: "空" },
  en: { string: "text", number: "a number", integer: "a whole number", boolean: "true or false", object: "an object", array: "a list", null: "null" },
  ja: { string: "文字列", number: "数値", integer: "整数", boolean: "真偽値", object: "オブジェクト", array: "リスト", null: "null" },
  ko: { string: "텍스트", number: "숫자", integer: "정수", boolean: "참 또는 거짓", object: "객체", array: "목록", null: "null" },
};

const FORMAT_WORDS: Record<MockLocale, Record<string, string>> = {
  zh: { email: "邮箱地址", uuid: "UUID", "date-time": "日期时间", date: "日期", time: "时间", uri: "网址", url: "网址", ipv4: "IP 地址", ipv6: "IP 地址", phone: "电话号码" },
  en: { email: "email address", uuid: "UUID", "date-time": "date and time", date: "date", time: "time", uri: "URL", url: "URL", ipv4: "IP address", ipv6: "IP address", phone: "phone number" },
  ja: { email: "メールアドレス", uuid: "UUID", "date-time": "日時", date: "日付", time: "時刻", uri: "URL", url: "URL", ipv4: "IP アドレス", ipv6: "IP アドレス", phone: "電話番号" },
  ko: { email: "이메일 주소", uuid: "UUID", "date-time": "날짜와 시간", date: "날짜", time: "시간", uri: "URL", url: "URL", ipv4: "IP 주소", ipv6: "IP 주소", phone: "전화번호" },
};

const FORMATS: Record<string, RegExp> = {
  email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "date-time": /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:?\d{2})?$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  time: /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:?\d{2})?$/,
  uri: /^[a-z][a-z0-9+.-]*:\S*$/i,
  url: /^[a-z][a-z0-9+.-]*:\S*$/i,
  ipv4: /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/,
  ipv6: /^[0-9a-f:]+$/i,
};

export type CheckOptions = {
  locale: MockLocale;
  /** a request: readOnly fields may be left out; a response: writeOnly ones */
  direction?: "request" | "response";
  /** a merge patch (PATCH): only what is there is checked, nothing is required */
  partial?: boolean;
};

type Ctx = CheckOptions & { api: ApiSpec; root: Record<string, unknown>; errors: FieldError[]; budget: { left: number } };

const say = (ctx: Ctx, msg: Msg, vars: Record<string, string | number> = {}) => MESSAGES[ctx.locale][msg].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

const typeOf = (v: unknown): string => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v);

/** whether a value is a file as a transport carries it ({name, type, dataUrl}) */
export const isFileValue = (v: unknown): v is { name?: string; type?: string; dataUrl: string; size?: number } => isRecord(v) && typeof v.dataUrl === "string";

/** Everything wrong with a value, by JSON Pointer from the request's body (`#/price/amount`). Empty when it is fine. */
export function checkValue(api: ApiSpec, schema: JsonSchema | undefined, value: unknown, o: CheckOptions, at = "#"): FieldError[] {
  const ctx: Ctx = { ...o, api, root: pointerRoot(api), errors: [], budget: { left: 20_000 } };
  walk(ctx, schema, value, at, 0);
  /* one error per field, the first said */
  const seen = new Set<string>();
  return ctx.errors.filter((e) => (seen.has(e.pointer) ? false : (seen.add(e.pointer), true))).slice(0, 50);
}

function walk(ctx: Ctx, schema: JsonSchema | undefined, v: unknown, at: string, depth: number): void {
  if (schema === undefined || schema === true || depth > 40 || ctx.budget.left-- <= 0) return;
  if (schema === false) {
    ctx.errors.push({ pointer: at, detail: say(ctx, "not") });
    return;
  }
  const s = schema as JsonSchemaObject;
  if (typeof s.$ref === "string") {
    const target = resolvePointer(ctx.root, s.$ref);
    if (target !== undefined) walk(ctx, target as JsonSchema, v, at, depth + 1);
  }
  if (Array.isArray(s.allOf)) for (const x of s.allOf) walk(ctx, x as JsonSchema, v, at, depth + 1);
  for (const k of ["anyOf", "oneOf"] as const) {
    const list = s[k];
    if (!Array.isArray(list) || !list.length) continue;
    const passing = (list as JsonSchema[]).filter((x) => {
      const sub: Ctx = { ...ctx, errors: [] };
      walk(sub, x, v, at, depth + 1);
      return sub.errors.length === 0;
    });
    if (!passing.length) {
      /* the shape the value comes closest to says what is wrong with it, when there is one */
      const tries = (list as JsonSchema[]).map((x) => {
        const sub: Ctx = { ...ctx, errors: [] };
        walk(sub, x, v, at, depth + 1);
        return sub.errors;
      });
      const best = tries.sort((a, b) => a.length - b.length)[0];
      if (best && best.length && best.every((e) => e.pointer !== at)) ctx.errors.push(...best);
      else ctx.errors.push({ pointer: at, detail: say(ctx, "oneOf") });
    }
  }
  if (s.not !== undefined) {
    const sub: Ctx = { ...ctx, errors: [] };
    walk(sub, s.not as JsonSchema, v, at, depth + 1);
    if (!sub.errors.length) ctx.errors.push({ pointer: at, detail: say(ctx, "not") });
  }
  const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
  const t = typeOf(v);
  const file = isFileValue(v);
  if (types.length) {
    const fits = types.some((x) => x === t || (x === "number" && t === "integer") || (x === "string" && file && (s.format === "binary" || s.format === "byte" || typeof s.contentMediaType === "string")));
    if (!fits) {
      ctx.errors.push({ pointer: at, detail: s.format === "binary" ? say(ctx, "file") : say(ctx, "type", { type: types.filter((x) => x !== "null").map((x) => TYPE_WORDS[ctx.locale][x] ?? x).join(" / ") }) });
      return;
    }
  }
  if (s.const !== undefined && JSON.stringify(s.const) !== JSON.stringify(v)) ctx.errors.push({ pointer: at, detail: say(ctx, "const", { value: JSON.stringify(s.const) }) });
  if (Array.isArray(s.enum) && !s.enum.some((x) => JSON.stringify(x) === JSON.stringify(v))) ctx.errors.push({ pointer: at, detail: say(ctx, "enum", { values: s.enum.slice(0, 8).map((x) => String(x)).join(", ") }) });
  if (typeof v === "string" && !file) {
    const len = [...v].length;
    if (typeof s.minLength === "number" && len < s.minLength) ctx.errors.push({ pointer: at, detail: s.minLength === 1 && len === 0 ? say(ctx, "required") : say(ctx, "minLength", { n: s.minLength }) });
    if (typeof s.maxLength === "number" && len > s.maxLength) ctx.errors.push({ pointer: at, detail: say(ctx, "maxLength", { n: s.maxLength }) });
    if (typeof s.pattern === "string" && v.length <= 10_000) {
      const re = regexOf(s.pattern);
      if (re && !re.test(v)) ctx.errors.push({ pointer: at, detail: say(ctx, "pattern") });
    }
    const fmt = typeof s.format === "string" ? FORMATS[s.format] : undefined;
    if (fmt && !fmt.test(v)) ctx.errors.push({ pointer: at, detail: say(ctx, "format", { format: FORMAT_WORDS[ctx.locale][s.format as string] ?? String(s.format) }) });
    else if ((s.format === "date-time" || s.format === "date") && Number.isNaN(Date.parse(v))) ctx.errors.push({ pointer: at, detail: say(ctx, "format", { format: FORMAT_WORDS[ctx.locale][s.format] }) });
  }
  if (typeof v === "number") {
    if (typeof s.minimum === "number" && v < s.minimum) ctx.errors.push({ pointer: at, detail: say(ctx, "minimum", { n: s.minimum }) });
    if (typeof s.exclusiveMinimum === "number" && v <= s.exclusiveMinimum) ctx.errors.push({ pointer: at, detail: say(ctx, "above", { n: s.exclusiveMinimum }) });
    if (typeof s.maximum === "number" && v > s.maximum) ctx.errors.push({ pointer: at, detail: say(ctx, "maximum", { n: s.maximum }) });
    if (typeof s.exclusiveMaximum === "number" && v >= s.exclusiveMaximum) ctx.errors.push({ pointer: at, detail: say(ctx, "below", { n: s.exclusiveMaximum }) });
    if (typeof s.multipleOf === "number" && s.multipleOf > 0 && Math.abs(v / s.multipleOf - Math.round(v / s.multipleOf)) > 1e-9) ctx.errors.push({ pointer: at, detail: say(ctx, "multipleOf", { n: s.multipleOf }) });
  }
  if (Array.isArray(v)) {
    if (typeof s.minItems === "number" && v.length < s.minItems) ctx.errors.push({ pointer: at, detail: say(ctx, "minItems", { n: s.minItems }) });
    if (typeof s.maxItems === "number" && v.length > s.maxItems) ctx.errors.push({ pointer: at, detail: say(ctx, "maxItems", { n: s.maxItems }) });
    if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) ctx.errors.push({ pointer: at, detail: say(ctx, "uniqueItems") });
    const prefix = Array.isArray(s.prefixItems) ? (s.prefixItems as JsonSchema[]) : [];
    v.slice(0, 1000).forEach((x, i) => walk(ctx, i < prefix.length ? prefix[i] : s.items, x, `${at}/${i}`, depth + 1));
  }
  if (isRecord(v) && !file) {
    const props = isRecord(s.properties) ? (s.properties as Record<string, JsonSchema>) : {};
    for (const name of Array.isArray(s.required) && !ctx.partial ? s.required : []) {
      if (typeof name !== "string" || v[name] !== undefined) continue;
      const p = props[name];
      if (ctx.direction !== "response" && isRecord(p) && (p as JsonSchemaObject).readOnly) continue;
      if (ctx.direction === "response" && isRecord(p) && (p as JsonSchemaObject).writeOnly) continue;
      ctx.errors.push({ pointer: `${at}/${encodePointer(name)}`, detail: say(ctx, "required") });
    }
    for (const [name, x] of Object.entries(v)) {
      if (x === undefined) continue;
      const pointer = `${at}/${encodePointer(name)}`;
      if (props[name] !== undefined) walk(ctx, props[name], x, pointer, depth + 1);
      else if (s.additionalProperties === false) ctx.errors.push({ pointer, detail: say(ctx, "unknown") });
      else if (isRecord(s.additionalProperties)) walk(ctx, s.additionalProperties as JsonSchema, x, pointer, depth + 1);
    }
  }
}

/** A query or path parameter's text read as its schema's type: "20" for an integer is 20. What cannot be read stays
 *  text, so the check says what is wrong with it. */
export function paramValue(text: unknown, schema: JsonSchema | undefined): unknown {
  if (Array.isArray(text)) return text.map((x) => paramValue(x, isRecord(schema) ? ((schema as JsonSchemaObject).items as JsonSchema) : undefined));
  if (typeof text !== "string") return text;
  const s = isRecord(schema) ? (schema as JsonSchemaObject) : {};
  const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
  if ((types.includes("integer") || types.includes("number")) && text.trim() !== "" && Number.isFinite(Number(text))) return Number(text);
  if (types.includes("boolean") && (text === "true" || text === "false")) return text === "true";
  if (types.includes("array")) return text.split(",").map((x) => paramValue(x, s.items as JsonSchema));
  return text;
}
