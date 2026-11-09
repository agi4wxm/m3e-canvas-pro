import { useEffect, useState } from "react";
import { Image, Text as RNText, View } from "react-native";

import type { PartBase } from "./atoms/basics";
import { useFill } from "./layout";
import { withAlpha } from "./look";
import { withDefaults } from "./parts";
import { Surface } from "./Surface";
import { corner, typeStyle, useKit, type Kit } from "./theme/ThemeProvider";

/* The world view (docs/组件规范.md “世界视口”, docs/手机端.md): a viewport whose picture is an engine's. What the kit has
 * of it is the contract and a stand-in. The design's input actions (`move`, `press`, `release`, run by the interpreter)
 * reach each world view on a channel of its own (`WorldChannels`, kept by the app's memory, src/kit/app.tsx): straight
 * through, through no state of the app's, which a world taking a joystick at sixty moves a second needs. The stand-in
 * draws the world's state as the design (or its data) gives it, the scene in words and the entities where they stand,
 * and lists the inputs it hears as they come ("move 0.5,-1", "attack ↓"), the words every host of the design writes.
 * An exported app hands the same props, the channel and `onEvent` to the view's slot, where its engine goes. The same
 * rules as lib/world/channel.ts, written out here: the kit never imports the editor. */

/** a direction (x and y from -1 to 1), or whether a button of the world is held down */
export type WorldInput = { x: number; y: number } | boolean;

/** the local channel a world view's inputs come in on */
export type WorldChannel = {
  /** hears every input from now on; gives back how to stop */
  listen(fn: (action: string, value: WorldInput, at: number) => void): () => void;
  /** what each input holds now */
  held(): Record<string, WorldInput>;
};

/** a channel for each world view, by its item id */
export type WorldChannels = { send(part: string, action: string, value: WorldInput): void; channel(part: string): WorldChannel; clear(): void };

export function createWorldChannels(now: () => number = () => Date.now()): WorldChannels {
  const listeners = new Map<string, Set<(action: string, value: WorldInput, at: number) => void>>();
  const holding = new Map<string, Record<string, WorldInput>>();
  const channels = new Map<string, WorldChannel>();
  return {
    send(part, action, value) {
      holding.set(part, { ...holding.get(part), [action]: value });
      const at = now();
      for (const fn of Array.from(listeners.get(part) ?? [])) fn(action, value, at);
    },
    channel(part) {
      const known = channels.get(part);
      if (known) return known;
      const made: WorldChannel = {
        listen(fn) {
          const set = listeners.get(part) ?? new Set();
          listeners.set(part, set);
          set.add(fn);
          return () => void set.delete(fn);
        },
        held: () => ({ ...holding.get(part) }),
      };
      channels.set(part, made);
      return made;
    },
    clear: () => holding.clear(),
  };
}

const two = (n: number) => String(Math.round(n * 100) / 100 || 0);

/** an input as a stand-in says it: `move 0.5,-1`, `attack ↓` pressed, `attack ↑` let go */
export const inputWords = (action: string, value: WorldInput) => (typeof value === "boolean" ? `${action} ${value ? "↓" : "↑"}` : `${action} ${two(value.x)},${two(value.y)}`);

/** the inputs a stand-in lists, the newest last: a direction takes the place of the one before it of the same input */
export function inputLog(log: readonly string[], action: string, value: WorldInput): string[] {
  const line = inputWords(action, value);
  const last = log[log.length - 1];
  const same = typeof value !== "boolean" && last !== undefined && last.startsWith(`${action} `) && !/[↓↑]$/.test(last);
  return [...(same ? log.slice(0, -1) : log), line].slice(-4);
}

/** A direction an expression came to (`{x, y}` or words "x,y"), each kept to -1…1 and two places, a longer one cut back
 *  to length 1; null for no direction. The interpreter's own rule (lib/actions `vectorOf`), for the kit's own runner. */
export function vectorOf(raw: unknown): { x: number; y: number } | null {
  let x: unknown;
  let y: unknown;
  if (typeof raw === "string") {
    const parts = raw.split(",");
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return null;
    [x, y] = parts.map(Number);
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) ({ x, y } = raw as { x?: unknown; y?: unknown });
  else return null;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const far = Math.hypot(x, y);
  const k = far > 1 ? 1 / far : 1;
  const round = (n: number) => Math.round(Math.min(1, Math.max(-1, n * k)) * 100) / 100 || 0;
  return { x: round(x), y: round(y) };
}

/** something in the world: its id, its kind, where it stands (0 to 100 across and down the view), its words, its hit
 *  points when it has some */
export type WorldEntity = { id: string; kind: string; x: number; y: number; label?: string; hp?: number; maxHp?: number };

/** hit points from the table's HP and Max HP columns, when both are numbers */
const hitPoints = (hp: string | undefined, max: string | undefined) => {
  const a = hp ? Number(hp) : NaN;
  const b = max ? Number(max) : NaN;
  return Number.isFinite(a) && Number.isFinite(b) && b > 0 ? { hp: Math.max(0, a), maxHp: b } : {};
};

/** the entities of the design's table (Id, Kind, X, Y, Label, and HP, Max HP), or of the list an engine hands */
export function entitiesOf(given: { columns?: string[]; rows?: string[][] } | WorldEntity[] | undefined): WorldEntity[] {
  const list: WorldEntity[] = Array.isArray(given) ? given : (given?.rows ?? []).map((r) => ({ id: r[0] ?? "", kind: r[1] ?? "", x: Number(r[2]), y: Number(r[3]), ...(r[4] ? { label: r[4] } : {}), ...hitPoints(r[5], r[6]) }));
  return list.filter((e) => e && e.id && Number.isFinite(e.x) && Number.isFinite(e.y)).map((e) => ({ ...e, x: Math.min(100, Math.max(0, e.x)), y: Math.min(100, Math.max(0, e.y)) }));
}

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";

/** what each kind of entity is drawn in */
const TONE: Record<string, string> = { player: "primary", enemy: "error", coin: "tertiary", item: "tertiary" };

/** What a stand-in plays while no engine is plugged into the view's slot: a development build's mock world (the mock
 *  library's world script, played by the app runtime's createScriptedWorld), spoken to through the World interface:
 *  mounted, handed the inputs, read, unmounted. Its scene's words and picture come with it. */
export type StandInWorld = {
  mount(host: unknown, size: { w: number; h: number }): void;
  unmount(): void;
  input(action: string, value: WorldInput, at: number): void;
  view(): { entities?: WorldEntity[]; score?: number; status?: string; follow?: string };
  subscribe(changed: () => void): () => void;
  scene?(): { scene?: string; picture?: string };
};

type StandInStart = { entities: WorldEntity[]; score?: number; status?: string; follow?: string };
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

/** whether a picture is a 3D model (a stand-in on a phone shows its words, not the model) */
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
  /** the channel its inputs come in on (the app's memory hands it: `app.world(id)`) */
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
  const chip = { ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface"), backgroundColor: withAlpha(c(kit, "surface"), 0.8), borderRadius: corner(kit, "md"), paddingHorizontal: 8, overflow: "hidden" as const };
  return (
    <Surface base={{ width: w, height: h, borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container-high"), overflow: "hidden", ...fill }} appearance={p} testID={p.testID}>
      <View accessible accessibilityRole="image" accessibilityLabel={p.label || "World"} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
        {picture && !isModel(picture) ? <Image source={{ uri: picture }} resizeMode="cover" style={{ position: "absolute", left: 0, top: 0, width: w, height: h, opacity: 0.7 }} /> : null}
        {scene ? (
          <View pointerEvents="none" style={{ position: "absolute", left: 12, right: 12, top: 0, bottom: 0, justifyContent: "center" }}>
            <RNText style={{ ...typeStyle(kit, "body-small"), color: c(kit, "on-surface-variant"), opacity: 0.6, textAlign: "center" }}>{scene}</RNText>
          </View>
        ) : null}
        <View style={{ position: "absolute", left: 8, right: 8, top: 8, flexDirection: "row", alignItems: "center", columnGap: 8 }}>
          {p.label ? <RNText style={chip}>{p.label}</RNText> : null}
          <View style={{ flex: 1 }} />
          {status && status !== "running" ? <RNText style={chip}>{status}</RNText> : null}
          <RNText style={{ ...chip, fontVariant: ["tabular-nums"] }}>{`★ ${Math.round(Number(score) || 0)}`}</RNText>
        </View>
        {shown.map((e) => (
          <View key={e.id} testID={p.testID ? `${p.testID}-${e.id}` : undefined} style={{ position: "absolute", left: (e.x / 100) * w - 40, top: (e.y / 100) * h - 8, width: 80, alignItems: "center" }}>
            {e.hp !== undefined && e.maxHp ? (
              <View style={{ width: 20, height: 4, borderRadius: 2, marginBottom: 2, backgroundColor: withAlpha(c(kit, "surface"), 0.8), overflow: "hidden" }}>
                <View style={{ width: `${Math.round(Math.min(1, e.hp / e.maxHp) * 100)}%`, height: 4, backgroundColor: c(kit, e.hp / e.maxHp > 0.3 ? "primary" : "error") }} />
              </View>
            ) : null}
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: c(kit, TONE[e.kind] ?? "outline"), borderWidth: follow === e.id ? 2 : 0, borderColor: c(kit, "primary") }} />
            {e.label ? <RNText style={{ ...typeStyle(kit, "label-small"), color: c(kit, "on-surface") }}>{e.label}</RNText> : null}
          </View>
        ))}
        {log.length ? (
          <View style={{ position: "absolute", left: 8, bottom: 8, rowGap: 2, alignItems: "flex-start" }}>
            {log.map((line, i) => (
              <RNText key={`${i}:${line}`} style={{ ...typeStyle(kit, "label-small"), color: c(kit, "on-surface"), backgroundColor: withAlpha(c(kit, "surface"), 0.8), paddingHorizontal: 6, borderRadius: 4, overflow: "hidden" }}>
                {line}
              </RNText>
            ))}
          </View>
        ) : null}
      </View>
    </Surface>
  );
}
