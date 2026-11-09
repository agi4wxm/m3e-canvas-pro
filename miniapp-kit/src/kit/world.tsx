import { View } from "@tarojs/components";
import { createWorlds, hostLog, inputLog, type WorldChannel, type WorldEntity } from "@m3e/app-runtime";
import { useEffect, useState } from "react";

import type { PartBase } from "./atoms/basics";
import { Words } from "./atoms/words";
import { c, ca } from "./color";
import { useFill } from "./layout";
import { withDefaults } from "./parts";
import { tagOf } from "./Surface";
import { ROW, sx } from "./styles";
import { corner, typeStyle, useKit } from "./theme";

/* The world view (docs/组件规范.md “世界视口”, docs/小程序.md): a viewport whose picture is an engine's (a Cocos or
 * canvas mini-game's). What the kit has of it is the contract and a stand-in. The design's input actions (`move`,
 * `press`, `release`, run by the interpreter) reach each world view on a channel of its own (lib/world's channels, from
 * the app's runtime): straight through, through no page state. The stand-in draws the world's state as the design (or
 * its data) gives it and lists the inputs it hears as they come ("move 0.5,-1", "attack ↓"), the words every host of
 * the design writes. An exported mini-program hands the same props, the channel and `onEvent` to the view's slot, where
 * its engine goes. */

/** the world views' channels, by the printed name of each: one for the mini-program, whichever page a view is on */
export const WORLDS = createWorlds();

/** the entities of the design's table (Id, Kind, X, Y, Label), or of the list an engine hands */
export function entitiesOf(given: { columns?: string[]; rows?: string[][] } | WorldEntity[] | undefined): WorldEntity[] {
  const list: WorldEntity[] = Array.isArray(given) ? given : (given?.rows ?? []).map((r) => ({ id: r[0] ?? "", kind: r[1] ?? "", x: Number(r[2]), y: Number(r[3]), ...(r[4] ? { label: r[4] } : {}) }));
  return list.filter((e) => e && e.id && Number.isFinite(e.x) && Number.isFinite(e.y)).map((e) => ({ ...e, x: Math.min(100, Math.max(0, e.x)), y: Math.min(100, Math.max(0, e.y)) }));
}

/** what each kind of entity is drawn in */
const TONE: Record<string, string> = { player: "primary", enemy: "error", coin: "tertiary", item: "tertiary" };

export type WorldStandInProps = PartBase & {
  label?: string;
  scene?: string;
  /** a table: Id, Kind, X, Y, Label; or the entities an engine hands */
  entities?: { columns?: string[]; rows?: string[][] } | WorldEntity[];
  /** the entity the camera follows, by its id */
  follow?: string;
  score?: number;
  status?: string;
  /** the input actions the world takes */
  inputs?: string;
  width?: number;
  height?: number;
  /** the channel its inputs come in on (the screen's runtime hands it: `s.world(name)`) */
  channel?: WorldChannel;
};

/** The world view's stand-in: the world's state as the props say, and the inputs it hears listed as they come. */
export function WorldStandIn(props: WorldStandInProps) {
  const p = withDefaults<WorldStandInProps>("world-view", props);
  const kit = useKit();
  const fill = useFill();
  const w = Math.round(p.width ?? 360);
  const h = Math.round(p.height ?? 240);
  const [log, setLog] = useState<string[]>([]);
  const channel = p.channel;
  useEffect(() => (channel ? channel.listen((action, value) => setLog((l) => inputLog(l, action, value))) : undefined), [channel]);
  /* and what the app tells the world: to pause, to go on */
  useEffect(() => channel?.watch?.((signal) => setLog((l) => hostLog(l, signal))), [channel]);
  const chip = { ...typeStyle(kit, "label-medium"), color: c("on-surface"), backgroundColor: ca("surface", 0.8), borderRadius: corner(kit, "md"), padding: "0 8px" };
  return (
    <View {...tagOf(p.testID)} ariaRole="img" ariaLabel={p.label || "World"} style={sx({ position: "relative", width: w, height: h, borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container-high"), overflow: "hidden", flexShrink: 0 }, fill)}>
      {p.scene ? (
        <View style={sx(ROW, { position: "absolute", left: 12, right: 12, top: 0, bottom: 0, justifyContent: "center" })}>
          <Words text={p.scene} style={{ ...typeStyle(kit, "body-small"), color: c("on-surface-variant"), opacity: 0.6, textAlign: "center" }} />
        </View>
      ) : null}
      <View style={sx(ROW, { position: "absolute", left: 8, right: 8, top: 8, gap: 8 })}>
        {p.label ? <Words text={p.label} lines={1} style={chip} /> : null}
        <View style={{ flex: 1 }} />
        {p.status && p.status !== "running" ? <Words text={p.status} lines={1} style={chip} /> : null}
        <Words text={`★ ${Math.round(Number(p.score) || 0)}`} lines={1} style={{ ...chip, fontVariantNumeric: "tabular-nums" }} />
      </View>
      {entitiesOf(p.entities).map((e) => (
        <View key={e.id} style={sx({ position: "absolute", left: (e.x / 100) * w - 40, top: (e.y / 100) * h - 8, width: 80, display: "flex", flexDirection: "column", alignItems: "center" })}>
          <View style={sx({ width: 16, height: 16, borderRadius: 8, backgroundColor: c(TONE[e.kind] ?? "outline"), boxSizing: "border-box", border: p.follow === e.id ? `2px solid ${c("primary")}` : "none" })} />
          {e.label ? <Words text={e.label} lines={1} style={{ ...typeStyle(kit, "label-small"), color: c("on-surface") }} /> : null}
        </View>
      ))}
      {log.length ? (
        <View style={sx({ position: "absolute", left: 8, bottom: 8, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 })}>
          {log.map((line, i) => (
            <Words key={`${i}:${line}`} text={line} lines={1} style={{ ...typeStyle(kit, "label-small"), color: c("on-surface"), backgroundColor: ca("surface", 0.8), padding: "0 6px", borderRadius: 4 }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
