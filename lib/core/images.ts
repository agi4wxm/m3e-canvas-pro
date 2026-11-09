/* The pictures an agent or a client may put on the canvas: drawn into the document (a data: URL) or one of the
 * project's own (`m3e-asset:`). An outside address is refused: a hotlinked picture can vanish, refuse to be drawn
 * into a screenshot or an exported app, or track whoever opens the prototype; the generative tools paint one instead.
 * An SVG handed over as a data URL is held to what the vector atom allows (parts/svg.ts `sanitizeSvg`), like any SVG
 * the document takes in. The editor's own panels are not held to this: what the author pastes is theirs. */

import { cleanToMarkup, sanitizeSvg } from "../../parts/svg";
import { ASSET_ID } from "../assetManifest";

const RASTER = /^data:image\/(png|jpe?g|gif|webp|avif|bmp)(;[\w=.+-]+)*;base64,[A-Za-z0-9+/\s]+=*$/i;
const SVG = /^data:image\/svg\+xml/i;
const ASSET = /^m3e-asset:/;
/** one of the asset pipeline's, by its id in the manifest (lib/assetRefs.ts): whether the manifest has it is the
 *  export's report to say, not a reason to refuse it here */
const PIPELINE = (url: string) => url.startsWith("asset:") && ASSET_ID.test(url.slice(6));

/** what to do instead of an outside picture */
export const PICTURE_HINT = "generate_image paints a picture (a photo, an illustration) into the document, generate_svg draws a vector one; or use an icon or an image placeholder (\"\").";

/** the markup an SVG data URL carries, or null when it is not one that can be read */
function svgMarkup(url: string): string | null {
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  const head = url.slice(0, comma);
  const body = url.slice(comma + 1);
  try {
    if (/;base64$/i.test(head)) return typeof atob === "function" ? new TextDecoder().decode(Uint8Array.from(atob(body.replace(/\s/g, "")), (c) => c.charCodeAt(0))) : null;
    return decodeURIComponent(body);
  } catch {
    return null;
  }
}

/** An SVG data URL as the sanitizer leaves it (written out again, URL-encoded), or null when nothing that draws is
 *  left of it. */
export function cleanSvgUrl(url: string): string | null {
  const markup = svgMarkup(url);
  const clean = markup ? sanitizeSvg(markup) : null;
  return clean ? `data:image/svg+xml;utf8,${encodeURIComponent(cleanToMarkup(clean))}` : null;
}

/** why a picture's address will not do on the canvas, or null when it will */
export function pictureError(v: unknown): string | null {
  if (typeof v !== "string") return "should be a picture's address (a data:image URL) or \"\"";
  const url = v.trim();
  if (!url || ASSET.test(url) || PIPELINE(url) || RASTER.test(url)) return null;
  if (SVG.test(url)) return cleanSvgUrl(url) ? null : "is an SVG with nothing left that draws once cleaned (no scripts, no outside links)";
  if (/^https?:/i.test(url)) return `is an outside address, which is not accepted (it may not load, be drawn or be exported). ${PICTURE_HINT}`;
  if (/^data:image\//i.test(url)) return "is a data:image URL that cannot be read: use base64 PNG, JPEG, GIF or WebP, or SVG";
  return "should be a data:image URL, one of the project's pictures, or asset:<id> for one of the asset manifest's";
}

/** Arguments with every SVG data URL in them run through the sanitizer; one with nothing left that draws stays as it
 *  was, for the operation to refuse with its reason. */
export function picturesCleaned(v: unknown): unknown {
  if (typeof v === "string") return SVG.test(v) ? (cleanSvgUrl(v) ?? v) : v;
  if (Array.isArray(v)) {
    const out = v.map(picturesCleaned);
    return out.some((x, i) => x !== v[i]) ? out : v;
  }
  if (v && typeof v === "object") {
    let out: Record<string, unknown> | null = null;
    for (const [k, x] of Object.entries(v)) {
      const y = picturesCleaned(x);
      if (y === x) continue;
      out ??= { ...(v as Record<string, unknown>) };
      out[k] = y;
    }
    return out ?? v;
  }
  return v;
}
