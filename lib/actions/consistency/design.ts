/* A row's design as a document, built the way the editor, the AI and MCP build one: through the operations
 * (lib/core/ops), so every host reads a document like the ones people make. */

import { DocStore, counterIds, guessMeasurer, ops, savedDoc, stateOf } from "../../core";
import type { Doc } from "../../tokens";
import type { Design, OperationSpec } from "./types";

const SLUG = { button: "button", text: "text", field: "text-field", menu: "dropdown-menu", dialog: "dialog" } as const;

function endpointArgs(o: OperationSpec) {
  const props = (fields: Record<string, "string" | "number">) => Object.fromEntries(Object.entries(fields).map(([k, t]) => [k, { type: t }]));
  const body = o.body
    ? {
        type: "object" as const,
        properties: Object.fromEntries(Object.entries(o.body).map(([k, f]) => [k, { type: f.type ?? "string", title: f.title, ...(f.required ? { minLength: 1 } : {}) }])),
        required: Object.entries(o.body).flatMap(([k, f]) => (f.required ? [k] : [])),
      }
    : undefined;
  return {
    operationId: o.operationId,
    method: o.method ?? "post",
    path: o.path,
    ...(o.query?.length ? { parameters: o.query.map((name) => ({ name, in: "query" as const, schema: { type: "string" as const } })) } : {}),
    ...(body ? { body } : {}),
    returns: { type: "object" as const, properties: props(o.returns ?? {}) },
  };
}

/** The document a design is, and each part's group, by the part's id. The ids are the design's own, the same on every
 *  build, so a printed copy of it is the same every time. */
export function designDoc(d: Design): { doc: Doc; widths: Record<string, number>; groupOf: Record<string, string> } {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  const groupOf: Record<string, string> = {};
  store.transact("Build the row", "mcp", (tx) => {
    tx.run(ops.setTitle, { title: "Consistency" });
    for (const o of d.api ?? []) tx.run(ops.addEndpoint, endpointArgs(o) as never);
    if (d.login) tx.run(ops.setAuth, { schemes: { bearerAuth: { type: "http", scheme: "bearer" } }, security: [{ bearerAuth: [] }], login: d.login, tokenField: "token" } as never);
    for (const s of d.screens) {
      tx.run(ops.addScreen, { id: s.id, name: s.name });
      if (s.params?.length) tx.run(ops.setScreenParams, { screen: s.id, params: s.params.map((name) => ({ name, type: "string" as const })) });
      if (s.auth) tx.run(ops.setScreenAuth, { screen: s.id, auth: s.auth });
    }
    for (const v of d.vars ?? []) tx.run(ops.addVar, { id: v.id, name: v.name, type: v.type, value: v.value });
    /* one part under another, down each screen */
    const y: Record<string, number> = {};
    for (const p of d.parts) {
      const screen = p.screen ?? d.screens[0].id;
      const at = { x: 16, y: (y[screen] = (y[screen] ?? 24) + 64) };
      const kind = p.kind ?? "button";
      const props =
        kind === "text"
          ? { text: p.label }
          : kind === "menu"
            ? { label: p.label, items: (p.items ?? []).map((label) => ({ label })), destructive: "" }
            : kind === "dialog"
              ? { headline: p.label, supporting: "", confirm: p.items?.[0] ?? "OK", dismiss: "" }
              : { label: p.label };
      const out = tx.run(ops.addPart, { slug: SLUG[kind], id: p.id, screen, at, props }) as { groupId: string };
      groupOf[p.id] = out.groupId;
      if (p.action && !p.unchecked) tx.run(ops.setAction, { id: p.id, action: p.action as never });
    }
    for (const f of d.forms ?? []) {
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      tx.run(ops.makeForm, { screen: f.screen ?? d.screens[0].id, operationId: f.operationId, submitLabel: f.submit, ...(f.ok ? { then: f.ok } : {}), ...(f.fail ? { catch: f.fail } : {}) } as never);
    }
  });
  const doc = savedDoc(store.get());
  /* what starts hidden, and the actions written past the checks */
  const hidden = new Set(d.parts.filter((p) => p.hidden).map((p) => groupOf[p.id]));
  const unchecked = new Map(d.parts.filter((p) => p.unchecked && p.action).map((p) => [p.id, p.action!]));
  const groups = doc.groups.map((g) => {
    const items = unchecked.size ? g.items.map((it) => (unchecked.has(it.id) ? { ...it, action: unchecked.get(it.id) } : it)) : g.items;
    return { ...g, items, ...(hidden.has(g.id) ? { hidden: true } : {}) };
  });
  return { doc: { ...doc, groups }, widths: {}, groupOf };
}
