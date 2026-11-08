/* Optional regions in a real file. Some of what an export writes is the same code in every product but for what a
 * document uses: the web app's runtime (lib/export/files/web/runtime.tsx) has an overlay only when a tap opens one, a
 * session only in the product, and so on. Such a file is still a real file of this repo, typechecked, linted and tested
 * as code, in one configuration of its features (the one it is written in, its "reference"); what the other
 * configurations have instead sits beside it, marked, and the export keeps or drops each marked region by what the
 * document uses. What is written for a document that uses none of a feature is what it always got, to the byte.
 *
 * The marks (each a comment, so the file stays valid code):
 *
 *   //#if <cond>  //#elif <cond>  //#else  //#end      on lines of their own: the lines between are kept or dropped
 *   //| <code>                                          a line the reference configuration does not have (dormant):
 *                                                      kept, it is the code after the mark at the mark's indentation
 *   /*#if <cond>* /text/*#end* /                       inline: text kept or dropped
 *   /*#if <cond>* /text/*#else other#end* /            inline: text, else what the comment holds (one space after
 *                                                      `#else` is the mark's; `other` cannot hold a comment's end)
 *   /*$name* /placeholder/*$* /                        a value of the document in place of the placeholder
 *   @@name@@                                           a value anywhere, in a comment too
 *
 * (written here with a space before each `/`, which would end this comment). A condition is flags joined by `&&` and
 * `||` (`&&` binds tighter), each maybe negated with `!`. Every flag and every value a file names must be given: a
 * misspelt one is an error, not a region quietly dropped. */

export type Flags = Record<string, unknown>;

/** whether a condition holds over the flags */
function holds(cond: string, flags: Flags, where: string): boolean {
  const text = cond.trim();
  if (!text) throw new Error(`${where}: a region with no condition`);
  return text.split("||").some((any) =>
    any.split("&&").every((one) => {
      const m = /^\s*(!?)\s*([A-Za-z_][\w]*)\s*$/.exec(one);
      if (!m) throw new Error(`${where}: cannot read the condition ${JSON.stringify(cond)}`);
      if (!Object.hasOwn(flags, m[2])) throw new Error(`${where}: no flag ${m[2]}`);
      return !!flags[m[2]] !== (m[1] === "!");
    }),
  );
}

const DIRECTIVE = /^\s*\/\/#(if|elif|else|end)\b(.*)$/;
const DORMANT = /^(\s*)\/\/\|(?: (.*))?$/;

/** the lines of a file with its line regions kept or dropped and its dormant lines woken */
function lineRegions(text: string, flags: Flags, where: string): string {
  /* each open region: whether its lines are kept, whether a branch of it was already taken, whether all around it is kept */
  const open: { keep: boolean; taken: boolean; outer: boolean; line: number }[] = [];
  const out: string[] = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const at = `${where}:${i + 1}`;
    const d = DIRECTIVE.exec(line);
    const outer = open.length ? open[open.length - 1].keep : true;
    if (d) {
      const [, kind, rest] = d;
      if (kind === "if") {
        const keep = outer && holds(rest, flags, at);
        open.push({ keep, taken: keep, outer, line: i + 1 });
        return;
      }
      const top = open[open.length - 1];
      if (!top) throw new Error(`${at}: //#${kind} with no //#if`);
      if (kind === "elif") {
        const keep = top.outer && !top.taken && holds(rest, flags, at);
        top.keep = keep;
        top.taken ||= keep;
      } else if (kind === "else") {
        if (rest.trim()) throw new Error(`${at}: //#else takes no condition`);
        top.keep = top.outer && !top.taken;
        top.taken = true;
      } else {
        if (rest.trim()) throw new Error(`${at}: //#end takes no condition`);
        open.pop();
      }
      return;
    }
    if (!outer) return;
    const dormant = DORMANT.exec(line);
    out.push(dormant ? (dormant[2] === undefined ? "" : `${dormant[1]}${dormant[2]}`) : line);
  });
  if (open.length) throw new Error(`${where}:${open[open.length - 1].line}: //#if with no //#end`);
  return out.join("\n");
}

/* an inline region with nothing inline inside it: the innermost first, so they nest */
const INLINE = /\/\*#if ([^*]*)\*\/((?:(?!\/\*#if )[\s\S])*?)(?:\/\*#else ([\s\S]*?)#end\*\/|\/\*#end\*\/)/;
const VALUE = /\/\*\$([A-Za-z_]\w*)\*\/[\s\S]*?\/\*\$\*\//g;
const ANYWHERE = /@@([A-Za-z_]\w*)@@/g;

/** A file as a document has it: its regions kept or dropped by the flags, its values filled in. `where` names the file
 *  in an error. */
export function fillRegions(text: string, flags: Flags, values: Record<string, string> = {}, where = "file"): string {
  let out = lineRegions(text, flags, where);
  for (let m = INLINE.exec(out); m; m = INLINE.exec(out)) {
    const kept = holds(m[1], flags, where) ? m[2] : (m[3] ?? "");
    out = out.slice(0, m.index) + kept + out.slice(m.index + m[0].length);
  }
  const bare = out.replace(VALUE, "");
  const left = /\/\*#(?:if|else|end)|#end\*\/|\/\*\$\*\//.exec(bare);
  if (left) throw new Error(`${where}: a mark left unclosed near ${JSON.stringify(bare.slice(Math.max(0, left.index - 40), left.index + 40))}`);
  /* one pass over both kinds of value, with a function as the replacement: what a value says is never read as marks
     (nor its `$&` as a pattern) */
  out = out.replace(new RegExp(`${VALUE.source}|${ANYWHERE.source}`, "g"), (_, a: string | undefined, b: string | undefined) => {
    const name = (a ?? b)!;
    if (!Object.hasOwn(values, name)) throw new Error(`${where}: no value ${name}`);
    return values[name];
  });
  return out;
}

/** the flags and values a file names: what an export must give it */
export function namesIn(text: string): { flags: string[]; values: string[] } {
  const flags = new Set<string>();
  const add = (cond: string) => {
    for (const m of cond.matchAll(/[A-Za-z_]\w*/g)) flags.add(m[0]);
  };
  for (const line of text.split("\n")) {
    const d = DIRECTIVE.exec(line);
    if (d && (d[1] === "if" || d[1] === "elif")) add(d[2]);
  }
  for (const m of text.matchAll(/\/\*#if ([^*]*)\*\//g)) add(m[1]);
  const values = new Set([...text.matchAll(/\/\*\$([A-Za-z_]\w*)\*\//g), ...text.matchAll(ANYWHERE)].map((m) => m[1]));
  return { flags: [...flags].sort(), values: [...values].sort() };
}
