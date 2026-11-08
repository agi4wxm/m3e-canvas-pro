
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Doc, Palette } from "@/lib/tokens";
import { SHARE_SCOPES, shareable, shareItems, shareLink, ShareLinkError, type ShareItem, type ShareProblem, type ShareScope } from "@/lib/share";
import { DownloadProject } from "./DownloadProject";
import { Icon } from "./Icon";
import { Segmented, Toggle, useDismiss } from "./ui";
import { t, useLang } from "@/lib/i18n";
import { listTextOf } from "@/parts/labels";

const BASE = import.meta.env.VITE_BASE_PATH ?? "";

/** the app's own URL without any hash, and the agent guide beside it */
const appUrl = () => `${window.location.origin}${BASE}/`;
const guideUrl = () => `${appUrl()}agent.md`;

/** the text button that opens the dialog: a label and a beta badge, no icon; busy while a model drafts */
export function ShareButton({ p, onClick, busy }: { p: Palette; onClick: () => void; busy?: boolean }) {
  const lang = useLang();
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={busy ? t("askAiGenerating", lang) : t("askAiTitle", lang)}
      className="m3-press"
      style={{
        height: 40,
        padding: "0 8px 0 16px",
        borderRadius: 20,
        border: "none",
        background: "transparent",
        color: busy ? p.onSurfaceVariant : p.onSurface,
        fontSize: 13,
        fontWeight: 600,
        cursor: busy ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap",
      }}
    >
      {busy && <Icon name="hourglass_top" size={18} />}
      {busy ? t("askAiGenerating", lang) : t("askAi", lang)}
      {!busy && <Beta p={p} />}
    </button>
  );
}

const Beta = ({ p }: { p: Palette }) => (
  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8, background: p.tertiaryContainer, color: p.onTertiaryContainer, letterSpacing: 0.4 }}>{listTextOf("BETA", useLang())}</span>
);

/** Ask an AI (beta): write the idea and have the author's own model draft it, or copy the
 *  instruction for a coding agent. The title row carries a link to the design as it is now. */
export function ShareDialog({
  p,
  doc,
  widths,
  aiReady,
  idea,
  onIdea,
  open,
  onClose,
  onDraft,
  onSetupAi,
}: {
  p: Palette;
  doc: Doc;
  widths: Record<string, number>;
  aiReady: boolean;
  /** what to build, kept by the page so a failed draft does not lose it */
  idea: string;
  onIdea: (v: string) => void;
  open: boolean;
  onClose: () => void;
  /** the idea, for the author's own model to draft */
  onDraft: (idea: string) => void;
  /** opens the AI settings so a key can be entered */
  onSetupAi: () => void;
}) {
  const lang = useLang();
  const [copied, setCopied] = useState<"ask" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(null), 4000);
    return () => clearTimeout(id);
  }, [copied]);
  /* a fresh dialog starts without a "copied" mark */
  useEffect(() => {
    if (open) setCopied(null);
  }, [open]);
  /** the link dialog over this one: what the link carries is chosen there */
  const [linkOpen, setLinkOpen] = useState(false);
  useEffect(() => {
    if (!open) setLinkOpen(false);
  }, [open]);
  /* a press outside lands on the scrim, which closes it on its own; Escape closes the dialog on top first */
  useDismiss(open && !linkOpen, onClose);

  const copyAsk = async () => {
    const text = t("askAiText", lang).replace("{url}", guideUrl()).replace("{idea}", idea.trim() || t("askAiIdeaFallback", lang));
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ask");
    } catch {}
  };
  /* a connected pair, the way the canvas draws connected buttons: outer corners round, inner ones tight */
  const pill = (icon: string, label: string, onClick: () => void, opts?: { primary?: boolean; disabled?: boolean; corners?: "left" | "right"; title?: string }) => {
    const outer = 20;
    const inner = 8;
    const radius = opts?.corners === "left" ? `${outer}px ${inner}px ${inner}px ${outer}px` : opts?.corners === "right" ? `${inner}px ${outer}px ${outer}px ${inner}px` : outer;
    return (
      <button
        onClick={onClick}
        disabled={opts?.disabled}
        title={opts?.title}
        className="m3-press"
        style={{
          height: 40,
          padding: "0 18px",
          borderRadius: radius,
          border: "none",
          background: opts?.primary ? p.primary : p.secondaryContainer,
          color: opts?.primary ? p.onPrimary : p.onSecondaryContainer,
          opacity: opts?.disabled ? 0.5 : 1,
          fontSize: 13,
          fontWeight: 600,
          cursor: opts?.disabled ? "default" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          flex: "0 0 auto",
          whiteSpace: "nowrap",
        }}
      >
        <Icon name={icon} size={18} />
        {label}
      </button>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.32)", display: "grid", placeItems: "center", padding: 24 }}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-label={t("askAi", lang)}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(100%, 620px)",
              padding: 24,
              borderRadius: 28,
              background: p.surfaceContainerHigh,
              color: p.onSurface,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>{t("askAi", lang)}</span>
              <Beta p={p} />
              <span style={{ flex: 1 }} />
              {pill("link", t("shareLinkCopy", lang), () => setLinkOpen(true), { title: t("shareLinkHint", lang) })}
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: p.onSurfaceVariant }}>{t("askAiHint", lang)}</p>
            <textarea
              value={idea}
              onChange={(e) => onIdea(e.target.value)}
              placeholder={t("askAiIdea", lang)}
              aria-label={t("askAiIdea", lang)}
              rows={4}
              autoFocus
              spellCheck={false}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 14,
                border: "none",
                background: p.surface,
                color: p.onSurface,
                font: "inherit",
                fontSize: 14,
                lineHeight: 1.45,
                outline: "none",
                boxSizing: "border-box",
                resize: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* the left of the row: where to paste after a copy, or how to unlock drafting */}
              <span style={{ flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: copied === "ask" ? 600 : 400, color: copied === "ask" ? p.primary : p.onSurfaceVariant }}>
                {copied === "ask" ? (
                  <>
                    <Icon name="content_paste_go" size={18} />
                    {t("askAiPasted", lang)}
                  </>
                ) : !aiReady ? (
                  t("aiSetupHint", lang)
                ) : null}
              </span>
              <div style={{ display: "inline-flex", gap: 3, flex: "0 0 auto" }}>
                {pill(copied === "ask" ? "check" : "content_copy", copied === "ask" ? t("copied", lang) : t("askAiCopy", lang), copyAsk, { corners: "left", title: t("askAiCopyTitle", lang) })}
                {aiReady
                  ? pill("auto_awesome", t("askAiGenerate", lang), () => onDraft(idea), { primary: true, disabled: !idea.trim(), corners: "right", title: t("askAiGenerateTitle", lang) })
                  : pill("key", t("aiSetup", lang), onSetupAi, { primary: true, corners: "right", title: t("aiSetupTitle", lang) })}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <DownloadProject doc={doc} widths={widths} p={p} stacked={false} />
              <button
                onClick={onClose}
                title={t("closeBtn", lang)}
                className="m3-press"
                style={{ flex: "0 0 auto", height: 40, padding: "0 16px", borderRadius: 20, border: "none", background: "transparent", color: p.primary, fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {t("closeBtn", lang)}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      <ShareLinkDialog key="link" p={p} doc={doc} open={open && linkOpen} onClose={() => setLinkOpen(false)} />
    </AnimatePresence>
  );
}

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
const SCOPE_RANK: Record<ShareScope, number> = { look: 0, samples: 1, full: 2 };
const ITEM_WORDS: Record<string, Parameters<typeof t>[0]> = {
  "api:models": "shareItemModels",
  "api:endpoints": "shareItemEndpoints",
  "api:channels": "shareItemChannels",
  "api:auth": "shareItemAuth",
  "api:servers": "shareItemServers",
  "api:examples": "shareItemExamples",
  "mocks:files": "shareItemFiles",
  "mocks:auth": "shareItemMockAuth",
  "mocks:scenarios": "shareItemScenarios",
  "mocks:realtime": "shareItemRealtime",
};
const itemText = (i: ShareItem, lang: ReturnType<typeof useLang>) => {
  const n = String(i.count);
  if (i.kind === "collection") return fill(t("shareItemCollection", lang), { name: i.label, n });
  if (i.key.startsWith("mocks:fixtures:")) return fill(t("shareItemFixtures", lang), { name: i.label, n });
  return fill(t(ITEM_WORDS[i.key] ?? "shareItemExamples", lang), { n });
};
/** how much of what is shared the preview shows: the rest is in the link all the same */
const PREVIEW_CHARS = 20_000;

/** A link to the design, made only once the person has seen what it carries: the scope (the design alone, with its
 *  sample data, with the whole contract), each collection, part of the API and part of the mock library that comes
 *  with it, any of which can be left out, and the document itself as the link will hold it. */
export function ShareLinkDialog({ p, doc, open, onClose }: { p: Palette; doc: Doc; open: boolean; onClose: () => void }) {
  const lang = useLang();
  const [scope, setScope] = useState<ShareScope>("look");
  const [omit, setOmit] = useState<ReadonlySet<string>>(new Set());
  const [link, setLink] = useState<string | null>(null);
  const [problem, setProblem] = useState<ShareProblem | null>(null);
  const [copied, setCopied] = useState(false);
  /* each time it opens, the narrowest scope, nothing left out */
  useEffect(() => {
    if (!open) return;
    setScope("look");
    setOmit(new Set());
    setCopied(false);
  }, [open]);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(id);
  }, [copied]);
  useDismiss(open, onClose);
  const options = useMemo(() => ({ scope, omit }), [scope, omit]);
  const items = useMemo(() => (open ? shareItems(doc, options).filter((i) => SCOPE_RANK[i.scope] <= SCOPE_RANK[scope]) : []), [open, doc, options, scope]);
  const preview = useMemo(() => {
    if (!open) return "";
    const text = JSON.stringify(shareable(doc, options), null, 2);
    return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}\n…` : text;
  }, [open, doc, options]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setLink(null);
    setProblem(null);
    shareLink(doc, appUrl(), options).then(
      (l) => live && setLink(l),
      (e: unknown) => live && setProblem(e instanceof ShareLinkError ? e.problem : "broken"),
    );
    return () => {
      live = false;
    };
  }, [open, doc, options]);
  const toggle = (key: string) =>
    setOmit((was) => {
      const next = new Set(was);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {}
  };
  const hint = scope === "look" ? t("shareScopeLookHint", lang) : scope === "samples" ? t("shareScopeSamplesHint", lang) : t("shareScopeFullHint", lang);
  const small = { fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, margin: 0 } as const;
  const action = (label: string, onClick: () => void, o: { primary?: boolean; disabled?: boolean; data?: string } = {}) => (
    <button
      onClick={onClick}
      disabled={o.disabled}
      className="m3-press"
      {...(o.data ? { [`data-${o.data}`]: "" } : {})}
      style={{ height: 40, padding: "0 18px", borderRadius: 20, border: "none", background: o.primary ? p.primary : "transparent", color: o.primary ? p.onPrimary : p.primary, opacity: o.disabled ? 0.5 : 1, fontSize: 14, fontWeight: 600, cursor: o.disabled ? "default" : "pointer", whiteSpace: "nowrap" }}
    >
      {label}
    </button>
  );
  return (
    <>
      {open && (
        <motion.div
          key="share-link-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          style={{ position: "fixed", inset: 0, zIndex: 610, background: "rgba(0,0,0,0.32)", display: "grid", placeItems: "center", padding: 24 }}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-label={t("shareLinkTitle", lang)}
            data-share-link-dialog
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(100%, 560px)", maxHeight: "calc(100vh - 48px)", overflowY: "auto", padding: 24, borderRadius: 28, background: p.surfaceContainerHigh, color: p.onSurface, boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", gap: 14, boxSizing: "border-box" }}
          >
            <span style={{ fontSize: 22 }}>{t("shareLinkTitle", lang)}</span>
            <p style={small}>{t("shareLinkNotice", lang)}</p>
            <Segmented<ShareScope>
              p={p}
              label={t("shareScope", lang)}
              value={scope}
              onChange={setScope}
              options={SHARE_SCOPES.map((k) => ({ key: k, label: t(k === "look" ? "shareScopeLook" : k === "samples" ? "shareScopeSamples" : "shareScopeFull", lang) }))}
            />
            <p style={small} data-share-scope-hint>
              {hint}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-share-items>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{t("shareCarries", lang)}</span>
              {items.length === 0 && <p style={small}>{t("shareNothingMore", lang)}</p>}
              {items.map((i) => (
                <div key={i.key} data-share-item={i.key} data-included={i.included ? "1" : "0"} title={i.locked ? t("shareItemNeeded", lang) : undefined} style={{ opacity: i.locked ? 0.6 : 1, pointerEvents: i.locked ? "none" : undefined }}>
                  <Toggle p={p} on={i.included} onChange={() => toggle(i.key)} label={i.locked ? `${itemText(i, lang)} · ${t("shareItemNeeded", lang)}` : itemText(i, lang)} grow />
                </div>
              ))}
              <p style={small}>{t("shareAlways", lang)}</p>
            </div>
            <details data-share-preview style={{ fontSize: 13 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>{t("sharePreview", lang)}</summary>
              <pre style={{ margin: "8px 0 0", maxHeight: 240, overflow: "auto", padding: 12, borderRadius: 12, background: p.surface, color: p.onSurface, fontSize: 11, lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{preview}</pre>
            </details>
            {problem ? (
              <p role="alert" style={{ ...small, color: p.error }} data-share-problem={problem}>
                {t("shareTooLong", lang)}
              </p>
            ) : (
              <p style={small} data-share-size>
                {link ? fill(t("shareSize", lang), { n: (link.length - appUrl().length).toLocaleString(lang) }) : "…"}
              </p>
            )}
            <input readOnly value={link ?? ""} aria-label={t("shareLinkCopy", lang)} data-share-link onFocus={(e) => e.currentTarget.select()} style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 12, border: "none", background: p.surface, color: p.onSurfaceVariant, font: "inherit", fontSize: 12 }} />
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
              {action(t("cancel", lang), onClose)}
              {action(copied ? t("copied", lang) : t("shareLinkCopy", lang), () => void copy(), { primary: true, disabled: !link, data: "share-copy" })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
