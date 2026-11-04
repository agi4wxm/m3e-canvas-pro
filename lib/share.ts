import { Doc, Group, Item } from "./tokens";
import { openProject } from "./project";
import { partBySlug, withoutPickedImages } from "../parts/registry";

/* A design travels in a link: the document as JSON, deflated and base64url-encoded
 * after `#docz=`, or plain JSON after `#doc=` for tools that cannot compress. The
 * fragment never reaches the server, so the static site stays static. */

export const DOC_PARAM = "doc";
export const DOCZ_PARAM = "docz";

/** the item without what a link should not carry: an image prop that is a picked file's data
 *  (a web address stays), and the AI rewrite history */
function shareableItem({ noteHistory: _h, ...out }: Item): Item {
  const def = out.props ? partBySlug(out.component) : undefined;
  return def && out.props ? { ...out, props: withoutPickedImages(def, out.props) } : out;
}

/** a group a link can carry: what an instance overrides with a picked file goes the way the file's own prop does */
const shareableGroup = (g: Group): Group => {
  const overrides = g.overrides && Object.fromEntries(Object.entries(g.overrides).filter(([, v]) => !(typeof v === "string" && v.startsWith("data:"))));
  return { ...g, items: g.items.map(shareableItem), ...(overrides ? { overrides } : {}) };
};

export function shareable(doc: Doc): Doc {
  return {
    ...doc,
    frames: doc.frames.map(({ noteHistory: _h, ...f }) => f),
    groups: doc.groups.map(shareableGroup),
    ...(doc.components ? { components: doc.components.map((c) => ({ ...c, groups: c.groups.map(shareableGroup) })) } : {}),
  };
}

const toBase64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function pipe(bytes: Uint8Array, stream: { readable: ReadableStream; writable: WritableStream }): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  /* the writer's own promises reject too on bad input; the read below reports the failure */
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/** the link that opens `doc` at `base` (the app URL without a hash) */
export async function shareLink(doc: Doc, base: string): Promise<string> {
  const json = JSON.stringify(shareable(doc));
  if (typeof CompressionStream !== "undefined") {
    try {
      const packed = await pipe(new TextEncoder().encode(json), new CompressionStream("deflate-raw"));
      return `${base}#${DOCZ_PARAM}=${toBase64Url(packed)}`;
    } catch {
      // An available CompressionStream may not support raw deflate. The plain
      // encoding below carries the same filtered document without compression.
    }
  }
  return `${base}#${DOC_PARAM}=${encodeURIComponent(json)}`;
}

/** the document a hash carries, or null when it carries none or a broken one */
export async function readShareHash(hash: string): Promise<Doc | null> {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  try {
    let json: string | null = null;
    const packed = params.get(DOCZ_PARAM);
    if (packed) {
      const bytes = await pipe(fromBase64Url(packed), new DecompressionStream("deflate-raw"));
      json = new TextDecoder().decode(bytes);
    } else {
      json = params.get(DOC_PARAM);
    }
    if (!json) return null;
    return openProject(JSON.parse(json));
  } catch {
    return null;
  }
}

/** whether a hash claims to carry a document at all */
export const hasShareHash = (hash: string) => {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.has(DOCZ_PARAM) || params.has(DOC_PARAM);
};
