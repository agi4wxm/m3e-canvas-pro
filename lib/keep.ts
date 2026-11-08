/* What a document holds that this version does not know is kept as it came (docs/项目文件.md): a field a newer
 * version added, one a tool of its own wrote, one written by hand. Each cleaner checks the fields it knows, drops
 * those of the wrong kind, and hands the rest back through `withUnknown`, so reading a file and writing it again
 * loses nothing it cannot read. A field it knows and finds wrong still goes: that is what cleaning is for. */

/** Sets an own, enumerable key as JSON.parse makes one: `__proto__` stays a key of the copy, not its prototype. */
const define = (out: Record<string, unknown>, key: string, value: unknown) => Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true });

/** `built` with every field of `raw` that is none of `known` (and that `built` does not hold) added after its own, as
 *  it came, or as `copy` makes it (a section with a budget copies within it). The same object when there is none. */
export function withUnknown<T extends object>(raw: unknown, built: T, known: ReadonlySet<string>, copy?: (v: unknown) => unknown): T {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return built;
  let out: Record<string, unknown> | null = null;
  for (const k of Object.keys(raw)) {
    if (known.has(k) || Object.prototype.hasOwnProperty.call(built, k)) continue;
    const v = copy ? copy((raw as Record<string, unknown>)[k]) : (raw as Record<string, unknown>)[k];
    if (v === undefined) continue;
    out ??= { ...(built as Record<string, unknown>) };
    define(out, k, v);
  }
  return (out ?? built) as T;
}

/** the names of the fields one kind of object has, for `withUnknown` */
export const fields = (...names: string[]): ReadonlySet<string> => new Set(names);

/** the fields of `raw` that are none of `known`: what a cleaner that keeps only its own would drop */
export function unknownFields(raw: unknown, known: ReadonlySet<string>): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.keys(raw).filter((k) => !known.has(k));
}
