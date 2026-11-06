/* JSON data as YAML 1.2 text, for the contract files a product carries (openapi.yaml, asyncapi.yaml). Every string is
 * written double-quoted with JSON's escapes (which YAML reads the same), so no word of a document can become YAML
 * structure, a tag, an anchor or a second document. Keys are bare only when they are plain names. */

const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/;
/** words YAML 1.1 readers still take as booleans or null */
const RESERVED = /^(y|n|yes|no|on|off|true|false|null|~)$/i;

const quote = (s: string) => JSON.stringify(s).replace(/[\u2028\u2029\u0085\ufeff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
const keyOf = (k: string) => (PLAIN_KEY.test(k) && !RESERVED.test(k) ? k : quote(k));

function scalar(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return quote(v);
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  return quote(String(v));
}

const isBranch = (v: unknown): v is object => typeof v === "object" && v !== null && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0);

function lines(v: unknown, pad: string): string[] {
  if (Array.isArray(v)) {
    return v.flatMap((item) => {
      if (!isBranch(item)) return [`${pad}- ${Array.isArray(item) ? "[]" : typeof item === "object" && item ? "{}" : scalar(item)}`];
      const inner = lines(item, `${pad}  `);
      return [`${pad}- ${inner[0].slice(pad.length + 2)}`, ...inner.slice(1)];
    });
  }
  return Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined)
    .flatMap(([k, x]) => (isBranch(x) ? [`${pad}${keyOf(k)}:`, ...lines(x, `${pad}  `)] : [`${pad}${keyOf(k)}: ${Array.isArray(x) ? "[]" : typeof x === "object" && x ? "{}" : scalar(x)}`]));
}

/** a JSON value (an object at the top) as YAML text ending in a newline */
export function toYaml(value: Record<string, unknown>): string {
  return `${lines(value, "").join("\n")}\n`;
}
