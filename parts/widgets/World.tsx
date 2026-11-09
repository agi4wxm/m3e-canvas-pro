import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { inputLog } from "@/lib/world/channel";
import { connectWorld, createExampleWorld } from "@/lib/world/example";
import type { WorldEntity, WorldState } from "@/lib/world/types";
import { PartHostContext, useHost, type HostProps, type InputChannel } from "./host";

/* The world view's stand-in (docs/组件规范.md “世界视口”): the picture is an engine's, so here the scene is words, the
 * entities stand where the design (or its data) says, the camera's one ringed, and the inputs the design sends are
 * listed as they come, newest last ("move 0.5,-1", "attack ↓"): what the visitor's taps did to the world can be read off
 * it. In a prototype (`demo`) it plays M3E's example engine (lib/world/example.ts) on the same channel, so the player
 * moves with a joystick and the design's actions on `collected`, `hit` and `ended` run; in a product it only shows the
 * props. An exported app hands the same props, the channel and `onEvent` to the slot where its engine goes. */

/** what each kind of entity is drawn in */
const TONE: Record<string, string> = { player: "bg-primary text-on-primary", enemy: "bg-error text-on-error", coin: "bg-tertiary text-on-tertiary", item: "bg-tertiary text-on-tertiary" };

/** the time on the page, for a frame's step */
const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Calls `step` with the time since the last call, each frame (a timer where the page has no frames), until stopped. */
function everyFrame(step: (ms: number) => void): () => void {
  let last = nowMs();
  const tick = () => {
    const t = nowMs();
    step(t - last);
    last = t;
  };
  if (typeof requestAnimationFrame !== "function") {
    const id = setInterval(tick, 33);
    return () => clearInterval(id);
  }
  let id = requestAnimationFrame(function frame() {
    tick();
    id = requestAnimationFrame(frame);
  });
  return () => cancelAnimationFrame(id);
}

export function WorldView({ label = "", scene = "", entities = [], follow = "", score = 0, status = "running", width = 360, height = 240, channel, demo, onValueChange, onEvent, className, style }: WorldState & { width?: number; height?: number; channel?: InputChannel } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent });
  const handed = useContext(PartHostContext).world;
  const heard = channel ?? handed;
  const [log, setLog] = useState<string[]>([]);
  /* what the example engine shows, while a prototype plays it */
  const [played, setPlayed] = useState<WorldState | null>(null);
  const emit = useRef(host.emit);
  emit.current = host.emit;

  useEffect(() => (heard ? heard.listen((action, value) => setLog((l) => inputLog(l, action, value))) : undefined), [heard]);

  /* the engine starts over from what the design says whenever that changes */
  const start = useMemo(() => JSON.stringify({ entities, score, status, follow }), [entities, score, status, follow]);
  const playing = host.demo;
  useEffect(() => {
    if (!playing) {
      setPlayed(null);
      return;
    }
    const w = createExampleWorld(JSON.parse(start) as WorldState);
    setPlayed(w.view());
    const unsub = w.subscribe(() => setPlayed(w.view()));
    const off = heard ? connectWorld(w, heard, (name, payload) => emit.current(name, payload as Record<string, unknown>)) : () => {};
    const stop = everyFrame((ms) => w.step(ms));
    return () => {
      stop();
      off();
      unsub();
      w.unmount();
    };
  }, [playing, start, heard]);

  const shown: WorldEntity[] = played?.entities ?? entities;
  const scoreNow = played?.score ?? score;
  const statusNow = played?.status ?? status;
  return (
    <div
      data-slot="world-view"
      data-status={statusNow}
      data-score={scoreNow}
      role="group"
      aria-label={label || "World"}
      className={cn("bg-surface-container-high text-on-surface relative overflow-hidden rounded-xl", className)}
      style={{ width, height, ...style }}
    >
      {scene && <span data-slot="world-scene" className="text-body-small text-on-surface-variant absolute inset-x-3 top-1/2 -translate-y-1/2 text-center opacity-60">{scene}</span>}
      <div className="absolute inset-x-2 top-2 flex items-center gap-2">
        {label && <span className="text-label-medium bg-surface/80 rounded-md px-2 py-0.5">{label}</span>}
        <span className="flex-1" />
        {statusNow !== "running" && <span data-slot="world-status" className="text-label-small bg-surface/80 rounded-md px-2 py-0.5">{statusNow}</span>}
        <span data-slot="world-score" className="text-label-medium bg-surface/80 rounded-md px-2 py-0.5 tabular-nums">★ {scoreNow}</span>
      </div>
      {shown.map((e) => (
        <span
          key={e.id}
          data-entity={e.id}
          data-kind={e.kind}
          data-x={e.x}
          data-y={e.y}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          style={{ left: `${e.x}%`, top: `${e.y}%` }}
        >
          <span className={cn("block size-4 rounded-full shadow-elevation-1", TONE[e.kind] ?? "bg-outline", follow === e.id && "ring-primary ring-2 ring-offset-2")} />
          {e.label && <span className="text-label-small bg-surface/80 mt-0.5 rounded px-1">{e.label}</span>}
        </span>
      ))}
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
