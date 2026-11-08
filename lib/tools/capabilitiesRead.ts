/* The tool that reads the platform capabilities (lib/capabilities, docs/平台能力.md): the catalog's and the product's
 * own, what each takes, gives back and how it fails, which the document uses, and how the mocks answer them. */

import { allCapabilities, failuresOf } from "../capabilities/catalog";
import { capabilitiesUsed } from "../capabilities/doc";
import type { CapabilityDef, CapabilitySchema } from "../capabilities/types";
import { tool, type Tool } from "./types";

/** a schema's fields in a line: `orderId*: string, amount: number` */
function fieldsOf(schema: CapabilitySchema | undefined): string {
  if (!schema || typeof schema !== "object" || typeof schema.properties !== "object" || !schema.properties) return "";
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  return Object.entries(schema.properties as Record<string, CapabilitySchema>)
    .map(([k, v]) => `${k}${required.has(k) ? "*" : ""}: ${typeof v === "object" && v ? (Array.isArray(v.enum) ? (v.enum as unknown[]).join("|") : String(v.type ?? "any")) : "any"}`)
    .join(", ");
}

const line = (c: CapabilityDef, own: boolean) => {
  const parts = [`- ${c.name} (${c.kind}${own ? ", the product's own" : ""}${c.generic ? ", generic: the apps have a default adapter where the platform can" : ""}): ${c.summary ?? ""}`];
  if (c.kind === "call") parts.push(`  args {${fieldsOf(c.args)}} → result {${fieldsOf(c.result)}}; fails ${failuresOf(c).join(", ") || "never"}`);
  if (c.kind === "event") parts.push(`  payload {${fieldsOf(c.payload)}}`);
  if (c.kind === "view") parts.push(`  props {${fieldsOf(c.props)}}; events ${(c.events ?? []).map((e) => `on:${e.name}`).join(", ")}`);
  return parts.join("\n");
};

const listCapabilities = tool<Record<string, never>>({
  name: "list_capabilities",
  group: "read",
  description:
    "The platform capabilities (payment, sign-in with another service, location, scanning, push, share, clipboard, links, files, analytics, biometrics, calls; the views of a map, a camera, a call): each one's arguments (* required), result and failures, the ones the document uses, the product's own, and how the mocks answer them. A call is used with the effect {do: \"invoke\", capability, args, then, catch}; a view is a part (map, camera, video-call).",
  input: { type: "object", properties: {}, required: [], additionalProperties: false },
  output: "the catalog as text",
  readOnly: true,
  destructive: false,
  async run(_a, env) {
    const doc = env.store.get().doc;
    const own = new Set((doc.capabilities?.own ?? []).map((c) => c.name));
    const used = capabilitiesUsed(doc);
    const rules = doc.mocks?.capabilities ?? {};
    const byScenario = (doc.mocks?.scenarios ?? []).filter((s) => s.capabilities && Object.keys(s.capabilities).length);
    const mocks = [
      ...Object.entries(rules).map(([n, r]) => `- ${n}: ${r.fail ? `fails ${r.fail}` : "answers"}${r.delayMs !== undefined ? ` after ${r.delayMs} ms` : ""}`),
      ...byScenario.flatMap((s) => Object.entries(s.capabilities!).map(([n, r]) => `- in ${s.id}: ${n} ${r.fail ? `fails ${r.fail}` : "answers"}`)),
    ];
    return {
      result: [
        "Capabilities (M3E implements none: the design says when one is used and shows every outcome; the export prints its types and a place for its adapter):",
        ...allCapabilities(doc.capabilities).map((c) => line(c, own.has(c.name))),
        "",
        `The document uses: ${used.join(", ") || "none yet"}.`,
        mocks.length ? `How the mocks answer (else the catalog's example):\n${mocks.join("\n")}` : "The mocks answer every call with the catalog's example (set_mock_capability changes that, in all scenarios or one).",
      ].join("\n"),
    };
  },
});

export const CAPABILITY_READ_TOOLS: Tool<never>[] = [listCapabilities as unknown as Tool<never>];
