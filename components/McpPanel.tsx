/* The MCP connection in the editor: a button at the foot of the left rail (a dot says it is connected, or that
 * something waits for the author), its panel (the switch, each server found with its client and access, disconnect,
 * the clients it remembers with a way to forget each, the activity log), the pairing and confirmation asks over the
 * page (a pairing may be remembered for that client), and the offscreen layer screenshots are taken of. The work
 * itself is src/editor/useMcpBridge.ts and lib/mcp/editorBridge.ts. */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DocStore } from "@/lib/core";
import { useStoreSelector } from "@/lib/core/react";
import type { Lang } from "@/lib/i18n";
import { mcpText, type McpKey } from "@/lib/i18n/mcp";
import type { BridgeAsk, BridgeConn, BridgeEntry, RememberedClient } from "@/lib/mcp/editorBridge";
import type { ClientInfo } from "@/lib/mcp/protocol";
import type { Doc, Palette, Theme } from "@/lib/tokens";
import { capture, layerDrawn, ShotLayer } from "@/src/editor/screenShot";
import { useMcpBridge } from "@/src/editor/useMcpBridge";
import { Icon } from "./Icon";
import { IconBtn, Toggle, useDismiss } from "./ui";

const clientName = (c: ClientInfo | null | undefined, lang: Lang) => c?.title || c?.name || mcpText("someClient", lang);

function Btn({ p, label, kind = "text", onClick, autoFocus, disabled }: { p: Palette; label: string; kind?: "filled" | "tonal" | "text"; onClick: () => void; autoFocus?: boolean; disabled?: boolean }) {
  return (
    <button
      autoFocus={autoFocus}
      onClick={onClick}
      disabled={disabled}
      className="m3-press"
      style={{
        height: 40,
        padding: "0 16px",
        borderRadius: 20,
        border: "none",
        background: kind === "filled" ? p.primary : kind === "tonal" ? p.secondaryContainer : "transparent",
        color: kind === "filled" ? p.onPrimary : kind === "tonal" ? p.onSecondaryContainer : p.primary,
        fontSize: 14,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.38 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

/** the seconds left before an unanswered confirmation is declined */
function useCountdown(until: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

function AskCard({ ask, p, lang, onApprove, onDeny, onAnswer }: { ask: BridgeAsk; p: Palette; lang: Lang; onApprove: (port: number, edit: boolean, code: string, remember: boolean) => void; onDeny: (port: number) => void; onAnswer: (id: string, allow: boolean) => void }) {
  const left = useCountdown(ask.kind === "confirm" ? ask.until : 0);
  const name = clientName(ask.client, lang);
  const [remember, setRemember] = useState(false);
  /* the code the author reads off their MCP client and types here: the server never sends it to the page */
  const [code, setCode] = useState("");
  const digits = code.replace(/\D/g, "");
  const ready = digits.length === 6;
  const approve = (edit: boolean) => ready && ask.kind === "pair" && onApprove(ask.port, edit, digits, remember);
  return (
    <div
      role="alertdialog"
      aria-label={ask.kind === "pair" ? mcpText("pairTitle", lang, { client: name }) : mcpText("confirmTitle", lang, { client: name })}
      data-mcp-ask={ask.kind}
      style={{ width: "min(400px, calc(100vw - 32px))", padding: 20, borderRadius: 24, background: p.surfaceContainerHigh, color: p.onSurface, boxShadow: "0 12px 32px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", gap: 12, pointerEvents: "auto" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name={ask.kind === "pair" ? "cable" : "delete_sweep"} size={22} color={ask.kind === "pair" ? p.primary : p.error} />
        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{ask.kind === "pair" ? mcpText("pairTitle", lang, { client: name }) : mcpText("confirmTitle", lang, { client: name })}</div>
      </div>
      {ask.kind === "pair" ? (
        <>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: p.onSurfaceVariant }}>
            {mcpText("pairBody", lang, { client: name })}
            {ask.offered === "read" ? ` ${mcpText("pairReadOnlyOffered", lang)}` : ""}
          </div>
          <input
            data-mcp-code-input
            aria-label={mcpText("codeLabel", lang)}
            placeholder="000-000"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={11}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") approve(ask.offered === "edit");
            }}
            style={{ height: 56, boxSizing: "border-box", width: "100%", padding: "0 12px", borderRadius: 12, border: `2px solid ${ask.left !== undefined ? p.error : p.outline}`, background: p.surface, color: p.onSurface, fontSize: 28, fontWeight: 700, letterSpacing: 4, textAlign: "center", fontVariantNumeric: "tabular-nums", outline: "none" }}
          />
          {ask.left !== undefined && (
            <div role="alert" data-mcp-code-wrong style={{ fontSize: 12, color: p.error }}>
              {mcpText("codeWrong", lang, { n: ask.left })}
            </div>
          )}
          {ask.canRemember && (
            <label data-mcp-remember style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, lineHeight: 1.4, color: p.onSurface, cursor: "pointer" }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: 18, height: 18, margin: "1px 0 0", accentColor: p.primary, flex: "0 0 auto" }} />
              <span>
                <span style={{ fontWeight: 600 }}>{mcpText("remember", lang)}</span>
                <span style={{ display: "block", fontSize: 12, color: p.onSurfaceVariant }}>{mcpText("rememberHint", lang, { client: name })}</span>
              </span>
            </label>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, flexWrap: "wrap" }}>
            <Btn p={p} label={mcpText("deny", lang)} onClick={() => onDeny(ask.port)} />
            {ask.offered === "edit" && <Btn p={p} kind="tonal" disabled={!ready} label={mcpText("allowRead", lang)} onClick={() => approve(false)} />}
            <Btn p={p} kind="filled" disabled={!ready} label={ask.offered === "edit" ? mcpText("allowEdit", lang) : mcpText("allowRead", lang)} onClick={() => approve(ask.offered === "edit")} />
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: p.onSurfaceVariant }}>{mcpText("confirmBody", lang, { name: ask.name })}</div>
          {ask.changed && (
            <div role="alert" data-mcp-confirm-changed style={{ fontSize: 12, lineHeight: 1.4, color: p.error }}>
              {mcpText("confirmChanged", lang)}
            </div>
          )}
          {ask.summary &&<code style={{ fontSize: 12, padding: "8px 10px", borderRadius: 10, background: p.surfaceContainer, color: p.onSurface, overflowWrap: "anywhere" }}>{ask.summary}</code>}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ flex: 1, fontSize: 12, color: p.onSurfaceVariant }}>{mcpText("confirmLeft", lang, { n: left })}</span>
            <Btn p={p} label={mcpText("decline", lang)} onClick={() => onAnswer(ask.id, false)} />
            <Btn p={p} kind="filled" label={mcpText("allow", lang)} onClick={() => onAnswer(ask.id, true)} />
          </div>
        </>
      )}
    </div>
  );
}

const PHASE: Record<BridgeConn["phase"], McpKey> = { connecting: "looking", pairing: "pairing", paired: "paired", refused: "refusedDenied", closed: "closed" };
const REFUSED: Record<string, McpKey> = { busy: "refusedBusy", protocol: "refusedProtocol", denied: "refusedDenied", disconnected: "refusedDisconnected", locked: "refusedLocked" };
const STATE: Record<BridgeEntry["state"], McpKey> = { running: "stateRunning", asking: "stateAsking", ok: "stateOk", error: "stateError", denied: "stateDenied" };

function ConnRow({ c, p, lang, onDisconnect }: { c: BridgeConn; p: Palette; lang: Lang; onDisconnect: () => void }) {
  const dot = c.phase === "paired" ? "#1e8e3e" : c.phase === "pairing" ? p.primary : p.outline;
  const what = c.phase === "refused" ? mcpText(REFUSED[c.reason ?? "denied"] ?? "refusedDenied", lang) : mcpText(PHASE[c.phase], lang);
  return (
    <div data-mcp-conn={c.phase} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 16, background: p.surfaceContainer }}>
      <span aria-hidden style={{ width: 10, height: 10, borderRadius: 5, background: dot, flex: "0 0 auto" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: p.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clientName(c.client, lang)}</div>
        <div style={{ fontSize: 12, color: p.onSurfaceVariant }}>
          {what}
          {c.phase === "paired" && ` · ${mcpText(c.access === "edit" ? "canEdit" : "readOnly", lang)}`}
          {c.phase === "paired" && c.remembered && ` · ${mcpText("rememberedVia", lang)}`}
          {` · :${c.port}`}
          {c.server ? ` · v${c.server.version}` : ""}
        </div>
        {c.phase === "paired" && c.generate && <div style={{ fontSize: 11, color: p.onSurfaceVariant }}>{mcpText("drawing", lang)}</div>}
      </div>
      {(c.phase === "paired" || c.phase === "pairing") && <IconBtn icon="link_off" p={p} size={32} title={mcpText("disconnect", lang)} onClick={onDisconnect} />}
    </div>
  );
}

function RememberedRow({ r, p, lang, onForget }: { r: RememberedClient; p: Palette; lang: Lang; onForget: () => void }) {
  const when = new Date(r.used).toLocaleDateString(lang, { month: "short", day: "numeric" });
  return (
    <div data-mcp-remembered={r.client.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px 6px 12px", borderRadius: 16, background: p.surfaceContainer }}>
      <Icon name="verified_user" size={18} color={p.onSurfaceVariant} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: p.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clientName(r.client, lang)}</div>
        <div style={{ fontSize: 12, color: p.onSurfaceVariant }}>
          {mcpText(r.access === "edit" ? "canEdit" : "readOnly", lang)} · {mcpText("usedAt", lang, { when })}
        </div>
      </div>
      <Btn p={p} label={mcpText("forget", lang)} onClick={onForget} />
    </div>
  );
}

function LogRow({ e, p, lang }: { e: BridgeEntry; p: Palette; lang: Lang }) {
  const color = e.state === "ok" ? p.onSurfaceVariant : e.state === "error" || e.state === "denied" ? p.error : p.primary;
  const time = new Date(e.at).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <div data-mcp-log={e.name} title={e.error ?? e.summary} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", columnGap: 8, rowGap: 2, padding: "6px 2px", borderBottom: `1px solid ${p.outlineVariant}` }}>
      <span style={{ fontSize: 11, color: p.onSurfaceVariant, fontVariantNumeric: "tabular-nums" }}>{time}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: p.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
      <span style={{ fontSize: 11, color }}>
        {mcpText(STATE[e.state], lang)}
        {e.ms !== undefined ? ` · ${e.ms < 1000 ? `${e.ms} ms` : `${(e.ms / 1000).toFixed(1)} s`}` : ""}
      </span>
      {(e.summary || e.error) && <span style={{ gridColumn: "2 / 4", fontSize: 11, color: e.error ? p.error : p.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.error ?? e.summary}</span>}
    </div>
  );
}

/** The MCP button, its panel and asks, mounted at the foot of the left rail. */
export function McpConnect({ store, p, theme, lang, enabled, size = 44 }: { store: DocStore; p: Palette; theme: Theme; lang: Lang; enabled: boolean; size?: number }) {
  const { bridge, view, on, setOn, shot, shotDone } = useMcpBridge({ store, enabled });
  /* the document as it is, while a screenshot is being taken; the rest of the time the button draws nothing of it */
  const state = useStoreSelector(store, (v) => (shot ? v.state : null));
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const asksBox = useRef<HTMLDivElement>(null);
  /* answering an ask is not leaving the panel */
  useDismiss(open, () => setOpen(false), [button, panel, asksBox]);

  /* a screenshot: the export layer drawn with the canvas as it is, then turned into pixels */
  useEffect(() => {
    if (!shot) return;
    let gone = false;
    void (async () => {
      try {
        await layerDrawn(shot.doc ?? (store.get().doc as Doc));
        if (gone || !layer.current) return;
        shot.resolve(await capture(layer.current, shot.frame, shot.scale, shot.crop));
      } catch (e) {
        shot.reject(e);
      }
      if (!gone) shotDone();
    })();
    return () => {
      gone = true;
    };
    // the layer is drawn for this one job; a change of the document meanwhile is in the next one
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot]);

  const paired = view.conns.filter((c) => c.phase === "paired");
  const asking = view.asks.length > 0;
  const dot = !on ? null : asking ? p.primary : paired.length ? "#1e8e3e" : p.outline;
  const rect = open ? button.current?.getBoundingClientRect() : undefined;

  return (
    <>
      <div ref={button} style={{ position: "relative", flex: "0 0 auto" }} data-mcp-button>
        <IconBtn icon="cable" p={p} on={open || paired.length > 0} onClick={() => setOpen((v) => !v)} title={mcpText("connect", lang)} size={size} hasPopup="menu" expanded={open} />
        {dot && <span aria-hidden style={{ position: "absolute", right: 8, top: 8, width: 9, height: 9, borderRadius: 5, background: dot, border: `2px solid ${p.surfaceContainerLow}`, pointerEvents: "none" }} />}
      </div>
      {open &&
        rect &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={mcpText("connect", lang)}
            data-mcp-panel
            style={{ position: "fixed", left: rect.right + 8, bottom: Math.max(8, window.innerHeight - rect.bottom), width: 340, maxHeight: "min(640px, calc(100vh - 16px))", overflowY: "auto", zIndex: 500, padding: 16, borderRadius: 24, background: p.surfaceContainerHigh, color: p.onSurface, boxShadow: "0 12px 32px rgba(0,0,0,0.2), 0 2px 6px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", gap: 12, fontFamily: "Roboto, system-ui, sans-serif" }}
          >
            <Toggle p={p} icon="cable" label={mcpText("connect", lang)} on={on} onChange={setOn} grow />
            {!on && (
              <>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: p.onSurfaceVariant }}>{mcpText("intro", lang)}</div>
                <div style={{ fontSize: 12, color: p.onSurfaceVariant }}>{mcpText("howToStart", lang)}</div>
                <code style={{ fontSize: 12, padding: "8px 10px", borderRadius: 10, background: p.surfaceContainer, color: p.onSurface }}>npx -y m3e-canvas-mcp</code>
                <div style={{ fontSize: 12, color: p.onSurfaceVariant }}>{mcpText("docs", lang)}</div>
              </>
            )}
            {on && (
              <>
                {view.conns.filter((c) => c.server || c.phase !== "connecting").length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 13, color: p.onSurface }}>{mcpText("looking", lang)}</div>
                    <div style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant }}>{mcpText("lookingHint", lang)}</div>
                  </div>
                ) : (
                  view.conns.filter((c) => c.server || c.phase !== "connecting").map((c) => <ConnRow key={c.port} c={c} p={p} lang={lang} onDisconnect={() => bridge?.disconnect(c.port)} />)
                )}
                {view.remembered.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: p.onSurfaceVariant, marginTop: 4 }}>{mcpText("remembered", lang)}</div>
                    {view.remembered.map((r) => (
                      <RememberedRow key={r.id} r={r} p={p} lang={lang} onForget={() => void bridge?.forget(r.id)} />
                    ))}
                  </>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, color: p.onSurfaceVariant, marginTop: 4 }}>{mcpText("activity", lang)}</div>
                {view.log.length === 0 ? <div style={{ fontSize: 12, color: p.onSurfaceVariant }}>{mcpText("noActivity", lang)}</div> : <div>{view.log.slice(0, 30).map((e) => <LogRow key={e.id + e.at} e={e} p={p} lang={lang} />)}</div>}
              </>
            )}
          </div>,
          document.body,
        )}
      {view.asks.length > 0 &&
        createPortal(
          <div ref={asksBox} style={{ position: "fixed", left: 0, right: 0, top: 16, zIndex: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, pointerEvents: "none", fontFamily: "Roboto, system-ui, sans-serif" }}>
            {view.asks.map((a) => (
              <AskCard key={a.kind === "pair" ? `pair:${a.port}` : a.id} ask={a} p={p} lang={lang} onApprove={(port, edit, code, remember) => bridge?.approve(port, edit ? "edit" : "read", { code, remember })} onDeny={(port) => bridge?.deny(port)} onAnswer={(id, allow) => bridge?.answer(id, allow)} />
            ))}
          </div>,
          document.body,
        )}
      {shot && state && createPortal(<ShotLayer layer={layer} frame={shot.frame} doc={shot.doc ?? (state.doc as Doc)} widths={shot.widths ?? state.session.widths} p={p} theme={theme} lang={lang} />, document.body)}
    </>
  );
}
