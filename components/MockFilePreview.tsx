import { useEffect, useMemo, useRef, useState } from "react";
import { gunzipSync, unzipSync } from "fflate";
import type { Palette } from "@/lib/tokens";
import type { MockFile } from "@/lib/mocks/types";
import { fromUtf8, parseDataUrl } from "@/lib/mocks/bytes";
import { formatOf, kindOfType } from "@/lib/mocks/files";
import { t, useLang } from "@/lib/i18n";
import { Icon } from "./Icon";
import { drawMesh, meshOfBytes, type Mesh } from "@/parts/widgets/mesh";

/* What a file of the mock library holds, seen in the Mocks tab: a picture, a sound or a clip as the browser plays it;
 * a PDF's pages; a table (CSV, TSV, XLSX); a document's or a deck's words (DOCX, PPTX); an archive's files (ZIP, tar,
 * gzip); a 3D model drawn on a canvas with its counts (GLB, glTF, OBJ, STL, PLY); any text as text; and the first
 * bytes of anything else. Loaded with the first file shown, never with the editor: it reads files with fflate and
 * DOMParser, which the mock library itself must not. */

/** what a preview shows */
type Seen =
  | { kind: "media" }
  | { kind: "pdf"; pages: number; lines: string[] }
  | { kind: "table"; columns: string[]; rows: string[][]; total: number }
  | { kind: "words"; blocks: string[][]; unit: "slides" | "paragraphs" }
  | { kind: "entries"; entries: { name: string; size: number }[] }
  | { kind: "mesh"; mesh: Mesh }
  | { kind: "text"; text: string }
  | { kind: "bytes"; hex: string }
  | { kind: "none" };

const MAX_ROWS = 200;

/* ---------- reading ---------- */

/** CSV or TSV rows (RFC 4180 quotes for CSV) */
function delimited(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length && rows.length <= MAX_ROWS; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && sep === "," && cell === "") quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

const xmlOf = (bytes: Uint8Array | undefined) => (bytes ? new DOMParser().parseFromString(fromUtf8(bytes), "application/xml") : undefined);
/** the elements of a document by their local name, whatever their namespace prefix */
const byName = (root: Document | Element | undefined, name: string) => (root ? [...root.getElementsByTagNameNS("*", name)] : []);

/** the first sheet of a workbook, its cells as text */
function xlsxTable(files: Record<string, Uint8Array>): Seen {
  const strings = byName(xmlOf(files["xl/sharedStrings.xml"]), "si").map((si) => byName(si, "t").map((x) => x.textContent ?? "").join(""));
  const sheetPath = Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]))[0];
  const sheet = xmlOf(files[sheetPath]);
  const rows: string[][] = [];
  const all = byName(sheet, "row");
  for (const r of all.slice(0, MAX_ROWS + 1)) {
    const out: string[] = [];
    for (const c of byName(r, "c")) {
      const ref = c.getAttribute("r") ?? "";
      const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "";
      const col = letters ? [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : out.length;
      const type = c.getAttribute("t");
      const v = byName(c, "v")[0]?.textContent ?? "";
      out[col] = type === "s" ? (strings[Number(v)] ?? "") : type === "inlineStr" ? byName(c, "t").map((x) => x.textContent ?? "").join("") : type === "b" ? (v === "1" ? "TRUE" : "FALSE") : v;
    }
    rows.push(Array.from(out, (x) => x ?? ""));
  }
  const [head = [], ...body] = rows;
  return { kind: "table", columns: head, rows: body, total: Math.max(0, all.length - 1) };
}

/** a document's paragraphs, or a deck's words slide by slide */
function officeWords(files: Record<string, Uint8Array>, deck: boolean): Seen {
  if (deck) {
    const slides = Object.keys(files)
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]))
      .map((k) => byName(xmlOf(files[k]), "p").map((p) => byName(p, "t").map((x) => x.textContent ?? "").join("")).filter(Boolean));
    return { kind: "words", blocks: slides, unit: "slides" };
  }
  const paragraphs = byName(xmlOf(files["word/document.xml"]), "p").map((p) => byName(p, "t").map((x) => x.textContent ?? "").join(""));
  return { kind: "words", blocks: [paragraphs.filter(Boolean)], unit: "paragraphs" };
}

/** the files of a tar archive */
function tarEntries(bytes: Uint8Array): { name: string; size: number }[] {
  const out: { name: string; size: number }[] = [];
  for (let at = 0; at + 512 <= bytes.length && out.length < 500; ) {
    const head = bytes.subarray(at, at + 512);
    if (head.every((b) => b === 0)) break;
    const text = (from: number, len: number) => fromUtf8(head.subarray(from, from + len)).replace(/\0[\s\S]*$/, "");
    const size = parseInt(text(124, 12).trim() || "0", 8) || 0;
    const prefix = text(345, 155);
    out.push({ name: prefix ? `${prefix}/${text(0, 100)}` : text(0, 100), size });
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

/** what a file holds, read for its preview */
export function seeFile(file: MockFile): Seen {
  const parsed = parseDataUrl(file.data);
  if (!parsed) return { kind: "none" };
  const bytes = parsed.bytes;
  const kind = kindOfType(file.type);
  const ext = formatOf(file.type)?.ext ?? "";
  try {
    if (kind === "image" || kind === "audio" || kind === "video") return { kind: "media" };
    if (ext === "pdf") {
      const text = String.fromCharCode(...bytes.subarray(0, 400_000));
      const pages = (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
      const lines = [...text.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((m) => m[1].replace(/\\(.)/g, "$1")).slice(0, 60);
      return { kind: "pdf", pages, lines };
    }
    if (ext === "csv" || ext === "tsv") {
      const rows = delimited(fromUtf8(bytes), ext === "csv" ? "," : "\t");
      const [head = [], ...body] = rows;
      return { kind: "table", columns: head, rows: body.slice(0, MAX_ROWS), total: fromUtf8(bytes).split(/\r?\n/).filter(Boolean).length - 1 };
    }
    if (ext === "xlsx") return xlsxTable(unzipSync(bytes));
    if (ext === "docx") return officeWords(unzipSync(bytes), false);
    if (ext === "pptx") return officeWords(unzipSync(bytes), true);
    if (ext === "zip") return { kind: "entries", entries: Object.entries(unzipSync(bytes)).map(([name, b]) => ({ name, size: b.length })) };
    if (ext === "tar") return { kind: "entries", entries: tarEntries(bytes) };
    if (ext === "gz") {
      const inner = gunzipSync(bytes);
      return { kind: "text", text: fromUtf8(inner.subarray(0, 8000)) };
    }
    if (ext === "glb" || ext === "gltf" || ext === "stl" || ext === "obj" || ext === "ply") {
      const mesh = meshOfBytes(bytes, ext);
      return mesh ? { kind: "mesh", mesh } : { kind: "none" };
    }
    if (formatOf(file.type)?.text || file.type.startsWith("text/") || /json|xml|yaml/.test(file.type)) {
      let text = fromUtf8(bytes.subarray(0, 12_000));
      if (/json/.test(file.type) && bytes.length < 400_000)
        try {
          text = JSON.stringify(JSON.parse(fromUtf8(bytes)), (_k, v) => (typeof v === "string" && v.startsWith("data:") && v.length > 80 ? `${v.slice(0, 48)}…` : v), 2).slice(0, 12_000);
        } catch {
          /* shown as it is */
        }
      return { kind: "text", text };
    }
    const hex = [...bytes.subarray(0, 192)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
    return { kind: "bytes", hex };
  } catch {
    return { kind: "none" };
  }
}

/* ---------- drawing a mesh ---------- */

function MeshView({ mesh, size, p, spin }: { mesh: Mesh; size: number; p: Palette; spin: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [yaw, setYaw] = useState(0.7);
  const drag = useRef<{ x: number; yaw: number } | null>(null);
  useEffect(() => {
    if (ref.current) drawMesh(ref.current, mesh, yaw, p.surfaceContainerHigh);
  }, [mesh, yaw, p.surfaceContainerHigh]);
  useEffect(() => {
    if (!spin || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const tick = () => {
      if (!drag.current) setYaw((y) => y + 0.01);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [spin]);
  return (
    <canvas
      ref={ref}
      data-mocks-mesh-canvas
      width={size}
      height={Math.round(size * 0.66)}
      style={{ width: "100%", height: "100%", objectFit: "contain", cursor: spin ? "grab" : "default", touchAction: "none" }}
      onPointerDown={(e) => {
        if (!spin) return;
        drag.current = { x: e.clientX, yaw };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => drag.current && setYaw(drag.current.yaw + (e.clientX - drag.current.x) / 80)}
      onPointerUp={() => (drag.current = null)}
    />
  );
}

/* ---------- the views ---------- */

const mono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, lineHeight: 1.45 };
const fmt = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/** a short line of what a file holds: its pages, rows, slides, files or mesh */
export function FileFacts({ file, p }: { file: MockFile; p: Palette }) {
  const lang = useLang();
  const seen = useMemo(() => seeFile(file), [file]);
  const text =
    seen.kind === "pdf"
      ? fmt(t("mocksPreviewPages", lang), { n: seen.pages })
      : seen.kind === "table"
        ? fmt(t("mocksPreviewRows", lang), { rows: seen.total, columns: seen.columns.length })
        : seen.kind === "words"
          ? fmt(t(seen.unit === "slides" ? "mocksPreviewSlides" : "mocksPreviewParagraphs", lang), { n: seen.unit === "slides" ? seen.blocks.length : seen.blocks[0]?.length ?? 0 })
          : seen.kind === "entries"
            ? fmt(t("mocksPreviewEntries", lang), { n: seen.entries.length })
            : seen.kind === "mesh"
              ? fmt(t("mocksPreviewMesh", lang), { vertices: seen.mesh.positions.length / 3, triangles: Math.floor(seen.mesh.indices.length / 3) })
              : "";
  return text ? (
    <span data-mocks-file-facts style={{ fontSize: 11, color: p.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {text}
    </span>
  ) : null;
}

/** A file's preview: `small` for a card's thumbnail, else the whole of what it shows. */
export function FilePreview({ file, p, small }: { file: MockFile; p: Palette; small?: boolean }) {
  const lang = useLang();
  const seen = useMemo(() => seeFile(file), [file]);
  const blob = useMemo(() => {
    if (small || seen.kind !== "pdf") return undefined;
    const bytes = parseDataUrl(file.data)?.bytes;
    return bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" })) : undefined;
  }, [file, seen.kind, small]);
  useEffect(() => () => void (blob && URL.revokeObjectURL(blob)), [blob]);
  const box: React.CSSProperties = { width: "100%", height: "100%", overflow: "hidden", boxSizing: "border-box", color: p.onSurface, textAlign: "left" };
  const kind = kindOfType(file.type);
  if (seen.kind === "media")
    return kind === "image" ? (
      <img src={file.data} alt={file.name} style={{ width: "100%", height: "100%", objectFit: small ? "cover" : "contain" }} />
    ) : kind === "video" ? (
      <video src={file.data} muted loop playsInline autoPlay controls={!small} style={{ width: "100%", height: "100%", objectFit: small ? "cover" : "contain" }} />
    ) : (
      <audio src={file.data} controls style={{ width: "100%" }} />
    );
  if (seen.kind === "mesh") return <MeshView mesh={seen.mesh} size={small ? 240 : 640} p={p} spin={!small} />;
  if (seen.kind === "table") {
    const rows = seen.rows.slice(0, small ? 5 : MAX_ROWS);
    const cols = seen.columns.slice(0, small ? 4 : 30);
    return (
      <div data-mocks-preview-table style={{ ...box, overflow: small ? "hidden" : "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: small ? 9 : 12, width: small ? "100%" : undefined }}>
          <thead>
            <tr>{cols.map((c, i) => <th key={i} style={{ textAlign: "left", padding: small ? "1px 3px" : "4px 8px", background: p.surfaceContainerHighest, whiteSpace: "nowrap", fontWeight: 600 }}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, y) => (
              <tr key={y}>{cols.map((_, x) => <td key={x} style={{ padding: small ? "1px 3px" : "3px 8px", borderTop: `1px solid ${p.outlineVariant}`, whiteSpace: "nowrap", maxWidth: small ? 60 : 280, overflow: "hidden", textOverflow: "ellipsis" }}>{r[x] ?? ""}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (seen.kind === "pdf")
    return small ? (
      <div style={{ ...box, padding: 6, display: "flex", flexDirection: "column", gap: 2, background: "#fff", color: "#333" }}>
        {seen.lines.slice(0, 7).map((l, i) => (
          <div key={i} style={{ fontSize: i ? 7 : 9, fontWeight: i ? 400 : 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l}</div>
        ))}
      </div>
    ) : (
      <div style={{ ...box, display: "flex", flexDirection: "column", gap: 8 }}>
        {blob && (
          <object data-mocks-preview-pdf data={blob} type="application/pdf" style={{ width: "100%", flex: "1 1 auto", minHeight: 360, border: "none", borderRadius: 8 }}>
            <pre style={{ ...mono, whiteSpace: "pre-wrap", margin: 0 }}>{seen.lines.join("\n")}</pre>
          </object>
        )}
        {blob && (
          <a href={blob} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: p.primary }}>
            {t("mocksPreviewOpen", lang)}
          </a>
        )}
      </div>
    );
  if (seen.kind === "words")
    return (
      <div style={{ ...box, overflow: small ? "hidden" : "auto", display: "flex", flexDirection: "column", gap: small ? 2 : 10, padding: small ? 6 : 0 }}>
        {seen.blocks.slice(0, small ? 1 : 40).map((block, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2, padding: seen.unit === "slides" && !small ? 10 : 0, borderRadius: 8, background: seen.unit === "slides" && !small ? p.surfaceContainerHigh : "transparent" }}>
            {block.slice(0, small ? 6 : 60).map((line, k) => (
              <div key={k} style={{ fontSize: small ? (k ? 7 : 9) : k ? 12 : 14, fontWeight: k ? 400 : 700, whiteSpace: small ? "nowrap" : "normal", overflow: "hidden", textOverflow: "ellipsis" }}>{line}</div>
            ))}
          </div>
        ))}
      </div>
    );
  if (seen.kind === "entries")
    return (
      <div style={{ ...box, padding: small ? 6 : 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {seen.entries.slice(0, small ? 5 : 500).map((e) => (
          <div key={e.name} style={{ ...mono, fontSize: small ? 8 : 12, display: "flex", gap: 8, whiteSpace: "nowrap", overflow: "hidden" }}>
            <Icon name={e.name.endsWith("/") ? "folder" : "draft"} size={small ? 10 : 14} color={p.onSurfaceVariant} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
            {!small && <span style={{ color: p.onSurfaceVariant }}>{e.size} B</span>}
          </div>
        ))}
      </div>
    );
  if (seen.kind === "text" || seen.kind === "bytes")
    return (
      <pre data-mocks-preview-text style={{ ...box, ...mono, fontSize: small ? 8 : 11, margin: 0, padding: small ? 6 : 0, whiteSpace: "pre-wrap", wordBreak: "break-all", overflow: small ? "hidden" : "auto" }}>
        {seen.kind === "text" ? seen.text : seen.hex}
      </pre>
    );
  return <div style={{ ...box, display: "grid", placeItems: "center", fontSize: 12, color: p.onSurfaceVariant }}>{t("mocksPreviewNone", lang)}</div>;
}

/** a file's preview in a dialog over the editor: Escape or the close button closes it, focus comes back */
export default function FilePreviewDialog({ file, p, onClose }: { file: MockFile; p: Palette; onClose: () => void }) {
  const lang = useLang();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      before?.focus?.();
    };
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.32)", display: "grid", placeItems: "center", padding: 24 }}>
      <div
        role="dialog"
        aria-modal
        aria-label={file.name}
        data-mocks-preview={file.id}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(880px, 100%)", height: "min(640px, 100%)", display: "flex", flexDirection: "column", gap: 10, padding: 16, borderRadius: 28, background: p.surfaceContainerHigh, color: p.onSurface, boxShadow: "0 12px 40px rgba(0,0,0,0.3)", boxSizing: "border-box" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 16, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
            <span style={{ fontSize: 12, color: p.onSurfaceVariant }}>
              {file.type}
              {"  "}
              <FileFacts file={file} p={p} />
            </span>
          </div>
          <button ref={close} data-mocks-preview-close onClick={onClose} aria-label={t("mocksPreviewClose", lang)} className="m3-press" style={{ width: 40, height: 40, borderRadius: 20, border: "none", background: "transparent", color: p.onSurfaceVariant, cursor: "pointer", display: "grid", placeItems: "center" }}>
            <Icon name="close" size={22} />
          </button>
        </div>
        <div style={{ flex: "1 1 auto", minHeight: 0, borderRadius: 16, background: p.surfaceContainerLow, padding: 12, overflow: "hidden", display: "flex" }}>
          <FilePreview file={file} p={p} />
        </div>
      </div>
    </div>
  );
}
