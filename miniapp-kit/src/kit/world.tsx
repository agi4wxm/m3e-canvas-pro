import { Image, View } from "@tarojs/components";
import { createWorlds, inputLog, type WorldChannel, type WorldEntity, type WorldInput } from "@m3e/app-runtime";
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

/** an entity as the stand-in draws it: with its hit points when it has some */
export type ShownEntity = WorldEntity & { hp?: number; maxHp?: number };

/** hit points from the table's HP and Max HP columns, when both are numbers */
const hitPoints = (hp: string | undefined, max: string | undefined) => {
  const a = hp ? Number(hp) : NaN;
  const b = max ? Number(max) : NaN;
  return Number.isFinite(a) && Number.isFinite(b) && b > 0 ? { hp: Math.max(0, a), maxHp: b } : {};
};

/** the entities of the design's table (Id, Kind, X, Y, Label, and HP, Max HP), or of the list an engine hands */
export function entitiesOf(given: { columns?: string[]; rows?: string[][] } | ShownEntity[] | undefined): ShownEntity[] {
  const list: ShownEntity[] = Array.isArray(given) ? given : (given?.rows ?? []).map((r) => ({ id: r[0] ?? "", kind: r[1] ?? "", x: Number(r[2]), y: Number(r[3]), ...(r[4] ? { label: r[4] } : {}), ...hitPoints(r[5], r[6]) }));
  return list.filter((e) => e && e.id && Number.isFinite(e.x) && Number.isFinite(e.y)).map((e) => ({ ...e, x: Math.min(100, Math.max(0, e.x)), y: Math.min(100, Math.max(0, e.y)) }));
}

/** what each kind of entity is drawn in */
const TONE: Record<string, string> = { player: "primary", enemy: "error", coin: "tertiary", item: "tertiary" };

/** What a stand-in plays while no engine is plugged into the view's slot: a development build's mock world (the mock
 *  library's world script, played by the app runtime's createScriptedWorld), spoken to through the World interface:
 *  mounted, handed the inputs, read, unmounted. Its scene's words and picture come with it. */
export type StandInWorld = {
  mount(host: unknown, size: { w: number; h: number }): void;
  unmount(): void;
  input(action: string, value: WorldInput, at: number): void;
  view(): { entities?: ShownEntity[]; score?: number; status?: string; follow?: string };
  subscribe(changed: () => void): () => void;
  scene?(): { scene?: string; picture?: string };
};

type StandInStart = { entities: ShownEntity[]; score?: number; status?: string; follow?: string };
let standInWorld: ((start: StandInStart) => StandInWorld) | null = null;

/** Hands in what every world view's stand-in plays (a development build's mock world, docs/模拟库.md); what it gives
 *  back takes it out again. A production build hands in none: the real engine is plugged into the slot. */
export function setStandInWorld(make: ((start: StandInStart) => StandInWorld) | null): () => void {
  const was = standInWorld;
  standInWorld = make;
  return () => {
    if (standInWorld === make) standInWorld = was;
  };
}

/** whether a picture is a 3D model (a mini-program's stand-in shows its words, not the model) */
const isModel = (url: string) => url.startsWith("data:model/") || /\.(glb|gltf|obj|stl|ply)(?:[?#]|$)/i.test(url);

export type WorldStandInProps = PartBase & {
  label?: string;
  scene?: string;
  /** a picture of the scene under the words: an image's address (a 3D model is left to its words here) */
  picture?: string;
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
  /* a mock world handed in plays from what the design says, and starts over when that changes */
  const make = standInWorld;
  const start = JSON.stringify({ entities: entitiesOf(p.entities), score: p.score, status: p.status, follow: p.follow });
  const [seen, setSeen] = useState<{ start: string; view: ReturnType<StandInWorld["view"]>; scene?: string; picture?: string } | null>(null);
  useEffect(() => {
    if (!make) return;
    const world = make(JSON.parse(start) as StandInStart);
    const show = () => setSeen({ start, view: world.view(), ...world.scene?.() });
    show();
    const unsub = world.subscribe(show);
    const off = channel ? channel.listen((action, value, at) => world.input(action, value, at)) : () => {};
    world.mount(null, { w, h });
    return () => {
      world.unmount();
      unsub();
      off();
    };
  }, [make, start, channel, w, h]);
  const live = make && seen && seen.start === start ? seen : null;
  const scene = live?.scene ?? p.scene;
  const picture = live?.picture ?? p.picture;
  const shown = live ? entitiesOf(live.view.entities) : entitiesOf(p.entities);
  const score = live?.view.score ?? p.score;
  const status = live?.view.status ?? p.status;
  const follow = live?.view.follow ?? p.follow;
  const chip = { ...typeStyle(kit, "label-medium"), color: c("on-surface"), backgroundColor: ca("surface", 0.8), borderRadius: corner(kit, "md"), padding: "0 8px" };
  return (
    <View {...tagOf(p.testID)} ariaRole="img" ariaLabel={p.label || "World"} style={sx({ position: "relative", width: w, height: h, borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container-high"), overflow: "hidden", flexShrink: 0 }, fill)}>
      {picture && !isModel(picture) ? <Image src={picture} mode="aspectFill" style={sx({ position: "absolute", left: 0, top: 0, width: w, height: h, opacity: 0.7 })} /> : null}
      {scene ? (
        <View style={sx(ROW, { position: "absolute", left: 12, right: 12, top: 0, bottom: 0, justifyContent: "center" })}>
          <Words text={scene} style={{ ...typeStyle(kit, "body-small"), color: c("on-surface-variant"), opacity: 0.6, textAlign: "center" }} />
        </View>
      ) : null}
      <View style={sx(ROW, { position: "absolute", left: 8, right: 8, top: 8, gap: 8 })}>
        {p.label ? <Words text={p.label} lines={1} style={chip} /> : null}
        <View style={{ flex: 1 }} />
        {status && status !== "running" ? <Words text={status} lines={1} style={chip} /> : null}
        <Words text={`★ ${Math.round(Number(score) || 0)}`} lines={1} style={{ ...chip, fontVariantNumeric: "tabular-nums" }} />
      </View>
      {shown.map((e) => (
        <View key={e.id} style={sx({ position: "absolute", left: (e.x / 100) * w - 40, top: (e.y / 100) * h - 8, width: 80, display: "flex", flexDirection: "column", alignItems: "center" })}>
          {e.hp !== undefined && e.maxHp ? (
            <View style={sx({ width: 20, height: 4, borderRadius: 2, marginBottom: 2, backgroundColor: ca("surface", 0.8), overflow: "hidden" })}>
              <View style={sx({ width: `${Math.round(Math.min(1, e.hp / e.maxHp) * 100)}%`, height: 4, backgroundColor: c(e.hp / e.maxHp > 0.3 ? "primary" : "error") })} />
            </View>
          ) : null}
          <View style={sx({ width: 16, height: 16, borderRadius: 8, backgroundColor: c(TONE[e.kind] ?? "outline"), boxSizing: "border-box", border: follow === e.id ? `2px solid ${c("primary")}` : "none" })} />
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
