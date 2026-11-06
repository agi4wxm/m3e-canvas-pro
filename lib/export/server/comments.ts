/* The contract's words in comments of the code the export writes (the handler stubs show the contract they answer to).
 * Only ever in `//` line comments, one line each: a line comment ends at a line terminator and nowhere else, so words
 * without one stay words. Out go every line terminator (\n, \r, U+2028, U+2029), every other control character and the
 * bidirectional controls that would make a comment read differently from what it is (Trojan Source). Each line starts
 * with a fixed label of the export's, so no word becomes a directive (`@ts-ignore`, `eslint-disable`). */

/** characters a comment's words may not hold */
// eslint-disable-next-line no-control-regex -- the point is to take them out
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069\ufeff]+/g;

/** words as one line of a comment, at most `max` characters */
export function commentText(words: unknown, max = 160): string {
  if (typeof words !== "string") return "";
  const one = words.replace(UNSAFE, " ").replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/** lines of a comment, each `// ` + the label + the words */
export function commentLines(lines: string[], indent = ""): string {
  return lines.map((l) => `${indent}//${l ? ` ${l.replace(UNSAFE, " ")}` : ""}`.trimEnd()).join("\n");
}
