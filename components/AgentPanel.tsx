/* The AI tab of the left rail: a chat with the in-app agent (src/editor/useAgent.ts), and its settings. Each turn shows
 * what the agent is doing as it does it (its plan, each tool with how it went, the pictures it looked at, what it
 * spent), then what changed, to keep or undo as one step. The one-shot actions (a whole draft, a screen's
 * description, a part's behaviour, the scenes' pictures) stay one press away. */

import { useEffect, useRef, useState } from "react";
import type { Palette } from "@/lib/tokens";
import { t, useLang, type UIKey } from "@/lib/i18n";
import { EFFORTS, type AiSettings, type Effort } from "@/lib/ai";
import type { DocDiff } from "@/lib/agent";
import type { Usage } from "@/lib/llm";
import { Icon } from "./Icon";
import { IconBtn, Segmented } from "./ui";
import { AiPanel } from "./AiPanel";
import type { LogEntry, TurnView } from "@/src/editor/useAgent";

export type QuickActions = {
  draft: () => void;
  describe?: () => void;
  behavior?: () => void;
  paint?: () => void;
  /** a request the agent is asked as it stands */
  polish?: () => void;
};

export type AgentApi = {
  turns: TurnView[];
  running: boolean;
  ready: boolean;
  send: (request: string) => void;
  stop: () => void;
  undoTurn: (id: string) => void;
  keepTurn: (id: string) => void;
  retry: (id: string) => void;
  reset: () => void;
};

const GROUP_WORD: Record<string, UIKey> = { read: "agentToolRead", edit: "agentToolBuild", style: "agentToolStyle", data: "agentToolData", generate: "agentToolDraw" };

const kilo = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));

/** what a turn spent: tokens in and out (reasoning among them), and how long it took */
export function usageText(u: Usage, ms: number): string {
  return [`↑ ${kilo(u.input)}${u.cachedInput ? ` (${kilo(u.cachedInput)} cached)` : ""}`, `↓ ${kilo(u.output)}${u.reasoning ? ` (${kilo(u.reasoning)} reasoning)` : ""}`, ms ? `${(ms / 1000).toFixed(1)} s` : ""].filter(Boolean).join(" · ");
}

/** what a turn changed, in a line */
export function diffText(d: DocDiff, lang: ReturnType<typeof useLang>): string {
  const n = (key: UIKey, count: number) => (count ? t(key, lang).replace("{n}", String(count)) : "");
  return [
    n("agentScreensAdded", d.screens.added.length),
    n("agentScreensRemoved", d.screens.removed.length),
    n("agentScreensChanged", d.screens.changed.length),
    n("agentPartsAdded", d.nodes.added.length),
    n("agentPartsRemoved", d.nodes.removed.length),
    n("agentPartsChanged", d.nodes.changed.length),
    n("agentPartsMoved", d.nodes.moved),
    d.doc.length ? t("agentDocChanged", lang).replace("{list}", d.doc.join(", ")) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function Step({ entry, p }: { entry: Extract<LogEntry, { kind: "tool" }>; p: Palette }) {
  const lang = useLang();
  const look = entry.name === "screenshot" ? "agentToolLook" : (GROUP_WORD[entry.group] ?? "agentToolBuild");
  return (
    <div data-agent-step={entry.state} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28, fontSize: 12, color: entry.state === "error" ? p.error : p.onSurfaceVariant }}>
      <span style={{ width: 18, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
        {entry.state === "running" ? <span className="m3-spin" style={{ display: "grid" }}><Icon name="progress_activity" size={16} color={p.primary} /></span> : <Icon name={entry.state === "ok" ? "check_circle" : "error"} size={16} color={entry.state === "ok" ? p.primary : p.error} />}
      </span>
      <span style={{ fontWeight: 600, color: p.onSurface, flex: "0 0 auto" }}>{t(look, lang)}</span>
      <code style={{ fontSize: 11, opacity: 0.8, flex: "0 0 auto" }}>{entry.name}</code>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.summary}>
        {entry.summary}
      </span>
      {entry.ms !== undefined && entry.ms > 900 && <span style={{ flex: "0 0 auto", opacity: 0.7 }}>{(entry.ms / 1000).toFixed(1)} s</span>}
    </div>
  );
}

function Shots({ images, p }: { images: string[]; p: Palette }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!images.length) return null;
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}>
        {images.map((src, i) => (
          <button key={i} type="button" data-agent-shot onClick={() => setOpen(open === i ? null : i)} style={{ padding: 0, border: `1px solid ${open === i ? p.primary : p.outlineVariant}`, borderRadius: 8, background: p.surface, cursor: "zoom-in", overflow: "hidden", height: 112 }}>
            <img src={src} alt="" style={{ height: 110, display: "block" }} />
          </button>
        ))}
      </div>
      {open !== null && images[open] && <img src={images[open]} alt="" onClick={() => setOpen(null)} style={{ width: "100%", borderRadius: 10, border: `1px solid ${p.outlineVariant}`, cursor: "zoom-out", display: "block" }} />}
    </div>
  );
}

const pill = (p: Palette, primary = false): React.CSSProperties => ({
  height: 32,
  padding: "0 14px",
  borderRadius: 16,
  border: primary ? "none" : `1px solid ${p.outline}`,
  background: primary ? p.primary : "transparent",
  color: primary ? p.onPrimary : p.primary,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
});

function Turn({ turn, last, agent, p }: { turn: TurnView; last: boolean; agent: AgentApi; p: Palette }) {
  const lang = useLang();
  const [why, setWhy] = useState(false);
  const firstText = turn.log.findIndex((l) => l.kind === "text");
  const planned = firstText >= 0 && turn.log.slice(firstText + 1).some((l) => l.kind === "tool");
  const live = turn.status === "running";
  const changed = turn.diff ? diffText(turn.diff, lang) : "";
  return (
    <div data-agent-turn={turn.status} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ alignSelf: "flex-end", maxWidth: "88%", padding: "8px 12px", borderRadius: "16px 16px 4px 16px", background: p.secondaryContainer, color: p.onSecondaryContainer, fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{turn.request}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 2px" }}>
        {turn.log.map((l, i) =>
          l.kind === "text" ? (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.5, color: p.onSurface, whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: "4px 0" }}>
              {i === firstText && planned && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: p.onSurfaceVariant, marginBottom: 2 }}>{t("agentPlan", lang)}</div>}
              {l.text}
            </div>
          ) : l.kind === "tool" ? (
            <Step key={l.id || i} entry={l} p={p} />
          ) : (
            <div key={i} style={{ fontSize: 12, color: p.onSurfaceVariant, display: "flex", alignItems: "center", gap: 6, minHeight: 28 }}>
              <Icon name="visibility" size={16} color={p.primary} />
              {t("agentChecking", lang)}
            </div>
          ),
        )}
        {live && (turn.log.length === 0 || turn.log[turn.log.length - 1].kind !== "tool" || (turn.log[turn.log.length - 1] as { state: string }).state !== "running") && (
          <div style={{ fontSize: 12, color: p.onSurfaceVariant, display: "flex", alignItems: "center", gap: 6, minHeight: 28 }}>
            <span className="m3-spin" style={{ display: "grid" }}><Icon name="progress_activity" size={16} color={p.primary} /></span>
            {t("agentThinking", lang)}
          </div>
        )}
        <Shots images={turn.shots} p={p} />
        {turn.reasoning && (
          <button type="button" onClick={() => setWhy(!why)} style={{ alignSelf: "flex-start", border: "none", background: "none", color: p.onSurfaceVariant, fontSize: 12, padding: "2px 0", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <Icon name={why ? "expand_less" : "expand_more"} size={16} />
            {t("agentShowReasoning", lang)}
          </button>
        )}
        {why && <div style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, whiteSpace: "pre-wrap", padding: "6px 10px", borderLeft: `2px solid ${p.outlineVariant}` }}>{turn.reasoning}</div>}
        {turn.error && (
          <div data-agent-error role="alert" style={{ fontSize: 13, lineHeight: 1.45, color: p.onErrorContainer, background: p.errorContainer, borderRadius: 12, padding: "8px 12px", margin: "4px 0" }}>
            {turn.error}
          </div>
        )}
        {turn.status === "stopped" && <div style={{ fontSize: 12, color: p.onSurfaceVariant, margin: "4px 0" }}>{turn.rolledBack ? t("agentStopped", lang) : t("agentStoppedKept", lang)}</div>}
        {!live && turn.status !== "stopped" && (
          <div data-agent-result style={{ marginTop: 4, padding: "10px 12px", borderRadius: 14, background: p.surfaceContainerHigh, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, lineHeight: 1.45, color: p.onSurface }}>{changed || t("agentNothingChanged", lang)}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {turn.step && !turn.verdict && (
                <>
                  <button type="button" data-agent-keep className="m3-press" style={pill(p, true)} onClick={() => agent.keepTurn(turn.id)}>
                    <Icon name="check" size={16} />
                    {t("agentKeep", lang)}
                  </button>
                  <button type="button" data-agent-undo className="m3-press" style={pill(p)} onClick={() => agent.undoTurn(turn.id)}>
                    <Icon name="undo" size={16} />
                    {t("agentUndo", lang)}
                  </button>
                </>
              )}
              {turn.verdict && <span style={{ fontSize: 12, color: p.onSurfaceVariant }}>{t(turn.verdict === "kept" ? "agentKept" : "agentUndone", lang)}</span>}
              {last && !agent.running && (turn.status === "error" || !turn.verdict) && (
                <button type="button" data-agent-retry className="m3-press" style={pill(p)} onClick={() => agent.retry(turn.id)}>
                  <Icon name="refresh" size={16} />
                  {t("agentRetry", lang)}
                </button>
              )}
            </div>
          </div>
        )}
        {(turn.usage.input > 0 || !live) && (
          <div data-agent-usage style={{ fontSize: 11, color: p.onSurfaceVariant, opacity: 0.8, marginTop: 2 }}>
            {usageText(turn.usage, live ? 0 : turn.ms)}
            {turn.drawings ? ` · ${turn.drawings} ✎` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

export function AgentPanel({ p, settings, onSettings, agent, quick, draft }: { p: Palette; settings: AiSettings; onSettings: (s: AiSettings) => void; agent: AgentApi; quick: QuickActions; draft?: string }) {
  const lang = useLang();
  const [view, setView] = useState<"chat" | "settings">(agent.ready ? "chat" : "settings");
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const turns = agent.turns;
  /* the newest words stay in view while they stream */
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);
  /* the prompt bar hands its words here when the panel opens with them */
  useEffect(() => {
    if (draft !== undefined) setText(draft);
  }, [draft]);
  const submit = () => {
    const words = text.trim();
    if (!words || agent.running) return;
    agent.send(words);
    setText("");
  };
  const chips: { key: UIKey; icon: string; run?: () => void }[] = [
    { key: "agentQuickDraft", icon: "auto_awesome", run: quick.draft },
    { key: "agentQuickPolish", icon: "auto_fix_high", run: quick.polish },
    { key: "agentQuickDescribe", icon: "description", run: quick.describe },
    { key: "agentQuickBehavior", icon: "touch_app", run: quick.behavior },
    { key: "agentQuickPaint", icon: "palette", run: quick.paint },
  ];
  return (
    <div data-agent-panel style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 8px" }}>
        <div style={{ flex: 1 }}>
          <Segmented<"chat" | "settings">
            p={p}
            height={36}
            value={view}
            onChange={setView}
            label={t("ai", lang)}
            options={[
              { key: "chat", label: t("agentChat", lang), icon: "forum" },
              { key: "settings", label: t("agentSettingsTab", lang), icon: "tune" },
            ]}
          />
        </div>
        {view === "chat" && <IconBtn p={p} icon="add_comment" title={t("agentNewChat", lang)} onClick={agent.reset} disabled={agent.running || !turns.length} />}
      </div>
      {view === "settings" ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }} className="no-scrollbar">
          <div style={{ padding: "4px 16px 0" }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: p.onSurfaceVariant, margin: "6px 4px 6px" }}>{t("agentEffort", lang)}</div>
            <Segmented<Effort>
              p={p}
              height={36}
              value={settings.effort ?? "medium"}
              onChange={(effort) => onSettings({ ...settings, effort })}
              label={t("agentEffort", lang)}
              options={EFFORTS.map((k) => ({ key: k, label: t(k === "low" ? "agentEffortLow" : k === "high" ? "agentEffortHigh" : "agentEffortMedium", lang) }))}
            />
            <div style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, margin: "8px 4px 0" }}>{t("agentEffortHint", lang)}</div>
          </div>
          <AiPanel p={p} settings={settings} onSettings={onSettings} />
        </div>
      ) : (
        <>
          <div ref={list} className="no-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 14px 12px", display: "flex", flexDirection: "column", gap: 18 }}>
            {!turns.length && (
              <div style={{ fontSize: 13, lineHeight: 1.55, color: p.onSurfaceVariant, padding: "8px 4px" }}>
                {agent.ready ? t("agentEmpty", lang) : t("agentNeedsKey", lang)}
                {!agent.ready && (
                  <div>
                    <button type="button" className="m3-press" style={{ ...pill(p, true), marginTop: 12 }} onClick={() => setView("settings")}>
                      <Icon name="key" size={16} />
                      {t("aiSettings", lang)}
                    </button>
                  </div>
                )}
              </div>
            )}
            {turns.map((turn, i) => (
              <Turn key={turn.id} turn={turn} last={i === turns.length - 1} agent={agent} p={p} />
            ))}
          </div>
          <div style={{ padding: "8px 12px 12px", borderTop: `1px solid ${p.outlineVariant}` }}>
            {!agent.running && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }} aria-label={t("agentQuick", lang)}>
                {chips
                  .filter((c) => c.run)
                  .map((c) => (
                    <button key={c.key} type="button" className="m3-press" onClick={c.run} style={{ flex: "0 0 auto", whiteSpace: "nowrap", height: 28, padding: "0 10px", borderRadius: 8, border: `1px solid ${p.outlineVariant}`, background: p.surface, color: p.onSurfaceVariant, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Icon name={c.icon} size={14} />
                      {t(c.key, lang)}
                    </button>
                  ))}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: "6px 6px 6px 14px", borderRadius: 22, border: `1px solid ${p.outline}`, background: p.surface }}>
              <textarea
                ref={input}
                data-agent-input
                value={text}
                rows={2}
                aria-label={t("agentPlaceholder", lang)}
                placeholder={t("agentPlaceholder", lang)}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
                style={{ flex: 1, resize: "none", border: "none", outline: "none", background: "transparent", color: p.onSurface, fontSize: 13, lineHeight: 1.45, fontFamily: "inherit", padding: "6px 0", maxHeight: 160 }}
              />
              {agent.running ? (
                <button type="button" data-agent-stop title={t("agentStop", lang)} aria-label={t("agentStop", lang)} className="m3-press" onClick={agent.stop} style={{ width: 36, height: 36, borderRadius: 18, border: "none", background: p.errorContainer, color: p.onErrorContainer, display: "grid", placeItems: "center", cursor: "pointer", flex: "0 0 auto" }}>
                  <Icon name="stop" size={20} fill />
                </button>
              ) : (
                <button type="button" data-agent-send title={t("agentSend", lang)} aria-label={t("agentSend", lang)} className="m3-press" disabled={!text.trim() || !agent.ready} onClick={submit} style={{ width: 36, height: 36, borderRadius: 18, border: "none", background: text.trim() && agent.ready ? p.primary : p.surfaceContainerHighest, color: text.trim() && agent.ready ? p.onPrimary : p.onSurfaceVariant, display: "grid", placeItems: "center", cursor: text.trim() && agent.ready ? "pointer" : "default", flex: "0 0 auto" }}>
                  <Icon name="arrow_upward" size={20} />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
