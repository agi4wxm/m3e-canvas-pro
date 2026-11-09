/* A screen's subscriptions to the contract's realtime channels (`Frame.subscriptions`, docs/数据绑定.md “订阅”), as every
 * printer of a front end prints them (the product's web app, the phone app, the mini-program): the definition the
 * shared runtime opens (lib/app/channels.ts `ChannelDef`, handed to `useSubscription`), and the actions on its
 * messages by key. Worked out here once, so the three print the same subscriptions and none decides for itself which
 * it keeps: one whose channel the contract lacks, or whose name a data source of the screen has, is left out. */

import type { Action, Doc, Frame } from "../../tokens";
import { channelDefOf } from "../../bindings/design";
import type { ChannelDef } from "../../app/channels";

export type SubscriptionPlan = {
  def: ChannelDef;
  /** what runs on its messages: `on:<message>` for one message, `on:message` for any, in the design's order */
  actions: [key: string, action: Action][];
};

/** the subscriptions of a screen a front end prints */
export function subscriptionPlans(doc: Pick<Doc, "api">, frame: Frame): SubscriptionPlan[] {
  const taken = new Set((frame.data ?? []).map((d) => d.name));
  const out: SubscriptionPlan[] = [];
  for (const sub of frame.subscriptions ?? []) {
    const def = channelDefOf(doc.api ?? {}, sub);
    if (!def || taken.has(sub.name)) continue;
    taken.add(sub.name);
    out.push({ def, actions: Object.entries(sub.actions ?? {}).filter(([k]) => k.startsWith("on:")) });
  }
  return out;
}

/** whether a document's screens subscribe to anything a front end prints */
export const subscribes = (doc: Pick<Doc, "api" | "frames">): boolean => doc.frames.some((f) => subscriptionPlans(doc, f).length > 0);
