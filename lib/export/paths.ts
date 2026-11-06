/* Where an exported product's files go, and the names derived from a document's words. Every path is relative to the
 * output folder, written with `/`, and has to stay inside it on every system it may be unpacked on: no `..`, no root,
 * no drive or stream (`C:`, `a:b`), no backslash, no names Windows keeps for devices, no two paths that only differ in
 * case (they are one file on macOS and Windows). The writers check again against the disk itself (symlinks). */

/** characters no file name may hold on some system the product may be checked out on */
// eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
const BAD_CHARS = /[\u0000-\u001f\u007f<>:"|?*\\]/;
/** names Windows keeps for devices, whatever the extension */
const DEVICE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(\..*)?$/i;
const MAX_PATH = 400;
const MAX_SEGMENT = 120;

/** why a path may not be written into an output folder, or null when it may */
export function pathProblem(path: string): string | null {
  if (typeof path !== "string" || !path) return "empty path";
  if (path.length > MAX_PATH) return "path too long";
  if (path.startsWith("/")) return "absolute path";
  if (BAD_CHARS.test(path)) return "a character file names cannot hold";
  for (const segment of path.split("/")) {
    if (!segment) return "empty folder name";
    if (segment === "." || segment === "..") return "a step out of the folder";
    if (segment.length > MAX_SEGMENT) return "name too long";
    if (/[. ]$/.test(segment)) return "a name ending in a dot or a space";
    if (DEVICE.test(segment)) return "a device name";
  }
  return null;
}

export const isSafePath = (path: string) => pathProblem(path) === null;

/** Throws on the first path that may not be written, or on two that would be one file on a case-insensitive disk. */
export function assertSafePaths(paths: Iterable<string>): void {
  const seen = new Map<string, string>();
  for (const path of paths) {
    const problem = pathProblem(path);
    if (problem) throw new Error(`refusing to write ${JSON.stringify(path)}: ${problem}`);
    const folded = path.toLowerCase();
    const other = seen.get(folded);
    if (other !== undefined && other !== path) throw new Error(`refusing to write both ${JSON.stringify(other)} and ${JSON.stringify(path)}: they are one file where case does not count`);
    seen.set(folded, path);
  }
}

/** Words as one file or folder name: letters and digits of any script joined by `-`, never empty, never a device
 *  name, never longer than `max`. What else the words hold is dropped, so nothing in them can name another folder. */
export function safeSegment(words: unknown, fallback: string, max = 60): string {
  const parts = typeof words === "string" ? (words.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? []) : [];
  let out = parts.join("-").slice(0, max).replace(/-+$/, "");
  if (!out || DEVICE.test(out)) out = fallback;
  return out;
}

/** An npm package name segment from words: lowercase ASCII letters and digits joined by `-`, as npm accepts in a
 *  scope or a name; the fallback when nothing of the words is ASCII. */
export function npmSlug(words: unknown, fallback: string, max = 50): string {
  const parts = typeof words === "string" ? (words.toLowerCase().match(/[a-z0-9]+/g) ?? []) : [];
  const out = parts.join("-").slice(0, max).replace(/-+$/, "");
  return out || fallback;
}

/** an identifier in camelCase from words, for code: letters and digits only, never starting with a digit, never a
 *  word JavaScript keeps */
export function identifierOf(words: unknown, fallback: string): string {
  const parts = typeof words === "string" ? (words.match(/[A-Za-z0-9]+/g) ?? []) : [];
  let out = parts.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w[0].toLowerCase() + w.slice(1))).join("");
  if (!out || /^\d/.test(out) || RESERVED.has(out)) out = fallback;
  return out;
}

const RESERVED = new Set(
  "break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await arguments eval undefined NaN Infinity constructor prototype __proto__ hasOwnProperty toString valueOf".split(
    " ",
  ),
);

/** a kebab-case URL segment from an identifier: `orderDetails` is `order-details` */
export const kebab = (id: string) =>
  id
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
