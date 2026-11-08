/* Bytes without the platform: base64 and UTF-8 written out by hand, since a mini-program has neither atob nor
 * TextEncoder, and data URLs, which is how the mock library keeps and hands out files. */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX: Record<string, number> = Object.fromEntries([...B64].map((c, i) => [c, i]));

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + "=";
  }
  return out;
}

/** the bytes of base64 text; characters outside the alphabet are skipped */
export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64_INDEX[clean[i]] << 18) | (B64_INDEX[clean[i + 1]] << 12) | ((B64_INDEX[clean[i + 2]] ?? 0) << 6) | (B64_INDEX[clean[i + 3]] ?? 0);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length && i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (o < out.length && i + 3 < clean.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

/** text as UTF-8 bytes */
export function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

/** UTF-8 bytes as text; a byte that is not UTF-8 reads as U+FFFD */
export function fromUtf8(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    const need = b < 0x80 ? 0 : b >= 0xf0 && b < 0xf8 ? 3 : b >= 0xe0 ? 2 : b >= 0xc2 && b < 0xe0 ? 1 : -1;
    let c = need === 0 ? b : need === 1 ? b & 31 : need === 2 ? b & 15 : b & 7;
    let ok = need >= 0 && i + need < bytes.length + (need ? 0 : 1);
    for (let k = 1; ok && k <= need; k++) {
      const x = bytes[i + k];
      if ((x & 0xc0) !== 0x80) ok = false;
      else c = (c << 6) | (x & 63);
    }
    if (!ok || c > 0x10ffff || (c >= 0xd800 && c < 0xe000)) {
      out += "\ufffd";
      i++;
      continue;
    }
    out += String.fromCodePoint(c);
    i += need + 1;
  }
  return out;
}

/** a data URL of bytes */
export const dataUrl = (type: string, bytes: Uint8Array) => `data:${type};base64,${toBase64(bytes)}`;

/** what a data URL holds: its media type and its bytes; null for anything else */
export function parseDataUrl(url: string): { type: string; bytes: Uint8Array } | null {
  const m = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/.exec(url.slice(0, 300));
  if (!m) return null;
  const head = url.indexOf(",");
  const body = url.slice(head + 1);
  const base64 = /;base64/i.test(m[2]);
  let bytes: Uint8Array;
  if (base64) bytes = fromBase64(body);
  else {
    try {
      bytes = utf8(decodeURIComponent(body));
    } catch {
      return null;
    }
  }
  return { type: m[1] || "text/plain", bytes };
}

/** how many bytes a data URL holds, without decoding it */
export function dataUrlSize(url: string): number {
  const head = url.indexOf(",");
  if (head < 0) return 0;
  if (!/;base64/i.test(url.slice(0, head))) return url.length - head - 1;
  const body = url.length - head - 1;
  const pad = url.endsWith("==") ? 2 : url.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((body * 3) / 4) - pad);
}
