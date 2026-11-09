import { useEffect, useState } from "react";
import { Text as RNText, View } from "react-native";

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

/** what the HUD reads a world through: its snapshot and its clock (an engine's `World` is one) */
export type WorldReadable = { view(): unknown; clock?(): { now: number; paused: boolean; rate: number } };

/** the local channel a world view's inputs come in on */
export type WorldChannel = {
  /** hears every input from now on; gives back how to stop */
  listen(fn: (action: string, value: WorldInput, at: number) => void): () => void;
  /** what each input holds now */
  held(): Record<string, WorldInput>;
  /** takes the world connected to the view (`connectWorld`), which the HUD's bindings per frame read; gives back how to
   *  let it go */
  attach?(world: WorldReadable): () => void;
};

/** a channel for each world view, by its item id; `attached` is the world the HUD reads: the first still connected */
export type WorldChannels = { send(part: string, action: string, value: WorldInput): void; channel(part: string): WorldChannel; clear(): void; attached(): WorldReadable | undefined };

export function createWorldChannels(now: () => number = () => Date.now()): WorldChannels {
  const listeners = new Map<string, Set<(action: string, value: WorldInput, at: number) => void>>();
  const holding = new Map<string, Record<string, WorldInput>>();
  const channels = new Map<string, WorldChannel>();
  const mounted: { world: WorldReadable }[] = [];
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
        attach(world) {
          const entry = { world };
          mounted.push(entry);
          return () => {
            const at = mounted.indexOf(entry);
            if (at >= 0) mounted.splice(at, 1);
          };
        },
      };
      channels.set(part, made);
      return made;
    },
    clear: () => holding.clear(),
    attached: () => mounted[0]?.world,
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

/** something in the world: its id, its kind, where it stands (0 to 100 across and down the view), its words */
export type WorldEntity = { id: string; kind: string; x: number; y: number; label?: string };

/** the entities of the design's table (Id, Kind, X, Y, Label), or of the list an engine hands */
export function entitiesOf(given: { columns?: string[]; rows?: string[][] } | WorldEntity[] | undefined): WorldEntity[] {
  const list: WorldEntity[] = Array.isArray(given) ? given : (given?.rows ?? []).map((r) => ({ id: r[0] ?? "", kind: r[1] ?? "", x: Number(r[2]), y: Number(r[3]), ...(r[4] ? { label: r[4] } : {}) }));
  return list.filter((e) => e && e.id && Number.isFinite(e.x) && Number.isFinite(e.y)).map((e) => ({ ...e, x: Math.min(100, Math.max(0, e.x)), y: Math.min(100, Math.max(0, e.y)) }));
}

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";

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
  const chip = { ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface"), backgroundColor: withAlpha(c(kit, "surface"), 0.8), borderRadius: corner(kit, "md"), paddingHorizontal: 8, overflow: "hidden" as const };
  return (
    <Surface base={{ width: w, height: h, borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container-high"), overflow: "hidden", ...fill }} appearance={p} testID={p.testID}>
      <View accessible accessibilityRole="image" accessibilityLabel={p.label || "World"} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
        {p.scene ? (
          <View pointerEvents="none" style={{ position: "absolute", left: 12, right: 12, top: 0, bottom: 0, justifyContent: "center" }}>
            <RNText style={{ ...typeStyle(kit, "body-small"), color: c(kit, "on-surface-variant"), opacity: 0.6, textAlign: "center" }}>{p.scene}</RNText>
          </View>
        ) : null}
        <View style={{ position: "absolute", left: 8, right: 8, top: 8, flexDirection: "row", alignItems: "center", columnGap: 8 }}>
          {p.label ? <RNText style={chip}>{p.label}</RNText> : null}
          <View style={{ flex: 1 }} />
          {p.status && p.status !== "running" ? <RNText style={chip}>{p.status}</RNText> : null}
          <RNText style={{ ...chip, fontVariant: ["tabular-nums"] }}>{`★ ${Math.round(Number(p.score) || 0)}`}</RNText>
        </View>
        {entitiesOf(p.entities).map((e) => (
          <View key={e.id} testID={p.testID ? `${p.testID}-${e.id}` : undefined} style={{ position: "absolute", left: (e.x / 100) * w - 40, top: (e.y / 100) * h - 8, width: 80, alignItems: "center" }}>
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: c(kit, TONE[e.kind] ?? "outline"), borderWidth: p.follow === e.id ? 2 : 0, borderColor: c(kit, "primary") }} />
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
