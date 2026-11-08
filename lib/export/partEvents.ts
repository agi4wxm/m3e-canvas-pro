/* How the phone kit (rn/src/kit) and the mini-program kit (miniapp-kit/src/kit) hand out a part's events (`PartDef.events`,
 * docs/组件规范.md), for their printers to wire the design's actions on them (`Item.actions["on:<name>"]`). Both kits
 * name the callback after the event (`on` and its name: `onSettled`, `onMarkerTap`, `onReorder`) and hand its payload
 * as one object, but where they hand a single value (the number pad's words, a tag). The printed handler makes the
 * payload of what the callback gets; the kit's `eventOf` cuts it down to what the part declares (lib/partContract.ts
 * `payloadOf`), as the preview does. lib/export/partEvents.test.ts holds every entry to a prop the kits' components
 * declare. */

import { partBySlug } from "../../parts/registry";
import type { PartEvent } from "../../parts/types";

/** a part's event as a kit component hands it out: the callback prop, its parameters as printed, and the payload made
 *  of them */
export type EventProp = { prop: string; params: string; payload: string };

/** the callbacks that hand a single value, or nothing: the payload the event declares is made of it */
const SINGLE: Record<string, Record<string, { params: string; payload: string }>> = {
  "number-pad": { submit: { params: "value: string", payload: "{ value }" } },
  "tag-input": { add: { params: "value: string", payload: "{ value }" }, remove: { params: "value: string", payload: "{ value }" } },
  onboarding: { page: { params: "page: number", payload: "{ page }" } },
  timer: { ended: { params: "", payload: "{}" } },
  "video-call": { ended: { params: "", payload: "{}" } },
};

/** The events a kit component does not hand out: a split view hands out its share as its value only, the camera and
 *  the map stand-ins take no picture and never move (their slot sends those: `onEvent`), the audio player plays
 *  nothing to an end, and the dialogue box is drawn as its atoms. */
const NOT_SENT: Record<string, string[]> = {
  "split-view": ["resize"],
  camera: ["captured", "scanned"],
  map: ["regionChange"],
  "audio-player": ["ended"],
  "dialogue-box": ["settled"],
};

/** how a kit component hands out an event of its part; null when it does not */
export function eventProp(slug: string, name: string): EventProp | null {
  if (NOT_SENT[slug]?.includes(name)) return null;
  const event = partBySlug(slug)?.events?.find((e) => e.name === name);
  if (!event) return null;
  const single = SINGLE[slug]?.[name];
  return { prop: `on${name.charAt(0).toUpperCase()}${name.slice(1)}`, params: single ? single.params : "e: unknown", payload: single ? single.payload : "e" };
}

/** what an event declares it carries, by field, as the kits' `eventOf` reads it */
export const eventFields = (e: PartEvent): Record<string, string> => ({ ...(e.payload ?? {}) });
