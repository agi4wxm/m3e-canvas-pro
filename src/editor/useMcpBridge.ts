/* The editor's MCP connection (lib/mcp/editorBridge.ts) in the editor: on while the author has "Connect to MCP" on
 * (remembered between visits) and this tab is the one that edits, screenshots drawn from the canvas's own export
 * layer, and a call's result held back until the canvas has measured and laid out what it changed. The bridge and the
 * tools it runs are fetched the first time it is turned on, so an editor that never connects does not load them. */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DocStore } from "@/lib/core";
import type { BridgeView, EditorBridge } from "@/lib/mcp/editorBridge";
import { ToolFailure, type Renderer } from "@/lib/tools/types";
import type { Doc, Frame } from "@/lib/tokens";
import { nextFrame, shotTarget, type Crop } from "./screenShot";

const KEY = "m3e:mcp";

/** a screenshot waiting for the export layer */
export type ShotJob = { frame: Frame; crop?: Crop; scale: number; resolve: (png: string) => void; reject: (e: unknown) => void };

const OFF: BridgeView = { on: false, conns: [], log: [], asks: [] };
const nothing = () => () => {};

const readOn = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null")?.on === true;
  } catch {
    return false;
  }
};

/** sessionStorage where the browser allows it: a reloaded tab comes back to its server without asking */
const tabStorage = (): Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined => {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
};

/** Resolves once the canvas has stopped measuring and laying out (no change of its own for a moment), at most 1.5 s. */
function settled(store: DocStore): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    let last = start;
    const off = store.subscribe((e) => {
      if (e.origin === "system" || e.kind === "session") last = Date.now();
    });
    const tick = () => {
      const now = Date.now();
      if (now - last > 160 || now - start > 1500) {
        off();
        resolve();
      } else setTimeout(tick, 50);
    };
    void nextFrame()
      .then(nextFrame)
      .then(() => setTimeout(tick, 50));
  });
}

export function useMcpBridge({ store, enabled }: { store: DocStore; enabled: boolean }) {
  const [on, setOnState] = useState(readOn);
  const queue = useRef<ShotJob[]>([]);
  const [shot, setShot] = useState<ShotJob | null>(null);
  const [bridge, setBridge] = useState<EditorBridge | null>(null);
  const made = useRef<EditorBridge | null>(null);

  useEffect(() => {
    if (!on || !enabled) {
      made.current?.stop();
      return;
    }
    let gone = false;
    void import("@/lib/mcp/editorBridge").then(({ EditorBridge }) => {
      if (gone) return;
      if (!made.current) {
        const renderer: Renderer = {
          screenshot: (id, o) =>
            new Promise<string>((resolve, reject) => {
              const s = store.get();
              const target = shotTarget(s.doc as Doc, s.session.widths, id);
              if (!target) return reject(new ToolFailure("not_found", `There is no screen or part ${JSON.stringify(id)}.`, "list_screens gives the screens' ids."));
              queue.current.push({ ...target, scale: o?.scale ?? 1, resolve, reject });
              setShot((cur) => cur ?? queue.current.shift() ?? null);
            }),
        };
        made.current = new EditorBridge({ store, WebSocket: window.WebSocket, storage: tabStorage(), renderer, settle: () => settled(store) });
        setBridge(made.current);
      }
      made.current.start();
    });
    return () => {
      gone = true;
    };
  }, [store, on, enabled]);
  useEffect(() => () => made.current?.stop(), []);

  const view = useSyncExternalStore(bridge?.subscribe ?? nothing, bridge?.view ?? (() => OFF));

  const setOn = (next: boolean) => {
    setOnState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify({ on: next }));
    } catch {}
  };

  /** the screenshot drawn (or failed): the next one comes */
  const shotDone = () => setShot(queue.current.shift() ?? null);

  return { bridge, view: on ? view : OFF, on, setOn, shot, shotDone };
}
