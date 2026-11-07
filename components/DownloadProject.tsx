import { useEffect, useRef, useState } from "react";
import type { Doc, Palette } from "@/lib/tokens";
import { t, UI, useLang, type UIKey } from "@/lib/i18n";
import type { ExportPlan } from "@/lib/export/merge";
import type { DesignDifference } from "@/lib/export/types";
import { differenceCounts } from "@/lib/export/differences";
import type { DirHandle } from "@/lib/projects/fileLink";
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

/** the project open in this tab, as its address names it (lib/projects): the folder it exports into is kept per project */
const projectKey = () => new URLSearchParams(window.location.search).get("project") ?? "default";

type Kind = "prototype" | "product";
type Report = { folder: string; plan: ExportPlan };

const fill = (s: string, values: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));

/** The document as a runnable project. Two kinds: the prototype (one React app, as a zip: all its screens or one) and
 *  the whole product (a monorepo, lib/export), as a zip or written into a folder on this computer, and again into the
 *  same folder later without erasing custom code. What it costs is loaded only when pressed, and what happens is said
 *  under the buttons, in words, including a failure and, for a folder, a report of what was written and what was not. */
export function DownloadProject({ doc, widths, p, stacked = true }: { doc: Doc; widths: Record<string, number>; p: Palette; /** the choice of screens above the button, for a narrow panel */ stacked?: boolean }) {
  const lang = useLang();
  const [kind, setKind] = useState<Kind>("prototype");
  const [scope, setScope] = useState(ALL);
  const [busy, setBusy] = useState<{ done: number; total: number; writing?: boolean } | null>(null);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  /* where the exported apps draw something other than the design says, from the last product built */
  const [differences, setDifferences] = useState<DesignDifference[]>([]);
  const [folder, setFolder] = useState<DirHandle | null>(null);
  /* a folder picked that holds other things: exported into only once the button is pressed again */
  const [unsure, setUnsure] = useState<DirHandle | null>(null);
  const [canFolder, setCanFolder] = useState(false);
  const running = useRef(false);
  const frames = doc.frame === "phone" ? doc.frames : [];
  const known = frames.some((f) => f.id === scope) ? scope : ALL;

  /* the folder this project exported into last time, when the browser still has it */
  useEffect(() => {
    if (kind !== "product") return;
    let live = true;
    void import("@/lib/export/fsAccess").then(async (fs) => {
      if (!live) return;
      setCanFolder(fs.canExportToFolder());
      const remembered = await fs.rememberedFolder(projectKey());
      if (live) setFolder(remembered);
    });
    return () => {
      live = false;
    };
  }, [kind]);

  const begin = () => {
    if (running.current) return false;
    running.current = true;
    setSaid(null);
    setReport(null);
    setDifferences([]);
    setBusy({ done: 0, total: 0 });
    return true;
  };
  const end = () => {
    running.current = false;
    setBusy(null);
  };
  const failed = (e: unknown) => setSaid({ text: `${t("downloadFailed", lang)} ${e instanceof Error ? e.message : String(e)}`, bad: true });
  const partial = (warnings: string[]) => (warnings.length ? { text: `${t("downloadDone", lang)} ${t("downloadPartial", lang)} ${warnings.join("; ")}`, bad: true } : null);

  const run = async () => {
    if (!begin()) return;
    try {
      const { buildProject, zipProject } = await import("@/lib/exportProject");
      const project = await buildProject(doc, widths, { onlyFrameId: known === ALL ? undefined : known, lang, onProgress: (done, total) => setBusy({ done, total }) });
      save(zipProject(project.files), `${project.name}.zip`);
      setSaid(partial(project.warnings) ?? { text: t("downloadDone", lang), bad: false });
    } catch (e) {
      failed(e);
    } finally {
      end();
    }
  };

  const product = async () => {
    const { buildProduct } = await import("@/lib/export/product");
    return buildProduct(doc, widths, { lang, onProgress: (done, total) => setBusy({ done, total }) });
  };

  const zipIt = async () => {
    if (!begin()) return;
    try {
      const { zipProduct } = await import("@/lib/export/product");
      const built = await product();
      save(zipProduct(built), `${built.name}-product.zip`);
      setDifferences(built.differences);
      setSaid(partial(built.warnings) ?? { text: t("downloadDone", lang), bad: false });
    } catch (e) {
      failed(e);
    } finally {
      end();
    }
  };

  /** exports into a folder: one picked now (`pick`), the one picked last time, or one picked a moment ago that holds other things */
  const toFolder = async (how: "pick" | "again" | "anyway") => {
    if (!begin()) return;
    try {
      const fs = await import("@/lib/export/fsAccess");
      const { mayWrite } = await import("@/lib/projects/fileLink");
      let dir = how === "again" ? folder : how === "anyway" ? unsure : await fs.pickExportFolder();
      setUnsure(null);
      if (!dir) return;
      if (!(await mayWrite(dir, true))) {
        setSaid({ text: t("exportFolderDenied", lang), bad: true });
        return;
      }
      if (how === "pick") {
        const state = await fs.folderState(dir);
        if (!state.empty && !state.exported) {
          setUnsure(dir);
          setSaid({ text: t("exportFolderNotEmpty", lang), bad: true });
          dir = null;
          return;
        }
      }
      const built = await product();
      const plan = await fs.exportToDirectory(dir, built, (done, total) => setBusy({ done, total, writing: true }));
      await fs.rememberFolder(projectKey(), dir);
      setFolder(dir);
      setReport({ folder: dir.name, plan });
      setDifferences(built.differences);
      const missing = partial(built.warnings);
      if (missing) setSaid(missing);
    } catch (e) {
      failed(e);
    } finally {
      end();
    }
  };

  const pill = (on: boolean) => ({
    height: 32,
    padding: "0 14px",
    borderRadius: 16,
    border: `1px solid ${on ? p.secondaryContainer : p.outlineVariant}`,
    background: on ? p.secondaryContainer : "transparent",
    color: on ? p.onSecondaryContainer : p.onSurfaceVariant,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  });
  const button = (primary: boolean) => ({
    flex: stacked ? undefined : "0 0 auto",
    height: 44,
    padding: "0 18px",
    borderRadius: 22,
    border: "none",
    background: primary ? p.secondaryContainer : "transparent",
    boxShadow: primary ? undefined : `inset 0 0 0 1px ${p.outlineVariant}`,
    color: primary ? p.onSecondaryContainer : p.onSurface,
    opacity: busy ? 0.7 : 1,
    fontSize: 14,
    fontWeight: 600,
    cursor: busy ? "default" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    whiteSpace: "nowrap" as const,
  });
  const working = busy && fill(t(busy.writing ? "exportWriting" : "downloadWorking", lang), { done: busy.done, total: busy.total });
  const plan = report?.plan;
  const written = plan ? plan.writes.filter((w) => w.why !== "conflict" && w.why !== "manifest").length : 0;

  return (
    <div data-download-project data-export-kind={kind} style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div role="radiogroup" aria-label={t("exportKind", lang)} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(["prototype", "product"] as const).map((k) => (
          <button key={k} role="radio" aria-checked={kind === k} data-export-choice={k} title={t(k === "prototype" ? "exportPrototypeHint" : "exportProductHint", lang)} onClick={() => (setKind(k), setSaid(null), setReport(null), setUnsure(null))} className="m3-press" style={pill(kind === k)}>
            {t(k === "prototype" ? "exportPrototype" : "exportProduct", lang)}
          </button>
        ))}
      </div>
      {kind === "prototype" ? (
        <div style={{ display: "flex", flexDirection: stacked ? "column" : "row", alignItems: "stretch", gap: 8 }}>
          {frames.length > 1 && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <Select options={[{ key: ALL, label: t("downloadAllScreens", lang) }, ...frames.map((f) => ({ key: f.id, label: f.name || t("screen", lang) }))]} value={known} onChange={setScope} p={p} label={t("downloadScope", lang)} />
            </div>
          )}
          <button onClick={run} disabled={!!busy} title={t("downloadProjectTitle", lang)} className="m3-press" style={button(true)}>
            <Icon name={busy ? "hourglass_top" : "download"} size={20} />
            {working || t("downloadProject", lang)}
          </button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant }}>{t("exportProductHint", lang)}</div>
          <div style={{ display: "flex", flexDirection: stacked ? "column" : "row", flexWrap: "wrap", alignItems: "stretch", gap: 8 }}>
            {canFolder && folder && (
              <button data-export-again onClick={() => void toFolder("again")} disabled={!!busy} title={t("exportToFolderTitle", lang)} className="m3-press" style={button(true)}>
                <Icon name={busy ? "hourglass_top" : "drive_folder_upload"} size={20} />
                {working || fill(t("exportAgain", lang), { name: folder.name })}
              </button>
            )}
            {canFolder && (
              <button data-export-folder onClick={() => void toFolder(unsure ? "anyway" : "pick")} disabled={!!busy} title={t("exportToFolderTitle", lang)} className="m3-press" style={button(!folder)}>
                <Icon name="folder_open" size={20} />
                {!folder && working ? working : t(folder ? "exportOtherFolder" : "exportToFolder", lang)}
              </button>
            )}
            <button data-export-zip onClick={() => void zipIt()} disabled={!!busy} title={t("exportZipTitle", lang)} className="m3-press" style={button(!canFolder)}>
              <Icon name="download" size={20} />
              {!canFolder && working ? working : t("exportZip", lang)}
            </button>
          </div>
          {!canFolder && <div style={{ fontSize: 12, color: p.onSurfaceVariant }}>{t("exportNoFolderApi", lang)}</div>}
        </>
      )}
      {plan && report && (
        <div role="status" data-export-report style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, overflowWrap: "anywhere", display: "flex", flexDirection: "column", gap: 4 }}>
          <span data-export-summary>{fill(t("exportReport", lang), { folder: report.folder, written, unchanged: plan.unchanged.length, kept: plan.kept.length, removed: plan.removed.length })}</span>
          {plan.merged.length > 0 && <span>{fill(t("exportMerged", lang), { n: plan.merged.length })}</span>}
          {plan.conflicts.length > 0 && (
            <div data-export-conflicts style={{ color: p.error }}>
              {fill(t("exportConflicts", lang), { n: plan.conflicts.length })}
              <ul style={{ margin: "2px 0 0", paddingLeft: 18, maxHeight: 96, overflowY: "auto" }}>
                {plan.conflicts.map((c) => (
                  <li key={c.path} data-export-conflict={c.path}>
                    {c.path}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.orphaned.length > 0 && (
            <div>
              {t("exportOrphaned", lang)} {plan.orphaned.join(", ")}
            </div>
          )}
          {plan.customOrphans.length > 0 && (
            <div data-export-custom-orphans>
              {t("exportCustomOrphans", lang)} {plan.customOrphans.join(", ")}
            </div>
          )}
        </div>
      )}
      {differences.length > 0 && <Differences differences={differences} p={p} />}
      {said && (
        <div role="status" style={{ fontSize: 12, lineHeight: 1.5, color: said.bad ? p.error : p.onSurfaceVariant, overflowWrap: "anywhere" }}>
          {said.text}
        </div>
      )}
    </div>
  );
}

/** how many of each kind of difference shown, and each of them under a disclosure */
const SHOWN_DIFFERENCES = 80;

/** Where the exported apps draw something other than the design says (a part drawn as its atoms or as a placeholder, a
 *  binding kept at the design's value): how many in each app and of what kind, each one under a disclosure, and the
 *  file each app lists them in. */
function Differences({ differences, p }: { differences: DesignDifference[]; p: Palette }) {
  const lang = useLang();
  const appName = (app: DesignDifference["app"]) => t(app === "mobile" ? "exportAppMobile" : "exportAppMiniapp", lang);
  const kindName = (kind: string) => {
    const key = `exportDiff_${kind}` as UIKey;
    return key in UI ? t(key, lang) : kind;
  };
  const list = differenceCounts(differences)
    .map((c) => fill(t("exportDifferenceApp", lang), { app: appName(c.app), n: c.total, kinds: c.kinds.map(([k, n]) => `${kindName(k)} ${n}`).join(lang === "zh" || lang === "ja" ? "、" : ", ") }))
    .join(lang === "zh" || lang === "ja" ? "；" : "; ");
  return (
    <div data-export-differences style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, overflowWrap: "anywhere", display: "flex", flexDirection: "column", gap: 2 }}>
      <span>{fill(t("exportDifferences", lang), { list })}</span>
      <details>
        <summary style={{ cursor: "pointer", color: p.primary, fontWeight: 600 }}>{t("exportDifferencesShow", lang)}</summary>
        <ul style={{ margin: "2px 0 0", paddingLeft: 18, maxHeight: 160, overflowY: "auto" }}>
          {differences.slice(0, SHOWN_DIFFERENCES).map((d, i) => (
            <li key={i} data-export-difference={d.app}>
              {[appName(d.app), d.screen, d.part].filter(Boolean).join(" · ")}: {d.detail}
            </li>
          ))}
          {differences.length > SHOWN_DIFFERENCES && <li>…</li>}
        </ul>
      </details>
    </div>
  );
}
