import { createContext, useContext } from "react";
import type { WorldScript } from "@/lib/world/script";

/* Which mock world a world view's stand-in plays (docs/模拟库.md “世界脚本”): a script of the mock library, its pictures
 * already made data URLs or addresses, and the clock its world time runs off (the mocks' clock, which the preview's bar
 * can stop and speed up; the app's domain clock when none is said). The editor's preview hands the one its bar has
 * chosen to each world view it plays on (the context); a prototype, and a development build of an exported app, hand
 * theirs in once for every world view (`setMockWorld`; a production build never does: the real engine is plugged into
 * the view's slot). None handed, a world view plays M3E's example engine in a prototype and shows the design's state
 * otherwise. */

export type MockWorld = { script: WorldScript; now?: () => number };

/** the mock world the world views below play: `null` for none, left out (undefined) for the one `setMockWorld` handed in */
export const MockWorldContext = createContext<MockWorld | null | undefined>(undefined);

let handed: MockWorld | null = null;

/** Hands in the mock world every world view plays (a prototype's, a development build's); what it gives back takes it
 *  out again. */
export function setMockWorld(world: MockWorld | null): () => void {
  const was = handed;
  handed = world;
  return () => {
    if (handed === world) handed = was;
  };
}

/** the mock world a world view plays, if any */
export function useMockWorld(): MockWorld | null {
  const given = useContext(MockWorldContext);
  return given === undefined ? handed : given;
}
