/* The reference of the parts used most, as the in-app agent's system prompt carries it: written from the registry,
 * naming each part's props, enum choices and tap places, and small enough to ride in the cached prompt. */

import { beforeAll, describe, expect, it } from "vitest";
import { partBySlug } from "../../parts/registry";
import { setGlobalLang } from "../i18n";
import { agentSetup } from "../agent";
import { atomsReference, REFERENCE_PARTS } from "./atoms";

beforeAll(() => setGlobalLang("en"));

/** what the reference may weigh: about 1.4k tokens at ~4 bytes a token (the field states and accessible names, said once) */
const MAX_BYTES = 5800;

describe("the parts reference", () => {
  it("covers parts that exist, one line each", () => {
    for (const slug of REFERENCE_PARTS) expect(partBySlug(slug), slug).toBeDefined();
    const lines = atomsReference().split("\n").filter((l) => l.startsWith("- "));
    expect(lines.map((l) => l.slice(2).split(":")[0])).toEqual([...REFERENCE_PARTS]);
  });

  it("names the props, the enum choices (default first) and the tap places models guess wrong", () => {
    const ref = atomsReference();
    const line = (slug: string) => ref.split("\n").find((l) => l.startsWith(`- ${slug}:`))!;
    expect(line("box")).toContain("surface none|card|panel|field|bar|chip|button|sheet|overlay|well");
    expect(line("avatar")).toContain("size default|sm|lg");
    expect(line("app-bar")).toMatch(/icon names: leading, trailing.*Tap places: icon \(leading icon\), icon2 \(trailing icon\)/);
    expect(line("navigation-bar")).toContain("tab:0, tab:1… (one per row of items)");
    expect(line("image")).toContain("picture: src");
    expect(line("text")).toContain("words: text");
  });

  it("gives each number its range and each list how many rows it takes, from the registry", () => {
    const ref = atomsReference();
    const line = (slug: string) => ref.split("\n").find((l) => l.startsWith(`- ${slug}:`))!;
    const text = partBySlug("text")!.props.find((d) => d.key === "width") as { min: number; max: number };
    expect(line("text")).toContain(`width ${text.min}–${text.max}`);
    expect(text.min).toBe(40);
    expect(line("navigation-bar")).toContain("items (3–5 rows) [{label, icon}]");
    expect(line("icon")).toMatch(/size 16–96/);
  });

  it("is small, and rides in the agent's system prompt", () => {
    const ref = atomsReference();
    const bytes = new TextEncoder().encode(ref).length;
    expect(bytes).toBeLessThan(MAX_BYTES);
    const { system } = agentSetup({ canSee: true, canDraw: true, drawings: 2 });
    expect(system).toContain(ref);
    /* the share of the system prompt it takes, for the record (see evals/baselines/*-fixes/notes.md) */
    expect(bytes / new TextEncoder().encode(system).length).toBeLessThan(0.4);
  });
});
