import { useRef, useState } from "react";
import type { Doc, Palette } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import { Icon } from "./Icon";
import { Select } from "./ui";

const ALL = "all";

/** hands the bytes to the browser as a file */
function save(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  /* the browser reads the address when the click lands, a moment after it */
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** The document as a runnable project, as a zip: all its screens or one. What it costs is loaded only
 *  when pressed, and what happens is said under the button, in words, including a failure. */
export function DownloadProject({ doc, widths, p, stacked = true }: { doc: Doc; widths: Record<string, number>; p: Palette; /** the choice of screens above the button, for a narrow panel */ stacked?: boolean }) {
  const lang = useLang();
  const [scope, setScope] = useState(ALL);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const running = useRef(false);
  const frames = doc.frame === "phone" ? doc.frames : [];
  const known = frames.some((f) => f.id === scope) ? scope : ALL;

  const run = async () => {
    if (running.current) return;
    running.current = true;
    setSaid(null);
    setBusy({ done: 0, total: 0 });
    try {
      const { buildProject, zipProject } = await import("@/lib/exportProject");
      const project = await buildProject(doc, widths, { onlyFrameId: known === ALL ? undefined : known, lang, onProgress: (done, total) => setBusy({ done, total }) });
      save(zipProject(project.files), `${project.name}.zip`);
      setSaid(project.warnings.length ? { text: `${t("downloadDone", lang)} ${t("downloadPartial", lang)} ${project.warnings.join("; ")}`, bad: true } : { text: t("downloadDone", lang), bad: false });
    } catch (e) {
      setSaid({ text: `${t("downloadFailed", lang)} ${e instanceof Error ? e.message : String(e)}`, bad: true });
    } finally {
      running.current = false;
      setBusy(null);
    }
  };

  return (
    <div data-download-project style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexDirection: stacked ? "column" : "row", alignItems: "stretch", gap: 8 }}>
        {frames.length > 1 && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <Select options={[{ key: ALL, label: t("downloadAllScreens", lang) }, ...frames.map((f) => ({ key: f.id, label: f.name || t("screen", lang) }))]} value={known} onChange={setScope} p={p} label={t("downloadScope", lang)} />
          </div>
        )}
        <button
          onClick={run}
          disabled={!!busy}
          title={t("downloadProjectTitle", lang)}
          className="m3-press"
          style={{ flex: stacked ? undefined : "0 0 auto", height: 44, padding: "0 18px", borderRadius: 22, border: "none", background: p.secondaryContainer, color: p.onSecondaryContainer, opacity: busy ? 0.7 : 1, fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap" }}
        >
          <Icon name={busy ? "hourglass_top" : "download"} size={20} />
          {busy ? t("downloadWorking", lang).replace("{done}", String(busy.done)).replace("{total}", String(busy.total)) : t("downloadProject", lang)}
        </button>
      </div>
      {said && (
        <div role="status" style={{ fontSize: 12, lineHeight: 1.5, color: said.bad ? p.error : p.onSurfaceVariant, overflowWrap: "anywhere" }}>
          {said.text}
        </div>
      )}
    </div>
  );
}
