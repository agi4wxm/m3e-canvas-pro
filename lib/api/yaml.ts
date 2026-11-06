/* YAML for the spec files: a writer that always gives the same text for the same value (block style, two spaces,
 * keys in the value's own order, strings quoted only where YAML would read them as something else), and a reader of
 * the YAML 1.2 that OpenAPI and AsyncAPI files are written in: block and flow mappings and sequences, plain, quoted and
 * block scalars, comments, anchors, aliases and merge keys, one document. Bounded throughout: a file of a few kilobytes
 * that asks for millions of nodes through aliases, nests thousands deep or runs to megabytes is refused, not followed.
 * Plain TypeScript with no dependencies, so it runs in the editor, in Node and in an exported project alike. */

/* ---------- writing ---------- */

/** words a YAML reader would take for a boolean or null (1.2, and the 1.1 forms older tools still read), a merge key,
 *  or a date and time (YAML 1.1's timestamps, which js-yaml and PyYAML still read by default) */
const RESERVED = /^(?:null|Null|NULL|~|true|True|TRUE|false|False|FALSE|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF|y|Y|n|N|<<|=)$|^\d{4}-\d\d?-\d\d?(?:$|[Tt\s])/;
/** words a YAML reader would take for a number */
const NUMERIC = /^(?:[-+]?(?:\d[\d_]*)(?:\.\d*)?(?:[eE][-+]?\d+)?|[-+]?\.\d+(?:[eE][-+]?\d+)?|0x[\da-fA-F_]+|0o[0-7_]+|0b[01_]+|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN)|\d+:[0-5]?\d(?::[0-5]?\d)*(?:\.\d*)?)$/;

/** whether a string can stand unquoted and be read back as the same string */
function isPlain(s: string): boolean {
  if (!s || s !== s.trim() || RESERVED.test(s) || NUMERIC.test(s)) return false;
  /* an indicator first means something else; so do these sequences anywhere */
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return false;
  // eslint-disable-next-line no-control-regex -- a control character never stands unquoted
  if (/: |:$| #|\t|[\u0000-\u001f\u007f\u0085\u2028\u2029\ufeff]/.test(s)) return false;
  return true;
}

/** a string as a YAML scalar on one line: plain where it can be, else double-quoted (JSON's escapes are YAML's) */
export function yamlString(s: string): string {
  return isPlain(s) ? s : JSON.stringify(s);
}

const key = (k: string) => yamlString(k);

function scalar(v: unknown): string | undefined {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : v > 0 ? ".inf" : v < 0 ? "-.inf" : ".nan";
  if (typeof v === "string") return yamlString(v);
  return undefined;
}

/** a multi-line string as a literal block, when it reads back exactly: no tabs, no trailing spaces, no leading space */
function block(s: string, indent: string): string | undefined {
  // eslint-disable-next-line no-control-regex -- a control character cannot be written in a literal block
  if (!s.includes("\n") || /[\t\r\u0000-\u0008\u000b-\u001f\u007f\u0085\u2028\u2029\ufeff]/.test(s) || / \n|^\s| $/.test(s) || /\n\n+$/.test(s)) return undefined;
  const chomp = s.endsWith("\n") ? "" : "-";
  const body = (s.endsWith("\n") ? s.slice(0, -1) : s).split("\n").map((l) => (l ? indent + l : "")).join("\n");
  return `|${chomp}\n${body}`;
}

const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function write(v: unknown, indent: string, out: string[], lead: string) {
  if (Array.isArray(v)) {
    if (!v.length) return void out.push(`${lead}[]`);
    if (lead) out.push(lead.trimEnd());
    for (const x of v) {
      if (isMap(x) && Object.keys(x).length) {
        /* a mapping in a sequence starts on the dash's line */
        const sub: string[] = [];
        write(x, indent + "  ", sub, "");
        out.push(`${indent}- ${sub[0].slice(indent.length + 2)}`, ...sub.slice(1));
      } else if (Array.isArray(x) && x.length) {
        out.push(`${indent}-`);
        write(x, indent + "  ", out, "");
      } else write(x, indent + "  ", out, `${indent}- `);
    }
    return;
  }
  if (isMap(v)) {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    if (!entries.length) return void out.push(`${lead}{}`);
    if (lead) out.push(lead.trimEnd());
    for (const [k, x] of entries) {
      if ((isMap(x) && Object.keys(x).some((kk) => x[kk] !== undefined)) || (Array.isArray(x) && x.length)) {
        out.push(`${indent}${key(k)}:`);
        write(x, indent + "  ", out, "");
      } else write(x, indent + "  ", out, `${indent}${key(k)}: `);
    }
    return;
  }
  if (typeof v === "string") {
    const b = block(v, indent);
    if (b) return void out.push(lead + b);
  }
  out.push(lead + (scalar(v) ?? "null"));
}

/** A value as YAML text: block style, keys in the value's own order, ending with a newline. The same value always
 *  gives the same text, and `parseYaml` reads it back as a value equal to it (undefined fields left out, as JSON). */
export function toYaml(value: unknown): string {
  const out: string[] = [];
  write(value, "", out, "");
  return out.join("\n") + "\n";
}

/* ---------- reading ---------- */

export type YamlLimits = { maxChars: number; maxDepth: number; maxNodes: number };

/** generous for any real spec (the largest public OpenAPI files are a few megabytes and a few hundred thousand
 *  nodes), small enough that the tab answers */
export const YAML_LIMITS: YamlLimits = { maxChars: 8_000_000, maxDepth: 200, maxNodes: 1_000_000 };

/** what is wrong with a YAML text, and where */
export class YamlError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`line ${line}: ${message}`);
    this.name = "YamlError";
  }
}

const NULLS = /^(?:null|Null|NULL|~)?$/;

/** a plain scalar as the YAML 1.2 core schema reads it */
function resolvePlain(s: string): unknown {
  if (NULLS.test(s)) return null;
  if (/^(?:true|True|TRUE)$/.test(s)) return true;
  if (/^(?:false|False|FALSE)$/.test(s)) return false;
  if (/^[-+]?\d+$/.test(s)) return Number(s);
  if (/^0o[0-7]+$/.test(s)) return parseInt(s.slice(2), 8);
  if (/^0x[\da-fA-F]+$/.test(s)) return parseInt(s.slice(2), 16);
  if (/^[-+]?(?:\.\d+|\d+(?:\.\d*)?)(?:[eE][-+]?\d+)?$/.test(s)) return Number(s);
  if (/^[-+]?\.(?:inf|Inf|INF)$/.test(s)) return s.startsWith("-") ? -Infinity : Infinity;
  if (/^\.(?:nan|NaN|NAN)$/.test(s)) return NaN;
  return s;
}

const ESCAPES: Record<string, string> = { "0": "\0", a: "\x07", b: "\b", t: "\t", "\t": "\t", n: "\n", v: "\v", f: "\f", r: "\r", e: "\x1b", " ": " ", '"': '"', "/": "/", "\\": "\\", N: "\u0085", _: "\u00a0", L: "\u2028", P: "\u2029" };

class Reader {
  private pos = 0;
  private nodes = 0;
  private depth = 0;
  private anchors = new Map<string, unknown>();
  /** how many nodes each anchored value stands for, so an alias counts what it brings */
  private sizes = new WeakMap<object, number>();

  constructor(
    private readonly src: string,
    private readonly limits: YamlLimits,
  ) {}

  /* ---------- where we are ---------- */

  private line(at = this.pos): number {
    let n = 1;
    for (let i = 0; i < at && i < this.src.length; i++) if (this.src.charCodeAt(i) === 10) n++;
    return n;
  }
  fail(message: string, at = this.pos): never {
    throw new YamlError(message, this.line(at));
  }
  private ch(k = 0) {
    return this.src[this.pos + k] ?? "";
  }
  private atEnd() {
    return this.pos >= this.src.length;
  }
  private column(at = this.pos): number {
    const nl = this.src.lastIndexOf("\n", at - 1);
    return at - nl - 1;
  }
  /** whether only spaces stand between the start of the line and here */
  private firstOnLine(at = this.pos): boolean {
    for (let i = at - 1; i >= 0 && this.src[i] !== "\n"; i--) if (this.src[i] !== " ") return false;
    return true;
  }
  private count(n = 1) {
    this.nodes += n;
    if (this.nodes > this.limits.maxNodes) this.fail(`more than ${this.limits.maxNodes} values (aliases included)`);
  }
  private enter() {
    if (++this.depth > this.limits.maxDepth) this.fail(`nested more than ${this.limits.maxDepth} levels deep`);
  }
  private leave() {
    this.depth--;
  }

  /** spaces and tabs on this line */
  private spaces() {
    while (this.ch() === " " || this.ch() === "\t") this.pos++;
  }
  /** a comment to the end of the line, if one starts here */
  private comment() {
    if (this.ch() === "#") while (!this.atEnd() && this.ch() !== "\n") this.pos++;
  }
  /** everything up to the next content: spaces, comments, line breaks */
  private skip() {
    for (;;) {
      this.spaces();
      this.comment();
      if (this.ch() === "\n") {
        this.pos++;
        /* a tab in the indentation is not YAML */
        let i = this.pos;
        while (this.src[i] === " ") i++;
        if (this.src[i] === "\t" && this.src[i + 1] !== "\n" && this.src[i + 1] !== undefined && this.src[i + 1] !== "#") {
          let j = i;
          while (this.src[j] === "\t" || this.src[j] === " ") j++;
          if (this.src[j] !== "\n" && this.src[j] !== "#" && j < this.src.length) this.fail("a tab in the indentation (YAML indents with spaces)", i);
        }
        continue;
      }
      return;
    }
  }
  /** whether the line has nothing more but a comment */
  private restIsEmpty(): boolean {
    let i = this.pos;
    while (this.src[i] === " " || this.src[i] === "\t") i++;
    return i >= this.src.length || this.src[i] === "\n" || this.src[i] === "#";
  }
  private isSeqDash(at = this.pos) {
    const n = this.src[at + 1];
    return this.src[at] === "-" && (n === " " || n === "\n" || n === "\t" || n === undefined);
  }
  private docMarker(at = this.pos) {
    return this.column(at) === 0 && (this.src.startsWith("---", at) || this.src.startsWith("...", at)) && /[\s]|^$/.test(this.src[at + 3] ?? "");
  }

  /* ---------- the document ---------- */

  document(): unknown {
    this.skip();
    /* directives, then the marker that starts the document */
    while (this.ch() === "%" && this.column() === 0) {
      while (!this.atEnd() && this.ch() !== "\n") this.pos++;
      this.skip();
    }
    if (this.docMarker() && this.src.startsWith("---", this.pos)) {
      this.pos += 3;
      this.spaces();
    }
    const value = this.restIsEmpty() ? (this.skip(), this.atEnd() || this.docMarker() ? null : this.blockNode(-1)) : this.inline(-1, "top");
    this.skip();
    if (this.docMarker() && this.src.startsWith("...", this.pos)) {
      this.pos += 3;
      this.skip();
    }
    if (this.docMarker() && this.src.startsWith("---", this.pos)) this.fail("more than one document: a spec is one");
    if (!this.atEnd()) this.fail(`unexpected ${JSON.stringify(this.ch())}: is the indentation right?`);
    return value;
  }

  /** a node that starts at the first content of a line, at column `col` > `parent` */
  private blockNode(parent: number): unknown {
    if (this.isSeqDash()) return this.sequence(this.column());
    return this.inline(parent, "line");
  }

  /** Whatever stands here on the line: a mapping that starts with a key here, a nested sequence after a dash, a flow
   *  collection, a quoted, plain or block scalar, an anchored value or an alias. `parent` is the column of the key
   *  or dash it belongs to: what continues on later lines must be indented past it. */
  private inline(parent: number, where: "top" | "line" | "value" | "item"): unknown {
    const start = this.pos;
    const col = this.column();
    const c = this.ch();
    if (c === "&") {
      const name = this.anchorName();
      this.spaces();
      this.comment();
      const nodesBefore = this.nodes;
      let value: unknown;
      if (this.restIsEmpty()) {
        this.skip();
        value = this.atEnd() || this.column() <= parent ? null : this.blockNode(parent);
      } else value = this.inline(parent, where);
      this.anchors.set(name, value);
      if (value && typeof value === "object") this.sizes.set(value, Math.max(1, this.nodes - nodesBefore));
      return value;
    }
    if (c === "*") {
      const name = this.anchorName();
      if (!this.anchors.has(name)) this.fail(`the alias *${name} names no anchor before it`, start);
      const value = this.anchors.get(name);
      this.count(value && typeof value === "object" ? (this.sizes.get(value) ?? 1) : 1);
      /* an alias can be a mapping's key */
      this.spaces();
      if (this.ch() === ":" && /[\s]|^$/.test(this.ch(1)) && where !== "value") return this.mapping(col, typeof value === "string" ? value : String(value));
      return value;
    }
    if (c === "!") {
      /* a tag: the core schema's are read by the value itself, others are not kept */
      while (!this.atEnd() && !/[\s]/.test(this.ch())) this.pos++;
      this.spaces();
      if (this.restIsEmpty()) {
        this.comment();
        this.skip();
        return this.atEnd() || this.column() <= parent ? "" : this.blockNode(parent);
      }
      return this.inline(parent, where);
    }
    if (c === "-" && this.isSeqDash() && where !== "value") return this.sequence(col);
    if (c === "|" || c === ">") return this.blockScalar(parent);
    if (c === "[" || c === "{") {
      const v = this.flow();
      this.spaces();
      if (this.ch() === ":" && /[\s]|^$/.test(this.ch(1))) this.fail("a collection as a mapping's key is not supported", start);
      return v;
    }
    if (c === '"' || c === "'") {
      const s = c === '"' ? this.doubleQuoted() : this.singleQuoted();
      this.spaces();
      if (this.ch() === ":" && /[\s]|^$/.test(this.ch(1))) {
        if (where === "value") this.fail("a mapping cannot start on the line of its parent key", start);
        return this.mapping(col, s);
      }
      this.count();
      return s;
    }
    /* a plain scalar, or the key of a mapping that starts here */
    const keyEnd = this.plainKeyEnd();
    if (keyEnd !== null) {
      if (where === "value") this.fail("a mapping cannot start on the line of its parent key (put it on the next line, indented)", start);
      const k = this.src.slice(this.pos, keyEnd).trimEnd();
      this.pos = keyEnd;
      return this.mapping(col, String(resolvePlain(k) ?? ""), true);
    }
    this.count();
    return resolvePlain(this.plain(parent));
  }

  private anchorName(): string {
    const start = ++this.pos;
    while (!this.atEnd() && !/[\s,[\]{}]/.test(this.ch())) this.pos++;
    if (this.pos === start) this.fail("an anchor or alias with no name");
    return this.src.slice(start, this.pos);
  }

  /** where a plain key on this line ends (at its colon), or null when the line holds no `key:` here */
  private plainKeyEnd(): number | null {
    for (let i = this.pos; i < this.src.length; i++) {
      const c = this.src[i];
      if (c === "\n") return null;
      if (c === "#" && (this.src[i - 1] === " " || this.src[i - 1] === "\t")) return null;
      if (c === ":" && /[\s]|^$/.test(this.src[i + 1] ?? "")) return i;
    }
    return null;
  }

  /** a block mapping whose keys stand at column `col`; the first key read already */
  private mapping(col: number, firstKey: string, firstPlain = false): Record<string, unknown> {
    this.enter();
    const out: Record<string, unknown> = {};
    let k: string | null = firstKey;
    /* only a plain << merges: a quoted one is a key like any other */
    let plain = firstPlain;
    for (;;) {
      if (this.ch() !== ":") this.fail(`expected ":" after the key ${JSON.stringify(k)}`);
      this.pos++;
      this.count();
      const value = this.value(col);
      if (k === "<<" && plain) this.merge(out, value);
      else {
        if (Object.prototype.hasOwnProperty.call(out, k)) this.fail(`the key ${JSON.stringify(k)} appears twice in one mapping`);
        define(out, k, value);
      }
      this.skip();
      if (this.atEnd() || this.docMarker()) break;
      const c = this.column();
      if (c < col) break;
      if (c > col || !this.firstOnLine()) this.fail("bad indentation of a mapping entry");
      if (this.isSeqDash()) break;
      plain = this.ch() !== '"' && this.ch() !== "'";
      k = this.key();
    }
    this.leave();
    return out;
  }

  /** a key at the start of a line of a mapping */
  private key(): string {
    const c = this.ch();
    if (c === "?") this.fail("complex mapping keys (?) are not supported");
    if (c === '"' || c === "'") {
      const s = c === '"' ? this.doubleQuoted() : this.singleQuoted();
      this.spaces();
      return s;
    }
    if (c === "*") {
      const name = this.anchorName();
      this.spaces();
      return String(this.anchors.get(name) ?? "");
    }
    const end = this.plainKeyEnd();
    if (end === null) this.fail("expected a key followed by \":\"");
    const k = this.src.slice(this.pos, end).trimEnd();
    this.pos = end;
    return String(resolvePlain(k) ?? "");
  }

  private merge(out: Record<string, unknown>, value: unknown) {
    const all = Array.isArray(value) ? value : [value];
    for (const m of all) {
      if (!m || typeof m !== "object" || Array.isArray(m)) this.fail("a merge key (<<) takes a mapping or a list of mappings");
      for (const [k, v] of Object.entries(m as Record<string, unknown>)) if (!Object.prototype.hasOwnProperty.call(out, k)) define(out, k, v);
    }
  }

  /** the value after a mapping's colon: on the same line, or on the lines below (a sequence may stand at the key's column) */
  private value(col: number): unknown {
    this.spaces();
    if (this.restIsEmpty()) {
      this.comment();
      this.skip();
      if (this.atEnd() || this.docMarker()) return null;
      const c = this.column();
      if (c > col) return this.blockNode(col);
      if (c === col && this.isSeqDash()) return this.sequence(col);
      return null;
    }
    return this.inline(col, "value");
  }

  /** a block sequence whose dashes stand at column `col` */
  private sequence(col: number): unknown[] {
    this.enter();
    const out: unknown[] = [];
    for (;;) {
      if (!this.isSeqDash()) this.fail('expected "- " for the next item');
      this.pos++;
      this.count();
      this.spaces();
      let item: unknown;
      if (this.restIsEmpty()) {
        this.comment();
        this.skip();
        item = this.atEnd() || this.docMarker() || this.column() <= col ? null : this.blockNode(col);
      } else item = this.inline(col, "item");
      out.push(item);
      this.skip();
      if (this.atEnd() || this.docMarker()) break;
      const c = this.column();
      if (c < col || (c === col && !this.isSeqDash())) break;
      if (c > col) this.fail("bad indentation of a sequence item");
    }
    this.leave();
    return out;
  }

  /** A plain scalar: the rest of this line, and the lines below indented past `parent` that are not something else,
   *  folded with spaces (an empty line between is a line break). */
  private plain(parent: number): string {
    const parts: string[] = [];
    let s = this.plainLine();
    parts.push(s);
    for (;;) {
      const save = this.pos;
      /* the next line, if it goes on with this scalar */
      let breaks = 0;
      let i = this.pos;
      for (;;) {
        while (this.src[i] === " " || this.src[i] === "\t") i++;
        if (this.src[i] === "\n") {
          breaks++;
          i++;
          continue;
        }
        break;
      }
      if (!breaks || i >= this.src.length || this.src[i] === "#") break;
      const at = i;
      this.pos = at;
      if (this.column() <= parent || this.docMarker() || (this.isSeqDash() && this.column() <= parent + 1) || this.plainKeyEnd() !== null) {
        this.pos = save;
        break;
      }
      s = this.plainLine();
      parts.push(breaks > 1 ? "\n".repeat(breaks - 1) : " ", s);
    }
    return parts.join("").replace(/ (\n+) /g, "$1");
  }

  /** the plain scalar's words on this line, up to a comment or the end */
  private plainLine(): string {
    const start = this.pos;
    while (!this.atEnd()) {
      const c = this.ch();
      if (c === "\n") break;
      if (c === "#" && (this.src[this.pos - 1] === " " || this.src[this.pos - 1] === "\t")) break;
      if (c === ":" && /[\s]|^$/.test(this.ch(1))) this.fail("a plain scalar cannot hold \": \": quote it");
      this.pos++;
    }
    return this.src.slice(start, this.pos).trim();
  }

  private doubleQuoted(): string {
    const start = this.pos++;
    let out = "";
    for (;;) {
      if (this.atEnd()) this.fail("a double-quoted string that never ends", start);
      const c = this.ch();
      if (c === '"') {
        this.pos++;
        return out;
      }
      if (c === "\\") {
        const e = this.ch(1);
        if (e === "\n") {
          this.pos += 2;
          while (this.ch() === " " || this.ch() === "\t") this.pos++;
          continue;
        }
        if (e === "x" || e === "u" || e === "U") {
          const n = e === "x" ? 2 : e === "u" ? 4 : 8;
          const hex = this.src.slice(this.pos + 2, this.pos + 2 + n);
          if (!new RegExp(`^[0-9a-fA-F]{${n}}$`).test(hex)) this.fail(`a bad \\${e} escape`);
          out += String.fromCodePoint(parseInt(hex, 16));
          this.pos += 2 + n;
          continue;
        }
        if (!(e in ESCAPES)) this.fail(`an unknown escape \\${e}`);
        out += ESCAPES[e];
        this.pos += 2;
        continue;
      }
      if (c === "\n") {
        out = out.replace(/[ \t]+$/, "") + this.folded();
        continue;
      }
      out += c;
      this.pos++;
    }
  }

  private singleQuoted(): string {
    const start = this.pos++;
    let out = "";
    for (;;) {
      if (this.atEnd()) this.fail("a single-quoted string that never ends", start);
      const c = this.ch();
      if (c === "'") {
        if (this.ch(1) === "'") {
          out += "'";
          this.pos += 2;
          continue;
        }
        this.pos++;
        return out;
      }
      if (c === "\n") {
        out = out.replace(/[ \t]+$/, "") + this.folded();
        continue;
      }
      out += c;
      this.pos++;
    }
  }

  /** a line break inside a quoted string: one becomes a space, more become one line break fewer */
  private folded(): string {
    let breaks = 0;
    while (this.ch() === "\n") {
      breaks++;
      this.pos++;
      while (this.ch() === " " || this.ch() === "\t") this.pos++;
    }
    return breaks === 1 ? " " : "\n".repeat(breaks - 1);
  }

  /** a literal (|) or folded (>) block scalar under a key or dash at column `parent` */
  private blockScalar(parent: number): string {
    const style = this.ch();
    this.pos++;
    let chomp: "clip" | "strip" | "keep" = "clip";
    let explicit = 0;
    for (let k = 0; k < 2; k++) {
      const c = this.ch();
      if (c === "-") chomp = "strip";
      else if (c === "+") chomp = "keep";
      else if (/[1-9]/.test(c)) explicit = Number(c);
      else break;
      this.pos++;
    }
    this.spaces();
    this.comment();
    if (this.ch() !== "\n" && !this.atEnd()) this.fail("a block scalar's indicator takes nothing more on its line");
    this.pos++;
    const lines: string[] = [];
    let indent = explicit ? Math.max(0, parent) + explicit : -1;
    /* the lines that belong to it: empty ones, and those indented past its parent */
    for (;;) {
      if (this.atEnd()) break;
      const lineStart = this.pos;
      let i = lineStart;
      while (this.src[i] === " ") i++;
      const end = this.src.indexOf("\n", i);
      const lineEnd = end < 0 ? this.src.length : end;
      const blank = i === lineEnd || this.src.slice(i, lineEnd).trim() === "";
      const ind = i - lineStart;
      if (!blank) {
        if (indent < 0) {
          if (ind <= parent) break;
          indent = ind;
        }
        if (ind < indent) break;
        if (ind === 0 && this.docMarker(i)) break;
      }
      lines.push(blank ? this.src.slice(lineStart + Math.min(Math.max(indent, 0), lineEnd - lineStart), lineEnd).replace(/^ +$/, "") : this.src.slice(lineStart + indent, lineEnd));
      this.pos = end < 0 ? this.src.length : end + 1;
    }
    /* the trailing empty lines are the chomping's to decide */
    let tail = 0;
    while (lines.length && lines[lines.length - 1] === "") {
      lines.pop();
      tail++;
    }
    if (!this.atEnd() && this.src[this.pos - 1] === "\n") this.pos--;
    let body: string;
    if (style === "|") body = lines.join("\n");
    else {
      /* folding: a break between two lines of words is a space, empty lines are breaks, and the breaks around a
         more-indented line stay as they are */
      body = "";
      let empty = 0;
      let read = false;
      let moreBefore = false;
      for (const l of lines) {
        if (l === "") {
          empty++;
          continue;
        }
        const more = l.startsWith(" ") || l.startsWith("\t");
        if (more) body += "\n".repeat(read ? 1 + empty : empty);
        else if (moreBefore) body += "\n".repeat(empty + 1);
        else if (empty === 0) body += read ? " " : "";
        else body += "\n".repeat(empty);
        body += l;
        moreBefore = more;
        read = true;
        empty = 0;
      }
    }
    this.count();
    if (!lines.length) return chomp === "keep" ? "\n".repeat(tail) : "";
    return body + (chomp === "strip" ? "" : chomp === "keep" ? "\n".repeat(tail + 1) : "\n");
  }

  /* ---------- flow collections ---------- */

  private flowSkip() {
    for (;;) {
      while (this.ch() === " " || this.ch() === "\t" || this.ch() === "\n") this.pos++;
      if (this.ch() === "#" && /[\s]/.test(this.src[this.pos - 1] ?? "\n")) {
        this.comment();
        continue;
      }
      return;
    }
  }

  private flow(): unknown {
    this.enter();
    const open = this.ch();
    const start = this.pos++;
    const close = open === "[" ? "]" : "}";
    const list: unknown[] = [];
    const map: Record<string, unknown> = {};
    for (;;) {
      this.flowSkip();
      if (this.atEnd()) this.fail(`a ${open} that is never closed`, start);
      if (this.ch() === close) {
        this.pos++;
        break;
      }
      const k = this.flowNode();
      this.flowSkip();
      let v: unknown = undefined;
      const isPair = this.ch() === ":";
      if (isPair) {
        this.pos++;
        this.flowSkip();
        v = this.ch() === "," || this.ch() === close ? null : this.flowNode();
        this.flowSkip();
      }
      if (open === "[") list.push(isPair ? { [String(k)]: v } : k);
      else define(map, String(k ?? ""), isPair ? v : null);
      this.count();
      if (this.ch() === ",") {
        this.pos++;
        continue;
      }
      if (this.atEnd()) this.fail(`a ${open} that is never closed`, start);
      if (this.ch() !== close) this.fail(`expected "," or "${close}" in a flow collection`);
    }
    this.leave();
    return open === "[" ? list : map;
  }

  private flowNode(): unknown {
    const c = this.ch();
    if (c === "[" || c === "{") return this.flow();
    if (c === '"') return this.doubleQuoted();
    if (c === "'") return this.singleQuoted();
    if (c === "*") {
      const name = this.anchorName();
      if (!this.anchors.has(name)) this.fail(`the alias *${name} names no anchor before it`);
      const value = this.anchors.get(name);
      this.count(value && typeof value === "object" ? (this.sizes.get(value) ?? 1) : 1);
      return value;
    }
    if (c === "&") {
      const name = this.anchorName();
      this.flowSkip();
      const nodesBefore = this.nodes;
      const v = this.flowNode();
      this.anchors.set(name, v);
      if (v && typeof v === "object") this.sizes.set(v, Math.max(1, this.nodes - nodesBefore));
      return v;
    }
    const start = this.pos;
    while (!this.atEnd()) {
      const ch = this.ch();
      if (ch === "," || ch === "[" || ch === "]" || ch === "{" || ch === "}") break;
      if (ch === ":" && /[\s,[\]{}]|^$/.test(this.ch(1))) break;
      if (ch === "#" && /[\s]/.test(this.src[this.pos - 1] ?? "")) break;
      this.pos++;
    }
    return resolvePlain(this.src.slice(start, this.pos).replace(/\s*\n\s*/g, " ").trim());
  }
}

/** a key set on an object, a `__proto__` included, without reaching its prototype */
function define(o: Record<string, unknown>, k: string, v: unknown) {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

/** Reads a YAML text (one document; JSON is YAML too) into plain data. Mapping keys are strings. Throws a YamlError
 *  that names the line when the text is not YAML, or asks for more than the limits allow. */
export function parseYaml(text: string, limits: Partial<YamlLimits> = {}): unknown {
  const l = { ...YAML_LIMITS, ...limits };
  if (text.length > l.maxChars) throw new YamlError(`the text is longer than ${l.maxChars} characters`, 1);
  const src = text.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
  return new Reader(src, l).document();
}

/** Reads a spec's text: JSON when it is JSON, else YAML. The same errors as parseYaml, JSON's included. */
export function parseSpecText(text: string, limits: Partial<YamlLimits> = {}): unknown {
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const l = { ...YAML_LIMITS, ...limits };
      if (t.length > l.maxChars) throw new YamlError(`the text is longer than ${l.maxChars} characters`, 1);
      return JSON.parse(t);
    } catch (e) {
      if (e instanceof YamlError) throw e;
      /* flow-style YAML is not always JSON */
    }
  }
  return parseYaml(text, limits);
}
