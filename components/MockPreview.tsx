import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Doc, Palette } from "@/lib/tokens";
import type { Transport } from "@/lib/api/transport";
import type { ControlledClock, MockLogEntry, MockTransport, Route } from "@/lib/mocks";
import { createMockCapabilities, type CapabilityLogEntry, type MockCapabilities } from "@/lib/capabilities/mock";
import { FAILURE_WORDS } from "@/lib/i18n/capabilities";
import { t, useLang } from "@/lib/i18n";
import { Icon } from "./Icon";

/* The preview's mock library (lib/mocks, docs/模拟库.md): one mock transport per preview session, which the preview's
 * runtime calls the API through (`useMockTransport`), the platform capabilities answered the same way
 * (lib/capabilities/mock.ts: a payment submitted or cancelled, the location denied), a switch of scenario in the
 * preview's bar, and a log of the requests and the invokes with a way to try an endpoint by hand. The mocks load with
 * the first preview of a document that has an API or scenarios, never with the editor. A scenario switched here is the
 * preview's own: the document keeps its choice. */

export type PreviewMocks = {
  transport: MockTransport;
  /** what the preview's invokes go through, in the same scenario and session */
  capabilities: MockCapabilities;
  /** the invokes, as the log lists them beside the requests */
  invocations: CapabilityLogEntry[];
  scenario: string | undefined;
  setScenario: (id: string | undefined) => void;
  /** starts the data over in the same scenario */
  reset: () => void;
  /** counts the sessions the mocks have begun here: a scenario chosen or a reset begins one, with its data made
   *  afresh and no tokens, so what the preview's screens hold starts over too */
  session: number;
  log: MockLogEntry[];
  clearLog: () => void;
  /** the operations, read from REST conventions, for trying one */
  routes: Route[];
  /** what an answer said, in short, for the log: by entry id */
  answers: Map<number, string>;
  /** the mocks' clock: the time the app reads (`now`, a countdown), the realtime scripts' messages, the answers' waits;
   *  it can stand still and run at another rate */
  clock: { paused: boolean; rate: number; pause: () => void; resume: () => void; setRate: (rate: number) => void };
};

export const PreviewMocksContext = createContext<PreviewMocks | null>(null);

/** the transport the preview's runtime answers the API with: the mocks, or null when the document has no API */
export const useMockTransport = (): Transport | null => useContext(PreviewMocksContext)?.transport ?? null;

/** the preview's mocks, made from the document's API and mock settings when the preview opens */
export function usePreviewMocks(doc: Pick<Doc, "api" | "mocks" | "collections" | "capabilities">): PreviewMocks | null {
  const lang = useLang();
  /* a document with no API may still have scenarios that say how its capabilities answer */
  const has = !!doc.api?.endpoints?.length || !!doc.api?.channels?.length || !!doc.mocks?.scenarios?.length || !!doc.mocks?.capabilities;
  const [made, setMade] = useState<{ transport: MockTransport; capabilities: MockCapabilities; routes: Route[]; clock: ControlledClock } | null>(null);
  /* the clock's state, drawn again on each pause, resume and change of rate */
  const [clockState, setClockState] = useState({ paused: false, rate: 1 });
  const [scenario, setScenarioNow] = useState<string | undefined>(undefined);
  const [session, setSession] = useState(0);
  const [log, setLog] = useState<MockLogEntry[]>([]);
  const [invocations, setInvocations] = useState<CapabilityLogEntry[]>([]);
  const answers = useRef(new Map<number, string>());
  useEffect(() => {
    if (!has) return;
    let live = true;
    let transport: MockTransport | undefined;
    let unlisten = () => {};
    void import("@/lib/mocks").then((m) => {
      if (!live) return;
      const source = { api: doc.api, mocks: doc.mocks, collections: doc.collections };
      /* a clock the bar can stop and speed up; the data is still made around the day, as with the platform's clock */
      const clock = m.controlledClock();
      unlisten = clock.listen(() => setClockState({ paused: clock.paused, rate: clock.rate }));
      setClockState({ paused: false, rate: 1 });
      const made = m.createMockTransport(source, { locale: doc.mocks?.locale ?? lang, clock, now: Math.floor(Date.now() / 86_400_000) * 86_400_000, onLog: (e) => setLog((l) => [...l.slice(-199), e]) });
      /* the log keeps a few words of each answer */
      const ask = made.request.bind(made);
      made.request = async (req) => {
        const out = await ask(req);
        const last = made.log.at(-1);
        if (last) answers.current.set(last.id, summary(out.status, out.body));
        return out;
      };
      transport = made;
      const capabilities = createMockCapabilities({ ...doc.mocks, locale: doc.mocks?.locale ?? lang }, doc.capabilities, { scenario: made.scenario, onLog: (e) => setInvocations((l) => [...l.slice(-199), e]) });
      setMade({ transport: made, capabilities, routes: m.compileRoutes(doc.api ?? {}, doc.mocks), clock });
      setScenarioNow(made.scenario);
    });
    return () => {
      live = false;
      unlisten();
      transport?.close();
    };
  }, [has, doc.api, doc.mocks, doc.collections, doc.capabilities, lang]);
  return useMemo(
    () =>
      made && {
        transport: made.transport,
        capabilities: made.capabilities,
        invocations,
        routes: made.routes,
        scenario,
        setScenario: (id) => {
          made.transport.setScenario(id);
          made.capabilities.setScenario(made.transport.scenario);
          setScenarioNow(made.transport.scenario);
          setSession((n) => n + 1);
        },
        reset: () => {
          made.transport.reset();
          made.capabilities.reset();
          setSession((n) => n + 1);
        },
        session,
        log,
        clearLog: () => {
          setLog([]);
          setInvocations([]);
        },
        answers: answers.current,
        clock: {
          ...clockState,
          pause: () => made.clock.pause(),
          resume: () => made.clock.resume(),
          setRate: (rate: number) => made.clock.setRate(rate),
        },
      },
    [made, scenario, log, invocations, session, clockState],
  );
}

/** an answer in a few words: how many items, the problem's words, a file's name */
function summary(status: number, body: unknown): string {
  if (status === 0) return "";
  if (Array.isArray(body)) return `[${body.length}]`;
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.dataUrl === "string") return String(o.name ?? "file");
    if (typeof o.detail === "string") return o.detail;
    const list = Object.entries(o).find(([, v]) => Array.isArray(v));
    if (list) return `${list[0]}[${(list[1] as unknown[]).length}]`;
    return Object.keys(o).slice(0, 4).join(", ");
  }
  return body === undefined ? "" : String(body).slice(0, 60);
}

const statusColor = (p: Palette, status: number) => (status === 0 || status >= 500 ? p.error : status >= 400 ? p.onTertiaryContainer : p.primary);

/** the preview bar's switch of scenario: Normal, then the document's scenarios */
export function MockScenarioSwitch({ mocks, scenarios, p, wide, barBtn }: { mocks: PreviewMocks; scenarios: { id: string; name: string }[]; p: Palette; wide: boolean; barBtn: React.CSSProperties }) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);
  const current = scenarios.find((s) => s.id === mocks.scenario);
  const label = current?.name ?? t("mocksNormal", lang);
  return (
    <div ref={box} style={{ position: "relative", minWidth: 0 }}>
      <button
        data-preview-scenario-button={mocks.scenario ?? ""}
        onClick={() => setOpen((v) => !v)}
        title={`${t("mocksPreviewScenario", lang)}: ${label}`}
        aria-label={`${t("mocksPreviewScenario", lang)}: ${label}`}
        aria-expanded={open}
        className="m3-press"
        style={{ ...barBtn, width: "100%", color: current ? p.onTertiaryContainer : p.onSurfaceVariant, background: current ? p.tertiaryContainer : "transparent" }}
      >
        <Icon name="science" size={20} />
        {wide && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1, textAlign: "left" }}>{label}</span>}
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", ...(wide ? { right: "calc(100% + 14px)", bottom: 0 } : { bottom: 48, left: "50%", transform: "translateX(-50%)" }), minWidth: 180, maxWidth: "calc(100vw - 24px)", maxHeight: "50vh", overflowY: "auto", padding: 6, borderRadius: 18, background: p.surfaceContainerLow, boxShadow: "0 6px 20px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", gap: 2, zIndex: 2 }}>
          {[{ id: "", name: t("mocksNormal", lang) }, ...scenarios].map((s) => {
            const on = (mocks.scenario ?? "") === s.id;
            return (
              <button
                key={s.id || "normal"}
                role="menuitemradio"
                aria-checked={on}
                data-preview-scenario={s.id}
                onClick={() => {
                  setOpen(false);
                  mocks.setScenario(s.id || undefined);
                }}
                className="m3-press"
                style={{ height: 40, padding: "0 14px 0 10px", borderRadius: 12, border: "none", background: on ? p.secondaryContainer : "transparent", color: on ? p.onSecondaryContainer : p.onSurface, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap", textAlign: "left" }}
              >
                <span style={{ width: 18, display: "inline-flex" }}>{on ? <Icon name="check" size={18} /> : null}</span>
                {s.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** the rates the bar offers the mocks' clock */
const CLOCK_STEPS = [0.5, 1, 2, 5, 10];

/** The preview bar's control of the mocks' clock, beside the scenarios: stop and go on, and how fast it runs. What the
 *  app reads as `now`, its countdowns and the realtime scripts' messages follow it. */
export function MockClockSwitch({ mocks, p, wide, barBtn }: { mocks: PreviewMocks; p: Palette; wide: boolean; barBtn: React.CSSProperties }) {
  const lang = useLang();
  const { paused, rate } = mocks.clock;
  const next = CLOCK_STEPS[(CLOCK_STEPS.indexOf(rate) + 1) % CLOCK_STEPS.length] ?? 1;
  const off = paused || rate !== 1;
  return (
    <div role="group" aria-label={t("mocksClock", lang)} style={{ display: "flex", gap: 2, minWidth: 0 }}>
      <button
        data-preview-clock-pause={paused ? "paused" : "running"}
        onClick={() => (paused ? mocks.clock.resume() : mocks.clock.pause())}
        title={t(paused ? "mocksClockResume" : "mocksClockPause", lang)}
        aria-label={t(paused ? "mocksClockResume" : "mocksClockPause", lang)}
        aria-pressed={paused}
        className="m3-press"
        style={{ ...barBtn, flex: 1, color: off ? p.onTertiaryContainer : p.onSurfaceVariant, background: off ? p.tertiaryContainer : "transparent" }}
      >
        <Icon name={paused ? "play_arrow" : "pause"} size={20} />
        {wide && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1, textAlign: "left" }}>{paused ? t("mocksClockPaused", lang) : t("mocksClock", lang)}</span>}
      </button>
      <button
        data-preview-clock-rate={rate}
        onClick={() => mocks.clock.setRate(next)}
        title={`${t("mocksClockRate", lang)}: ${rate}×`}
        aria-label={`${t("mocksClockRate", lang)}: ${rate}×`}
        className="m3-press"
        style={{ ...barBtn, width: "auto", padding: "0 8px", fontVariantNumeric: "tabular-nums", color: rate !== 1 ? p.onTertiaryContainer : p.onSurfaceVariant, background: rate !== 1 ? p.tertiaryContainer : "transparent" }}
      >
        {`${rate}×`}
      </button>
    </div>
  );
}

/** a request a route can be tried with: its path parameters filled from the first record there is */
function sampleRequest(mocks: PreviewMocks, r: Route) {
  const first = r.model ? mocks.transport.records(r.model)[0] : undefined;
  const path = r.path.replace(/\{([^{}]+)\}/g, (_all, name: string) => encodeURIComponent(String((name === r.idParam && r.idField ? first?.[r.idField] : first?.[name]) ?? "1")));
  return { method: r.method as "GET", path, operationId: r.operationId };
}

/** The requests the preview made, newest first, with what each answered; and a row to try an endpoint by hand. */
export function MockLogPanel({ mocks, p, onClose }: { mocks: PreviewMocks; p: Palette; onClose: () => void }) {
  const lang = useLang();
  const tryable = mocks.routes.filter((r) => r.method === "GET");
  const [pick, setPick] = useState(tryable[0]?.operationId ?? "");
  return (
    <div data-preview-log style={{ position: "absolute", left: 12, top: 12, width: 340, maxWidth: "calc(100vw - 24px)", maxHeight: "calc(100% - 96px)", display: "flex", flexDirection: "column", borderRadius: 20, background: p.surfaceContainerLow, boxShadow: "0 6px 24px rgba(0,0,0,0.18)", overflow: "hidden", pointerEvents: "auto", zIndex: 3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 8px 6px 14px" }}>
        <Icon name="receipt_long" size={18} color={p.onSurfaceVariant} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: p.onSurface }}>{t("mocksLog", lang)}</span>
        <button title={t("mocksReset", lang)} aria-label={t("mocksReset", lang)} onClick={mocks.reset} className="m3-press" style={{ width: 32, height: 32, border: "none", borderRadius: 16, background: "transparent", color: p.onSurfaceVariant, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="restart_alt" size={18} />
        </button>
        <button title={t("mocksClearLog", lang)} aria-label={t("mocksClearLog", lang)} onClick={mocks.clearLog} className="m3-press" style={{ width: 32, height: 32, border: "none", borderRadius: 16, background: "transparent", color: p.onSurfaceVariant, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="delete_sweep" size={18} />
        </button>
        <button title={t("close", lang)} aria-label={t("close", lang)} onClick={onClose} className="m3-press" style={{ width: 32, height: 32, border: "none", borderRadius: 16, background: "transparent", color: p.onSurfaceVariant, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="close" size={18} />
        </button>
      </div>
      {tryable.length > 0 && (
        <div style={{ display: "flex", gap: 6, padding: "0 10px 8px 12px", alignItems: "center" }}>
          <select data-preview-try-op aria-label={t("mocksTry", lang)} value={pick} onChange={(e) => setPick(e.target.value)} style={{ flex: 1, minWidth: 0, height: 32, borderRadius: 8, border: `1px solid ${p.outlineVariant}`, background: p.surfaceContainerHigh, color: p.onSurface, fontSize: 12, padding: "0 6px" }}>
            {tryable.map((r) => (
              <option key={r.operationId} value={r.operationId}>
                {r.method} {r.path} · {r.operationId}
              </option>
            ))}
          </select>
          <button
            data-preview-try
            onClick={() => {
              const r = tryable.find((x) => x.operationId === pick);
              if (r) void mocks.transport.request(sampleRequest(mocks, r));
            }}
            className="m3-press"
            style={{ height: 32, padding: "0 12px", borderRadius: 16, border: "none", background: p.primary, color: p.onPrimary, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <Icon name="send" size={16} />
            {t("mocksSend", lang)}
          </button>
        </div>
      )}
      <div className="no-scrollbar" style={{ overflowY: "auto", padding: "0 6px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {mocks.log.length === 0 && mocks.invocations.length === 0 && <div style={{ fontSize: 12, color: p.onSurfaceVariant, padding: "6px 8px" }}>{t("mocksLogEmpty", lang)}</div>}
        {[...mocks.log.map((e): LogRow => ({ at: e.at, request: e })), ...mocks.invocations.map((e): LogRow => ({ at: e.at, invoke: e }))]
          .sort((a, b) => b.at - a.at)
          .map((x) => (x.invoke ? <InvokeRow key={`i${x.invoke.id}`} e={x.invoke} p={p} /> : x.request ? <RequestRow key={`r${x.request.id}`} e={x.request} mocks={mocks} p={p} /> : null))}
      </div>
    </div>
  );
}

/** a line of the log: a request, or an invoke */
type LogRow = { at: number; request?: MockLogEntry; invoke?: CapabilityLogEntry };

const MONO: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11 };

/** what a capability gave back, in a few words */
const resultWords = (v: unknown) => {
  if (v === undefined || v === null) return "";
  const text = typeof v === "string" ? v : JSON.stringify(v);
  return text === "{}" ? "" : text.slice(0, 80);
};

/** One invoke of a capability: its name, what it came to (a failure by its kind), how long it took. */
function InvokeRow({ e, p }: { e: CapabilityLogEntry; p: Palette }) {
  const lang = useLang();
  return (
    <div data-preview-log-invoke={e.capability} data-outcome={e.ok ? "ok" : e.failure} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", columnGap: 8, alignItems: "center", padding: "6px 8px", borderRadius: 10, background: p.surfaceContainer }}>
      <span style={{ ...MONO, fontWeight: 700, color: p.onSurfaceVariant }}>{t("capLogInvoke", lang)}</span>
      <span style={{ ...MONO, color: p.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={JSON.stringify(e.args)}>
        {e.capability}
      </span>
      <span style={{ ...MONO, fontWeight: 700, color: e.ok ? p.primary : p.error }}>{e.ok ? "ok" : e.failure}</span>
      <span />
      <span style={{ fontSize: 11, color: p.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.ok ? resultWords(e.result) : t(FAILURE_WORDS[e.failure ?? "failed"], lang)}</span>
      <span style={{ ...MONO, color: p.onSurfaceVariant }}>{e.ms} ms</span>
    </div>
  );
}

/** one request to the API and what it answered */
function RequestRow({ e, mocks, p }: { e: MockLogEntry; mocks: PreviewMocks; p: Palette }) {
  const lang = useLang();
  const mono = MONO;
  return (
          <div key={e.id} data-preview-log-entry={e.operationId ?? ""} data-status={e.status} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", columnGap: 8, alignItems: "center", padding: "6px 8px", borderRadius: 10, background: p.surfaceContainer }}>
            <span style={{ ...mono, fontWeight: 700, color: p.onSurfaceVariant }}>{e.method}</span>
            <span style={{ ...mono, color: p.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.path}>
              {e.path}
            </span>
            <span style={{ ...mono, fontWeight: 700, color: statusColor(p, e.status) }}>{e.status === 0 ? "—" : e.status}</span>
            <span />
            <span style={{ fontSize: 11, color: p.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {e.status === 0 ? t("mocksNoAnswer", lang) : [e.note, mocks.answers.get(e.id)].filter(Boolean).join(" · ")}
            </span>
            <span style={{ ...mono, color: p.onSurfaceVariant }}>{e.ms} ms</span>
          </div>
  );
}
