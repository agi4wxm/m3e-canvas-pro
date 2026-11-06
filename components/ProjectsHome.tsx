/* The projects home: every project kept in this browser as a card with a picture of its first screen, searched and
 * sorted; opened here or in a new tab, made, renamed, copied, downloaded, and put in the bin with a moment to take it
 * back. A project another tab is editing says so and cannot be deleted from here. It reads and changes the projects
 * through lib/projects; going to a project is the editor's (`onOpen`), so what it holds is kept first. */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Palette } from "@/lib/tokens";
import { t, useLang, type Lang } from "@/lib/i18n";
import { listProjects, type ProjectMeta } from "@/lib/projects/db";
import { downloadProject } from "@/lib/projects/download";
import { readStored } from "@/lib/projects/persist";
import { duplicateProject, freeName, onProjectsChanged, projectsInUse, projectUrl, purgeProject, renameProject, restoreProject, trashProject, UNDO_DELETE_MS, visibleProjects, type ProjectSort } from "@/lib/projects/projects";
import type { Doc } from "@/lib/tokens";
import { styleOf, styleTextOf } from "@/lib/styles";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { IconBtn, Segmented, useDismiss } from "./ui";

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

/** "3 minutes ago", in the editor's language */
function ago(at: number, lang: Lang, now = Date.now()): string {
  const s = Math.round((at - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 30],
    ["month", 12],
    ["year", Infinity],
  ];
  let v = s;
  for (const [unit, size] of steps) {
    if (Math.abs(v) < size) return unit === "second" && Math.abs(v) < 45 ? t("justNow", lang) : rtf.format(Math.round(v), unit);
    v /= size;
  }
  return rtf.format(Math.round(v), "year");
}

/** the name of the style a project wears, when it is one of the editor's own (a project's own styles are its own) */
const styleName = (key: string | undefined, lang: Lang) => {
  const pack = key ? styleOf(key) : undefined;
  return pack ? styleTextOf(pack.name, lang) : "";
};

export type ProjectsHomeProps = {
  p: Palette;
  open: boolean;
  onClose: () => void;
  /** the project this tab has open, as it is now */
  current: ProjectMeta | null;
  /** the document this tab has open, for its download */
  currentDoc: () => Doc;
  onOpen: (id: string, newTab?: boolean) => void;
  onNew: () => void;
  onOpenFile: () => void;
  /** projects cannot be kept in this browser: only what it is says so */
  blocked?: boolean;
};

export function ProjectsHome(props: ProjectsHomeProps) {
  return <AnimatePresence>{props.open && <Home key="home" {...props} />}</AnimatePresence>;
}

function Home({ p, onClose, current, currentDoc, onOpen, onNew, onOpenFile, blocked }: ProjectsHomeProps) {
  const lang = useLang();
  const [list, setList] = useState<ProjectMeta[] | null>(null);
  const [inUse, setInUse] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);
  const [busy, setBusy] = useState(false);
  /** projects put in the bin from here, gone for good when their undo runs out */
  const binned = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (blocked) return;
    let active = true;
    const load = () => {
      void listProjects().then((l) => active && setList(l)).catch(() => active && setList([]));
      void projectsInUse().then((s) => active && setInUse(s));
    };
    load();
    const off = onProjectsChanged(load);
    return () => {
      active = false;
      off();
    };
  }, [blocked]);
  /* leaving the home lets what it put in the bin go now */
  useEffect(() => {
    const bin = binned.current;
    return () => {
      for (const [id, timer] of bin) {
        clearTimeout(timer);
        void purgeProject(id);
      }
      bin.clear();
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), UNDO_DELETE_MS);
    return () => clearTimeout(id);
  }, [notice]);
  /* Escape steps back one thing at a time: a menu, a name being typed, then the home itself */
  useDismiss(!menuFor && !renaming, onClose);

  /* this tab's own project as it is now, over its listing as last stored */
  const shown = useMemo(() => {
    const merged = (list ?? []).map((m) => (current && m.id === current.id ? { ...m, ...current } : m));
    return visibleProjects(merged, { query, sort, lang });
  }, [list, current, query, sort, lang]);

  const remove = async (m: ProjectMeta) => {
    setMenuFor(null);
    if (m.id === current?.id || inUse.has(m.id)) {
      setNotice({ text: t("projectOpenCannotDelete", lang) });
      return;
    }
    await trashProject(m.id);
    binned.current.set(
      m.id,
      setTimeout(() => {
        binned.current.delete(m.id);
        void purgeProject(m.id);
      }, UNDO_DELETE_MS),
    );
    setNotice({
      text: fill(t("projectDeleted", lang), { name: m.name }),
      undo: () => {
        const timer = binned.current.get(m.id);
        if (timer) clearTimeout(timer);
        binned.current.delete(m.id);
        void restoreProject(m.id);
        setNotice(null);
      },
    });
  };

  const duplicate = async (m: ProjectMeta) => {
    setMenuFor(null);
    await duplicateProject(m.id, freeName(fill(t("projectCopy", lang), { name: m.name }), list ?? []));
  };

  const download = async (m: ProjectMeta) => {
    setMenuFor(null);
    if (m.id === current?.id) return downloadProject(currentDoc(), m.name);
    const { stored } = await readStored(m.id);
    if (stored.doc) downloadProject(stored.doc as Doc, m.name);
  };

  const narrow = typeof window !== "undefined" && window.innerWidth < 720;

  return (
    <motion.div
      role="dialog"
      aria-modal
      aria-label={t("projectsTitle", lang)}
      data-projects-home
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.8 }}
      style={{ position: "fixed", inset: 0, zIndex: 700, background: p.surface, color: p.onSurface, display: "flex", flexDirection: "column" }}
    >
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: narrow ? "16px 16px 8px" : "20px 32px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: narrow ? "1 1 100%" : "0 0 auto", minWidth: 0 }}>
          <Logo size={36} color={p.primary} glyph={p.onPrimary} />
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.2, fontWeight: 500, letterSpacing: 0 }}>{t("projectsTitle", lang)}</h1>
          {narrow && <span style={{ flex: 1 }} />}
          {narrow && !blocked && <IconBtn icon="file_open" p={p} onClick={onOpenFile} title={t("openFile", lang)} size={44} />}
          {narrow && <IconBtn icon="close" p={p} onClick={onClose} title={t("backToEditor", lang)} size={44} />}
        </div>
        {!narrow && <span style={{ flex: 1 }} />}
        {!blocked && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, height: 48, padding: "0 16px", borderRadius: 24, background: p.surfaceContainerHigh, color: p.onSurfaceVariant, flex: narrow ? "1 1 100%" : "0 1 320px", minWidth: 0 }}>
            <Icon name="search" size={22} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchProjects", lang)}
              aria-label={t("searchProjects", lang)}
              spellCheck={false}
              /* on a phone the keyboard would cover the list */
              autoFocus={!narrow}
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: p.onSurface, fontSize: 15 }}
            />
            {query && <IconBtn icon="close" p={p} onClick={() => setQuery("")} title={t("clear", lang)} size={32} />}
          </label>
        )}
        {!blocked && (
          <Segmented<ProjectSort>
            p={p}
            height={40}
            grow={false}
            label={t("sortProjects", lang)}
            value={sort}
            onChange={setSort}
            options={[
              { key: "recent", label: t("sortRecent", lang) },
              { key: "name", label: t("sortName", lang) },
              { key: "created", label: t("sortCreated", lang) },
            ]}
          />
        )}
        {!blocked && !narrow && (
          <button
            onClick={onOpenFile}
            className="m3-press"
            data-home-open-file
            style={{ height: 40, padding: "0 18px 0 14px", borderRadius: 20, border: "none", background: p.secondaryContainer, color: p.onSecondaryContainer, fontSize: 14, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            <Icon name="file_open" size={20} />
            {t("openFile", lang)}
          </button>
        )}
        {!blocked && (
          <button
            onClick={() => {
              if (busy) return;
              setBusy(true);
              onNew();
            }}
            className="m3-press"
            data-new-project
            /* on a phone it floats in the corner, the way a new thing is made there */
            style={{ ...(narrow ? { position: "fixed", right: 16, bottom: 16, zIndex: 2, boxShadow: "0 4px 14px rgba(0,0,0,0.22)" } : { boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }), height: 56, padding: "0 22px 0 18px", borderRadius: 18, border: "none", background: p.primaryContainer, color: p.onPrimaryContainer, fontSize: 15, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 10, cursor: busy ? "progress" : "pointer", whiteSpace: "nowrap" }}
          >
            <Icon name="add" size={24} />
            {t("newProject", lang)}
          </button>
        )}
        {!narrow && <IconBtn icon="close" p={p} onClick={onClose} title={t("backToEditor", lang)} size={48} />}
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: narrow ? "8px 16px 96px" : "12px 32px 96px" }}>
        {blocked ? (
          <p style={{ maxWidth: 560, margin: "48px auto", fontSize: 15, lineHeight: 1.6, color: p.onSurfaceVariant, textAlign: "center" }}>{t("projectsBlocked", lang)}</p>
        ) : list && !shown.length ? (
          <p style={{ margin: "64px 0", fontSize: 15, color: p.onSurfaceVariant, textAlign: "center" }}>{t("noProjectMatch", lang)}</p>
        ) : (
          <div role="list" style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${narrow ? 160 : 236}px, 1fr))`, gap: narrow ? 12 : 20 }}>
            {shown.map((m) => (
              <Card
                key={m.id}
                p={p}
                lang={lang}
                m={m}
                here={m.id === current?.id}
                elsewhere={m.id !== current?.id && inUse.has(m.id)}
                menuOpen={menuFor === m.id}
                onMenu={(open) => setMenuFor(open ? m.id : null)}
                renaming={renaming === m.id}
                onRename={(name) => {
                  setRenaming(null);
                  if (name !== null && name.trim() && name.trim() !== m.name) void renameProject(m.id, name);
                }}
                onOpen={(newTab) => (m.id === current?.id && !newTab ? onClose() : onOpen(m.id, newTab))}
                actions={{
                  rename: () => {
                    setMenuFor(null);
                    setRenaming(m.id);
                  },
                  duplicate: () => void duplicate(m),
                  download: () => void download(m),
                  remove: () => void remove(m),
                }}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice.text}
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18 }}
            data-projects-notice
            style={{ position: "fixed", left: "50%", bottom: narrow ? 88 : 24, transform: "translateX(-50%)", zIndex: 1, display: "flex", alignItems: "center", gap: 16, minHeight: 48, padding: "4px 8px 4px 16px", borderRadius: 12, background: p.inverseSurface, color: p.inverseOnSurface, fontSize: 14, boxShadow: "0 4px 14px rgba(0,0,0,0.2)", maxWidth: "calc(100vw - 32px)" }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{notice.text}</span>
            {notice.undo && (
              <button onClick={notice.undo} className="m3-press" data-undo-delete style={{ height: 36, padding: "0 12px", borderRadius: 18, border: "none", background: "transparent", color: p.inversePrimary, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                {t("undo", lang)}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

type CardActions = { rename: () => void; duplicate: () => void; download: () => void; remove: () => void };

function Card({ p, lang, m, here, elsewhere, menuOpen, onMenu, renaming, onRename, onOpen, actions }: { p: Palette; lang: Lang; m: ProjectMeta; here: boolean; elsewhere: boolean; menuOpen: boolean; onMenu: (open: boolean) => void; renaming: boolean; onRename: (name: string | null) => void; onOpen: (newTab: boolean) => void; actions: CardActions }) {
  const [hover, setHover] = useState(false);
  const [wide, setWide] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menuOpen, () => onMenu(false), [menuRef]);
  const chip = (icon: string, text: string, tone: "primary" | "tertiary" | "plain", title?: string) => (
    <span title={title ?? text} style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 24, padding: "0 8px 0 6px", borderRadius: 8, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", background: tone === "primary" ? p.secondaryContainer : tone === "tertiary" ? p.tertiaryContainer : "transparent", color: tone === "primary" ? p.onSecondaryContainer : tone === "tertiary" ? p.onTertiaryContainer : p.onSurfaceVariant, border: tone === "plain" ? `1px solid ${p.outlineVariant}` : "none" }}>
      <Icon name={icon} size={14} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{text}</span>
    </span>
  );
  const item = (icon: string, label: string, run: () => void, danger = false) => (
    <button key={label} role="menuitem" onClick={run} className="m3-press" style={{ height: 40, padding: "0 16px 0 12px", borderRadius: 12, border: "none", background: "transparent", color: danger ? p.error : p.onSurface, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, whiteSpace: "nowrap", textAlign: "left" }}>
      <Icon name={icon} size={20} color={danger ? p.error : p.onSurfaceVariant} />
      {label}
    </button>
  );
  return (
    <div
      role="listitem"
      data-project-card={m.id}
      data-project-here={here ? "" : undefined}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{ position: "relative", borderRadius: 24, background: hover ? p.surfaceContainer : p.surfaceContainerLow, outline: here ? `2px solid ${p.primary}` : "none", outlineOffset: -2, transition: "background 160ms", minWidth: 0 }}
    >
      <a
        href={projectUrl(m.id)}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          onOpen(false);
        }}
        aria-label={`${t("openProjectHere", lang)}: ${m.name}`}
        style={{ display: "block", padding: 8, color: "inherit", textDecoration: "none", borderRadius: 24 }}
      >
        <div style={{ position: "relative", height: 176, borderRadius: 18, background: p.surfaceContainerHighest, display: "grid", placeItems: "center", overflow: "hidden" }}>
          {m.thumb ? (
            /* a phone screen peeks up from the bottom of the card; a wide screen is shown whole */
            <img
              src={m.thumb}
              alt=""
              draggable={false}
              onLoad={(e) => setWide(e.currentTarget.naturalWidth > e.currentTarget.naturalHeight)}
              style={{
                position: "absolute",
                left: "50%",
                top: wide ? "50%" : 18,
                width: wide ? "84%" : "56%",
                borderRadius: wide ? 10 : 14,
                boxShadow: "0 2px 12px rgba(0,0,0,0.16)",
                transform: `translate(-50%, ${wide ? "-50%" : "0px"}) translateY(${hover ? -4 : 0}px)`,
                transition: "transform 240ms cubic-bezier(0.2,0,0,1)",
              }}
            />
          ) : (
            <Icon name="smartphone" size={44} color={p.outline} />
          )}
        </div>
      </a>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 4, padding: "4px 6px 14px 16px" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {renaming ? (
            <input
              autoFocus
              defaultValue={m.name}
              aria-label={t("projectName", lang)}
              data-rename-input
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRename(e.currentTarget.value);
                if (e.key === "Escape") {
                  e.stopPropagation();
                  onRename(null);
                }
              }}
              onBlur={(e) => onRename(e.currentTarget.value)}
              style={{ height: 32, margin: "2px 0", padding: "0 10px", borderRadius: 10, border: `2px solid ${p.primary}`, outline: "none", background: p.surface, color: p.onSurface, fontSize: 15, fontWeight: 600, minWidth: 0 }}
            />
          ) : (
            <div data-project-title title={m.name} style={{ fontSize: 15, fontWeight: 600, lineHeight: "36px", height: 36, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} onDoubleClick={actions.rename}>
              {m.name}
            </div>
          )}
          <div style={{ fontSize: 12, color: p.onSurfaceVariant, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {[fill(t("projectEdited", lang), { when: ago(m.updated, lang) }), m.screens === 1 ? t("projectOneScreen", lang) : fill(t("projectScreens", lang), { n: String(m.screens) }), styleName(m.style, lang)].filter(Boolean).join(" · ")}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4, minHeight: 24 }}>
            {here && chip("check", t("projectHere", lang), "primary")}
            {elsewhere && chip("tab", t("projectElsewhere", lang), "tertiary")}
            {m.file ? chip(m.file.kind === "folder" ? "folder" : "description", m.file.name, "plain") : chip("language", t("projectInBrowser", lang), "plain")}
          </div>
        </div>
        <div ref={menuRef} style={{ position: "relative", marginTop: 0 }}>
          <IconBtn icon="more_vert" p={p} on={menuOpen} onClick={() => onMenu(!menuOpen)} title={t("projectMore", lang)} size={40} hasPopup="menu" expanded={menuOpen} />
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
                style={{ position: "absolute", top: 44, right: 0, zIndex: 5, padding: 6, borderRadius: 18, background: p.surfaceContainerHigh, boxShadow: "0 6px 20px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", gap: 2, transformOrigin: "top right" }}
              >
                {item("open_in_new", t("openProjectNewTab", lang), () => {
                  onMenu(false);
                  onOpen(true);
                })}
                {item("edit", t("renameProject", lang), actions.rename)}
                {item("content_copy", t("duplicateProject", lang), actions.duplicate)}
                {item("download", t("downloadProjectFile", lang), actions.download)}
                {item("delete", t("deleteProject", lang), actions.remove, true)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
