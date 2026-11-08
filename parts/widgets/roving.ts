import type { KeyboardEvent } from "react";

/* The keyboard a role asks for (docs/组件规范.md "无障碍"): a radio group, a tab list or a list box is one stop in the
 * Tab order, its chosen item (else its first), and the arrows move through its items, Home and End to the ends. Where
 * the role chooses as it moves (a radio group, tabs that follow focus), `onMove` chooses the item moved to. */

export type RoveOptions = {
  /** the arrows that move: left and right, up and down, or both (a grid of items read in rows) */
  orientation?: "horizontal" | "vertical" | "both";
  /** the item moved to, by its place */
  onMove?: (index: number) => void;
};

/** the place a key moves to from `at` among `count` items, or null for a key that does not move */
export function moveTo(key: string, at: number, count: number, orientation: RoveOptions["orientation"] = "both"): number | null {
  if (count <= 0) return null;
  const across = orientation !== "vertical";
  const down = orientation !== "horizontal";
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if ((across && key === "ArrowRight") || (down && key === "ArrowDown")) return (at + 1) % count;
  if ((across && key === "ArrowLeft") || (down && key === "ArrowUp")) return (at - 1 + count) % count;
  return null;
}

/** The props of the item at `index` of a group of `count` with `active` chosen: in the Tab order or not, and the keys
 *  that move. The items are the group's own children marked `data-rove`. */
export function rove(count: number, active: number, o: RoveOptions = {}) {
  const stop = active >= 0 && active < count ? active : 0;
  return (index: number) => ({
    "data-rove": "",
    tabIndex: index === stop ? 0 : -1,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const next = moveTo(e.key, index, count, o.orientation);
      if (next === null) return;
      e.preventDefault();
      const items = e.currentTarget.parentElement?.querySelectorAll<HTMLElement>(":scope > [data-rove]");
      items?.[next]?.focus();
      o.onMove?.(next);
    },
  });
}
