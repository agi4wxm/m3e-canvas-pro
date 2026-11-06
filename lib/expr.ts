/* What a number field reads when someone types more than a number: a little arithmetic, the way a design tool's
 * fields take `12*2` or `100/3+8`. A tiny recursive-descent reader over + - * / % ( ) and decimals; nothing is
 * evaluated as code. `x` and `×` multiply too, `÷` divides, and a leading operator applies to the current value
 * (`+8` adds eight, `*2` doubles), so a field can be nudged by typing. */

type Tok = { k: "num"; v: number } | { k: "op"; v: string };

function tokens(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) return null;
      out.push({ k: "num", v });
      i = j;
      continue;
    }
    const op = c === "×" || c === "x" || c === "X" ? "*" : c === "÷" ? "/" : c === "−" ? "-" : c;
    if (!"+-*/%()".includes(op)) return null;
    out.push({ k: "op", v: op });
    i++;
  }
  return out;
}

/** The value of an arithmetic expression, or null when it is not one (or divides by nothing). */
export function evalExpr(src: string): number | null {
  const ts = tokens(src.trim());
  if (!ts || !ts.length) return null;
  let at = 0;
  const peek = () => ts[at];
  const take = () => ts[at++];
  const isOp = (t: Tok | undefined, v: string) => t?.k === "op" && t.v === v;
  /* sum := product (('+' | '-') product)* */
  const sum = (): number | null => {
    let v = product();
    while (v !== null && (isOp(peek(), "+") || isOp(peek(), "-"))) {
      const op = take().v;
      const r = product();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  /* product := unary (('*' | '/' | '%') unary)* */
  const product = (): number | null => {
    let v = unary();
    while (v !== null && (isOp(peek(), "*") || isOp(peek(), "/") || isOp(peek(), "%"))) {
      const op = take().v;
      const r = unary();
      if (r === null) return null;
      if ((op === "/" || op === "%") && r === 0) return null;
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  };
  const unary = (): number | null => {
    if (isOp(peek(), "-")) {
      take();
      const v = unary();
      return v === null ? null : -v;
    }
    if (isOp(peek(), "+")) {
      take();
      return unary();
    }
    return atom();
  };
  const atom = (): number | null => {
    const t = take();
    if (!t) return null;
    if (t.k === "num") return t.v;
    if (t.v === "(") {
      const v = sum();
      if (!isOp(take(), ")")) return null;
      return v;
    }
    return null;
  };
  const v = sum();
  return v !== null && at === ts.length && Number.isFinite(v) ? v : null;
}

/** What a field comes to when `text` is typed over `current`: an expression, or an operator first that applies to
 *  the current value (`+8`, `*2`, `/2`). A bare `-8` is a negative number, not a step down. Null when unreadable. */
export function readNumber(text: string, current?: number): number | null {
  const s = text.trim();
  if (!s) return null;
  if (current !== undefined && Number.isFinite(current) && /^[*/×÷x%]/.test(s)) return evalExpr(`${current}${s}`);
  if (current !== undefined && Number.isFinite(current) && s.startsWith("+")) return evalExpr(`${current}${s}`);
  return evalExpr(s);
}
