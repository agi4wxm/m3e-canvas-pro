import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { inputLog } from "@/lib/world/channel";
import { connectWorld, createExampleWorld } from "@/lib/world/example";
import { createScriptedWorld } from "@/lib/world/scripted";
import type { WorldEntity, WorldState } from "@/lib/world/types";
import { PartHostContext, domainNow, useHost, type HostProps, type InputChannel } from "./host";
import { drawMesh, meshExt, meshOfDataUrl } from "./mesh";
import { useMockWorld } from "./mockWorld";

/* The world view's stand-in (docs/组件规范.md “世界视口”): the picture is an engine's, so here the scene is words over a
 * picture (an image, or a 3D model turning on a turntable), the entities stand where the design (or its data) says, the
 * camera's one ringed, an entity's hit points a bar over it, and the inputs the design sends are listed as they come,
 * newest last ("move 0.5,-1", "attack ↓"): what the visitor's taps did to the world can be read off it. With a mock
 * world handed to it (mockWorld.ts: the preview's chosen world script, a prototype's, a development build's) it plays
 * that script (lib/world/scripted.ts): the snapshot, the words and the picture change as the script says, on the app's
 * clock, and the design's actions run on the events it sends, the last few listed. Else, in a prototype (`demo`), it
 * plays M3E's example engine (lib/world/example.ts) on the same channel, so the player moves with a joystick and the
 * design's actions on `collected`, `hit` and `ended` run; in a product it only shows the props. An exported app hands
 * the same props, the channel and `onEvent` to the slot where its engine goes. */

/** what each kind of entity is drawn in */
const TONE: Record<string, string> = { player: "bg-primary text-on-primary", enemy: "bg-error text-on-error", coin: "bg-tertiary text-on-tertiary", item: "bg-tertiary text-on-tertiary" };

/** how many of a mock world's events the stand-in lists */
const EVENT_LOG_SIZE = 3;

/** an entity with what a stand-in reads of it beyond the contract's minimum: its hit points */
type Shown = WorldEntity & { hp?: unknown; maxHp?: unknown };

/** a mock world's event in a few words: its name and what it is about */
const eventWords = (name: string, payload: unknown) => {
  const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const about = [p.id, p.amount ?? p.score ?? p.kind].filter((x) => typeof x === "string" || typeof x === "number").join(" ");
  return about ? `${name} ${about}` : name;
};

/** a 3D model turning slowly, drawn on a canvas over what is under it (still where motion is reduced) */
function WorldModel({ url, width, height }: { url: string; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mesh = useMemo(() => meshOfDataUrl(url), [url]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !mesh) return;
    let yaw = 0.7;
    drawMesh(canvas, mesh, yaw, "transparent");
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = requestAnimationFrame(function turn() {
      yaw += 0.01;
      drawMesh(canvas, mesh, yaw, "transparent");
      frame = requestAnimationFrame(turn);
    });
    return () => cancelAnimationFrame(frame);
  }, [mesh]);
  return mesh ? <canvas ref={ref} data-slot="world-model" width={width} height={height} aria-hidden className="pointer-events-none absolute inset-0 size-full" /> : null;
}

export function WorldView({ label = "", scene = "", picture = "", entities = [], follow = "", score = 0, status = "running", width = 360, height = 240, channel, demo, onValueChange, onEvent, className, style }: WorldState & { picture?: string; width?: number; height?: number; channel?: InputChannel } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent });
  const handed = useContext(PartHostContext).world;
  const heard = channel ?? handed;
  const mock = useMockWorld();
  const script = mock?.script;
  const scriptNow = mock?.now;
  const [log, setLog] = useState<string[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  /* what the world being played shows (the example engine's, or the mock world's with its words and picture) */
  const [played, setPlayed] = useState<{ view: WorldState; scene?: string; picture?: string; time?: number } | null>(null);
  const emit = useRef(host.emit);
  emit.current = host.emit;

  useEffect(() => (heard ? heard.listen((action, value) => setLog((l) => inputLog(l, action, value))) : undefined), [heard]);

  /* the world starts over from what the design says whenever that changes */
  const start = useMemo(() => JSON.stringify({ entities, score, status, follow }), [entities, score, status, follow]);
  const playing = host.demo;
  useEffect(() => {
    if (!script && !playing) {
      setPlayed(null);
      return;
    }
    /* only through the World interface (docs/世界宿主契约.md): its time runs off the app's clock (the mocks' in the
       preview, which may stand still or run faster), it has no picture of its own, so the stand-in draws its view */
    if (script) {
      const w = createScriptedWorld(script, { now: scriptNow ?? domainNow, base: JSON.parse(start) as WorldState });
      const show = () => setPlayed({ view: w.view(), ...w.scene(), time: Math.round(w.clock().now) });
      show();
      setEvents([]);
      const unsub = w.subscribe(show);
      /* every event of the script goes to the design (its actions run on those the world view declares) */
      const offAny = w.onAny((name, payload) => {
        setEvents((l) => [...l, eventWords(name, payload)].slice(-EVENT_LOG_SIZE));
        emit.current(name, payload as Record<string, unknown>);
      });
      const off = heard ? connectWorld(w, heard) : () => {};
      w.mount(null, { w: width, h: height });
      return () => {
        w.unmount();
        off();
        offAny();
        unsub();
      };
    }
    const w = createExampleWorld(JSON.parse(start) as WorldState, { now: domainNow });
    setPlayed({ view: w.view() });
    const unsub = w.subscribe(() => setPlayed({ view: w.view() }));
    const off = heard ? connectWorld(w, heard, (name, payload) => emit.current(name, payload as Record<string, unknown>)) : () => {};
    w.mount(null, { w: width, h: height });
    return () => {
      w.unmount();
      off();
      unsub();
    };
  }, [script, scriptNow, playing, start, heard, width, height]);

  const view = played?.view;
  const shown = (view?.entities ?? entities) as Shown[];
  const scoreNow = view?.score ?? score;
  const statusNow = view?.status ?? status;
  const followNow = view?.follow ?? follow;
  const sceneNow = script && played ? (played.scene ?? scene) : scene;
  const pictureNow = script && played ? (played.picture ?? picture) : picture;
  const model = pictureNow && meshExt(pictureNow) ? pictureNow : "";
  return (
    <div
      data-slot="world-view"
      data-status={statusNow}
      data-score={scoreNow}
      {...(script ? { "data-world-script": script.id, "data-world-time": played?.time ?? 0 } : {})}
      role="group"
      aria-label={label || "World"}
      className={cn("bg-surface-container-high text-on-surface relative overflow-hidden rounded-xl", className)}
      style={{ width, height, ...style }}
    >
      {pictureNow && !model && <img data-slot="world-picture" src={pictureNow} alt="" aria-hidden className="pointer-events-none absolute inset-0 size-full object-cover opacity-70" />}
      {model && <WorldModel url={model} width={width} height={height} />}
      {sceneNow && <span data-slot="world-scene" className="text-body-small text-on-surface-variant absolute inset-x-3 top-1/2 -translate-y-1/2 text-center opacity-60">{sceneNow}</span>}
      <div className="absolute inset-x-2 top-2 flex items-center gap-2">
        {label && <span className="text-label-medium bg-surface/80 rounded-md px-2 py-0.5">{label}</span>}
        <span className="flex-1" />
        {statusNow !== "running" && <span data-slot="world-status" className="text-label-small bg-surface/80 rounded-md px-2 py-0.5">{statusNow}</span>}
        <span data-slot="world-score" className="text-label-medium bg-surface/80 rounded-md px-2 py-0.5 tabular-nums">★ {scoreNow}</span>
      </div>
      {shown.map((e) => {
        const hp = typeof e.hp === "number" && typeof e.maxHp === "number" && e.maxHp > 0 ? Math.min(1, Math.max(0, e.hp / e.maxHp)) : undefined;
        return (
          <span
            key={e.id}
            data-entity={e.id}
            data-kind={e.kind}
            data-x={e.x}
            data-y={e.y}
            {...(hp !== undefined ? { "data-hp": e.hp as number } : {})}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${e.x}%`, top: `${e.y}%` }}
          >
            {hp !== undefined && (
              <span data-slot="world-hp" className="bg-surface/80 mb-0.5 block h-1 w-5 overflow-hidden rounded-full">
                <span className={cn("block h-full", hp > 0.3 ? "bg-primary" : "bg-error")} style={{ width: `${Math.round(hp * 100)}%` }} />
              </span>
            )}
            <span className={cn("block size-4 rounded-full shadow-elevation-1", TONE[e.kind] ?? "bg-outline", followNow === e.id && "ring-primary ring-2 ring-offset-2")} />
            {e.label && <span className="text-label-small bg-surface/80 mt-0.5 rounded px-1">{e.label}</span>}
          </span>
        );
      })}
      {events.length > 0 && (
        <div data-slot="world-events" className="absolute right-2 bottom-2 flex flex-col items-end gap-0.5">
          {events.map((line, i) => (
            <span key={`${i}:${line}`} data-world-event="" className="text-label-small bg-tertiary-container text-on-tertiary-container rounded px-1.5 font-mono">
              {line}
            </span>
          ))}
        </div>
      )}
      {log.length > 0 && (
        <div data-slot="world-inputs" className="absolute bottom-2 left-2 flex flex-col items-start gap-0.5">
          {log.map((line, i) => (
            <span key={`${i}:${line}`} data-world-input="" className="text-label-small bg-surface/80 rounded px-1.5 font-mono">
              {line}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
