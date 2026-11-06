/* Where the exported apps differ from the design (lib/export/types.ts `DesignDifference`), summed up for a report: the
 * editor's export report, the command line and MCP's `export_product`. Each app also writes its own list beside its
 * screens. Light: no export code comes with it. */

import type { DesignDifference } from "./types";

/** the file each app lists its differences in, from the product's root */
export const DIFFERENCE_FILES: Record<DesignDifference["app"], string> = {
  mobile: "apps/mobile/src/generated/warnings.json",
  miniapp: "apps/miniapp/src/generated/warnings.json",
};

export type DifferenceCount = { app: DesignDifference["app"]; total: number; file: string; kinds: [kind: string, n: number][] };

/** for each app that differs, how many differences of each kind, the commonest first (ties in the order they came) */
export function differenceCounts(diffs: readonly DesignDifference[]): DifferenceCount[] {
  const out: DifferenceCount[] = [];
  for (const app of Object.keys(DIFFERENCE_FILES) as DesignDifference["app"][]) {
    const mine = diffs.filter((d) => d.app === app);
    if (!mine.length) continue;
    const kinds = new Map<string, number>();
    for (const d of mine) kinds.set(d.kind, (kinds.get(d.kind) ?? 0) + 1);
    out.push({ app, total: mine.length, file: DIFFERENCE_FILES[app], kinds: [...kinds].sort((a, b) => b[1] - a[1]) });
  }
  return out;
}

/** one line for each app, for a terminal: `mobile: 12 differ from the design (5 atoms, 3 placeholder): apps/mobile/…` */
export const differenceLines = (diffs: readonly DesignDifference[]): string[] =>
  differenceCounts(diffs).map((c) => `${c.app}: ${c.total} drawn differently from the design (${c.kinds.map(([k, n]) => `${n} ${k}`).join(", ")}): ${c.file}`);
