/* The preview bar's choice of what answers the preview (docs/玩法契约.md “本地 game-loop”, docs/模拟库.md “编辑器”): the
 * mock library, or a local game loop at an address the author types. While the game loop answers, the bar says how it
 * is in plain words (connecting, answering with its contract and version, or what is wrong: nothing there, CORS,
 * another version, no game loop at all), and a button beside it goes back to the mocks in one click. */

import { useEffect, useRef, useState } from "react";
import type { Palette } from "@/lib/tokens";
import { t, useLang, type UIKey } from "@/lib/i18n";
import { GAME_LOOP_HELLO, readGameLoopUrl, type GameLoopStatus, type GameLoopUrlProblem } from "@/lib/gameLoop";
import { Icon } from "../Icon";
import type { PreviewGameLoop } from "./gameLoop";

const URL_WORDS: Record<GameLoopUrlProblem, UIKey> = { empty: "glUrlEmpty", invalid: "glUrlInvalid", scheme: "glUrlScheme", credentials: "glUrlSecret", query: "glUrlSecret" };
const SHORT: Record<GameLoopStatus["state"], UIKey> = { checking: "glShortChecking", ok: "glLoopShort", unreachable: "glShortUnreachable", cors: "glShortCors", "not-a-game-loop": "glShortNotLoop", version: "glShortVersion", namespace: "glShortNamespace" };

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (all, k: string) => v[k] ?? all);

/** how the game loop is, in a sentence */
export function statusWords(s: GameLoopStatus, url: string, lang: Parameters<typeof t>[1]): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  switch (s.state) {
    case "checking":
      return fill(t("glChecking", lang), { url });
    case "ok":
      return fill(t("glOk", lang), { url, namespace: s.hello.namespace, version: s.hello.contractVersion });
    case "unreachable":
      return fill(t("glUnreachable", lang), { url });
    case "cors":
      return fill(t("glCors", lang), { url, origin });
    case "not-a-game-loop":
      return fill(t("glNotLoop", lang), { url, path: GAME_LOOP_HELLO });
    case "version":
      return fill(t("glVersion", lang), { got: `${s.hello.namespace} ${s.hello.contractVersion}`, want: `${s.hello.namespace} ${s.expected}` });
    case "namespace":
      return fill(t("glNamespace", lang), { got: s.hello.namespace, want: s.expected });
  }
}

const failed = (s: GameLoopStatus) => s.state !== "ok" && s.state !== "checking";

export function GameLoopSwitch({ loop, p, wide, barBtn }: { loop: PreviewGameLoop; p: Palette; wide: boolean; barBtn: React.CSSProperties }) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(loop.link?.url ?? "");
  const [problem, setProblem] = useState<GameLoopUrlProblem | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);

  const url = loop.link?.url ?? "";
  const status = loop.status;
  const bad = loop.on && failed(status);
  const words = loop.on ? statusWords(status, url, lang) : t("glMocks", lang);
  const connect = () => {
    const read = readGameLoopUrl(typed);
    if ("problem" in read) {
      setProblem(read.problem);
      field.current?.focus();
      return;
    }
    setProblem(null);
    setTyped(read.url);
    if (loop.on && read.url === url) loop.recheck();
    else loop.connect(read.url);
  };
  const label = !loop.on ? t("glMocks", lang) : status.state === "ok" ? t("glLoopShort", lang) : `${t("glLoopShort", lang)} · ${t(SHORT[status.state], lang)}`;
  const itemStyle = (on: boolean): React.CSSProperties => ({ height: 40, padding: "0 14px 0 10px", borderRadius: 12, border: "none", background: on ? p.secondaryContainer : "transparent", color: on ? p.onSecondaryContainer : p.onSurface, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap", textAlign: "left" });

  return (
    <>
      <div ref={box} style={{ position: "relative", minWidth: 0 }}>
        <button
          data-preview-backend={loop.on ? "game-loop" : "mocks"}
          data-preview-backend-status={loop.on ? status.state : ""}
          onClick={() => setOpen((v) => !v)}
          title={`${t("glAnsweredBy", lang)}: ${words}`}
          aria-label={`${t("glAnsweredBy", lang)}: ${words}`}
          aria-expanded={open}
          className="m3-press"
          style={{ ...barBtn, width: wide ? "100%" : barBtn.width, color: bad ? p.onErrorContainer : loop.on ? p.onTertiaryContainer : p.onSurfaceVariant, background: bad ? p.errorContainer : loop.on ? p.tertiaryContainer : "transparent" }}
        >
          <Icon name={bad ? "sync_problem" : loop.on ? "link" : "science"} size={20} />
          {wide && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1, textAlign: "left" }}>{label}</span>}
        </button>
        {open && (
          <div role="dialog" aria-label={t("glAnsweredBy", lang)} data-preview-backend-menu style={{ position: "absolute", ...(wide ? { right: "calc(100% + 14px)", bottom: 0 } : { bottom: 48, left: "50%", transform: "translateX(-50%)" }), width: 300, maxWidth: "calc(100vw - 24px)", padding: 8, borderRadius: 18, background: p.surfaceContainerLow, boxShadow: "0 6px 20px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", gap: 4, zIndex: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: p.onSurfaceVariant, padding: "4px 8px 2px" }}>{t("glAnsweredBy", lang)}</div>
            <div role="radiogroup" aria-label={t("glAnsweredBy", lang)} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <button role="radio" aria-checked={!loop.on} data-preview-backend-option="mocks" onClick={() => loop.on && loop.toMocks()} className="m3-press" style={itemStyle(!loop.on)}>
                <span style={{ width: 18, display: "inline-flex" }}>{!loop.on ? <Icon name="check" size={18} /> : <Icon name="science" size={18} />}</span>
                {t("glMocks", lang)}
              </button>
              <button
                role="radio"
                aria-checked={loop.on}
                data-preview-backend-option="game-loop"
                onClick={() => {
                  if (loop.on) return;
                  if (url) loop.connect(url);
                  else field.current?.focus();
                }}
                className="m3-press"
                style={itemStyle(loop.on)}
              >
                <span style={{ width: 18, display: "inline-flex" }}>{loop.on ? <Icon name="check" size={18} /> : <Icon name="link" size={18} />}</span>
                {t("glLoop", lang)}
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                connect();
              }}
              style={{ display: "flex", gap: 6, padding: "4px 4px 0", alignItems: "center" }}
            >
              <input
                ref={field}
                data-preview-game-loop-url
                aria-label={t("glAddress", lang)}
                placeholder="http://localhost:8787"
                value={typed}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => {
                  setTyped(e.target.value);
                  setProblem(null);
                }}
                /* the preview's own keys (Escape closes it, Backspace goes back) are not this field's */
                onKeyDown={(e) => e.stopPropagation()}
                aria-invalid={problem ? true : undefined}
                style={{ flex: 1, minWidth: 0, height: 32, borderRadius: 8, border: `1px solid ${problem ? p.error : p.outlineVariant}`, background: p.surfaceContainerHigh, color: p.onSurface, fontSize: 12, padding: "0 8px" }}
              />
              <button type="submit" data-preview-game-loop-connect className="m3-press" style={{ height: 32, padding: "0 12px", borderRadius: 16, border: "none", background: p.primary, color: p.onPrimary, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                {t("glConnect", lang)}
              </button>
            </form>
            {problem && (
              <div data-preview-game-loop-url-problem={problem} role="alert" style={{ fontSize: 11, color: p.error, padding: "0 8px" }}>
                {t(URL_WORDS[problem], lang)}
              </div>
            )}
            {loop.on && (
              <div data-preview-game-loop-status={status.state} role={bad ? "alert" : "status"} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, lineHeight: "16px", padding: "6px 8px", borderRadius: 10, background: bad ? p.errorContainer : p.surfaceContainer, color: bad ? p.onErrorContainer : p.onSurface }}>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{statusWords(status, url, lang)}</span>
                {status.state !== "checking" && (
                  <button data-preview-game-loop-retry onClick={loop.recheck} title={t("glRetry", lang)} aria-label={t("glRetry", lang)} className="m3-press" style={{ width: 28, height: 28, flexShrink: 0, border: "none", borderRadius: 14, background: "transparent", color: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="refresh" size={18} />
                  </button>
                )}
              </div>
            )}
            <div style={{ fontSize: 11, color: p.onSurfaceVariant, padding: "2px 8px 4px" }}>{t("glHint", lang)}</div>
          </div>
        )}
      </div>
      {/* what is wrong, said in the bar itself, and the mocks one click away */}
      {loop.on && bad && wide && (
        <div data-preview-game-loop-problem={status.state} role="alert" style={{ fontSize: 11, lineHeight: "15px", padding: "4px 10px", borderRadius: 12, background: p.errorContainer, color: p.onErrorContainer, overflowWrap: "anywhere" }}>
          {statusWords(status, url, lang)}
        </div>
      )}
      {loop.on && (
        <button data-preview-use-mocks onClick={loop.toMocks} title={t("glUseMocks", lang)} aria-label={t("glUseMocks", lang)} className="m3-press" style={{ ...barBtn, color: p.onSurfaceVariant }}>
          <Icon name="link_off" size={20} />
          {wide && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{t("glUseMocks", lang)}</span>}
        </button>
      )}
    </>
  );
}
