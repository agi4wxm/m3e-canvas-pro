/* The operation on templates of instances spawned on events (lib/spawn.ts, docs/交互规则.md “按事件生成”): a group made
 * a template (how long an instance lives, how many live at once, where it goes, how it moves), and, in the same step,
 * the event of a part that spawns one each time it is sent. */

import { eventKey, STAY_TARGET, type Action } from "../../actions/model";
import { exprSyntaxError } from "../../bindings/check";
import { eventsOf } from "../../partContract";
import { SPAWN_LIMITS, SPAWN_MOTIONS, spawnSpecOf, type SpawnSpec } from "../../spawn";
import type { Group } from "../../tokens";
import { op, OpError, S } from "../op";
import { withGroups } from "../state";
import { groupById, itemById, unlocked } from "./common";
import { setAction } from "./data";

type SpawnArgs = { id: string; spawn: Partial<SpawnSpec> | null; on?: { part: string; event: string } };

export const setSpawn = op<SpawnArgs, { group: string }>({
  name: "set_spawn",
  summary:
    'Makes a group (by its id or one of its parts\') a template drawn once per event instead of once: each {do: "spawn", group} effect makes an instance of it, which reads that step\'s event.<field> in its words ({{event.amount}}), lives life seconds of the app\'s clock (a paused clock keeps it) and gives way to the next when max are alive (the oldest goes). at: an expression read as it spawns, the id of the entity it stands over ("event.id"). motion: float (rises as it fades: a damage number), fade, none. The canvas draws the template; the preview and the apps start with none. on: {part, event} also adds the spawn to what runs on that part\'s event (a world view\'s "hit"). null makes it a plain group again. Gives back the group id the effect names.',
  args: S.obj(
    {
      id: S.str("the template: a group, or a part in it"),
      spawn: {
        type: ["object", "null"],
        properties: {
          life: S.num(`seconds an instance lives (${SPAWN_LIMITS.life.min}-${SPAWN_LIMITS.life.max})`),
          max: S.int(`how many live at once (${SPAWN_LIMITS.max.min}-${SPAWN_LIMITS.max.max})`, { minimum: SPAWN_LIMITS.max.min, maximum: SPAWN_LIMITS.max.max }),
          at: S.str("an expression read at the spawn: the id of the entity it stands over (event.id)"),
          motion: S.enum(SPAWN_MOTIONS, "float: rises as it fades; fade: fades where it stands; none"),
        },
      },
      on: S.obj({ part: S.str("a part that sends events (a world view)"), event: S.str('one of its events ("hit")') }, ["part", "event"]),
    },
    ["id", "spawn"],
  ),
  label: () => "Spawn",
  run(s, a, ctx) {
    const g = groupById(s, a.id);
    unlocked(g, "That group");
    const r = a.spawn;
    if (r && ctx.strict) {
      if (r.motion !== undefined && !SPAWN_MOTIONS.includes(r.motion)) throw new OpError("invalid_value", `motion is one of ${SPAWN_MOTIONS.join(", ")}.`, "motion");
      if (r.life !== undefined && !(typeof r.life === "number" && r.life >= SPAWN_LIMITS.life.min && r.life <= SPAWN_LIMITS.life.max)) throw new OpError("invalid_value", `life is seconds, from ${SPAWN_LIMITS.life.min} to ${SPAWN_LIMITS.life.max}.`, "life");
      if (r.at !== undefined) {
        const e = exprSyntaxError(r.at);
        if (e) throw new OpError("invalid_value", `at: ${e}.`, "at");
      }
    }
    const spec = r ? spawnSpecOf({ ...g.spawn, ...r }) : undefined;
    if (r && ctx.strict && g.inFlow && s.doc.groups.some((x) => x.id === g.inFlow && x.repeat)) throw new OpError("refused", "A part a repeat draws cannot also be a template: make the template a group of its own.", g.id);
    const groups = s.doc.groups.map((x): Group => {
      if (x.id !== g.id) return x;
      const { spawn: _was, ...rest } = x;
      return spec ? { ...rest, spawn: spec } : rest;
    });
    let state = withGroups(s, groups);
    if (a.on && spec) {
      const { item } = itemById(state, a.on.part);
      if (ctx.strict && !eventsOf(item).some((e) => e.name === a.on!.event)) {
        const names = eventsOf(item).map((e) => e.name);
        throw new OpError("invalid_value", `${item.component} sends ${names.length ? names.join(", ") : "no events"}, not ${JSON.stringify(a.on.event)}.`, "on");
      }
      const slot = eventKey(a.on.event);
      const was: Action = item.actions?.[slot] ?? { to: STAY_TARGET, effects: [] };
      const effects = was.effects ?? [];
      /* once is enough: the same spawn twice would make two instances an event */
      if (!effects.some((e) => e.do === "spawn" && e.group === g.id)) state = setAction.run(state, { id: a.on.part, slot, action: { ...was, effects: [...effects, { do: "spawn", group: g.id }] } }, ctx).state;
    }
    return { state, result: { group: g.id } };
  },
});
