import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScreens } from "./codegen";
import { RUNTIME_TEMPLATE, runtimeSource } from "./runtimeSource";
import type { Doc } from "./tokens";

/* The exported app's link opener, run as the app runs it: a link can be made from data (a collection row's words, a
 * server's answer), so only web pages may leave the app — never `javascript:` or a `data:` page. */
const doc = { groups: [], frames: [{ id: "home", name: "Home", x: 0, y: 0 }], title: "Links", paletteKey: "purple", frame: "phone", brief: "" } as unknown as Doc;

function opener(): (url: string) => void {
  const source = runtimeSource(buildScreens(doc, {}, { live: true }).runtime, readFileSync(RUNTIME_TEMPLATE, "utf8"));
  const start = source.indexOf("openLink: (url) => {");
  expect(start).toBeGreaterThan(-1);
  /* the function's body, up to the line that closes it */
  const end = source.indexOf("\n      },", start);
  const fn = source.slice(start + "openLink: ".length, end + "\n      }".length);
  /* eslint-disable-next-line no-new-func -- the generated function's own text, run against a stand-in window */
  return new Function("window", `return ${fn}`)(fake) as (url: string) => void;
}

const opened: string[] = [];
const fake = { open: (url: string) => void opened.push(url) };

describe("the exported app's link opener", () => {
  it("opens web pages, with or without their scheme", () => {
    opened.length = 0;
    const open = opener();
    open("https://example.com/a");
    open("http://example.com/b");
    open("example.com/c");
    expect(opened).toEqual(["https://example.com/a", "http://example.com/b", "https://example.com/c"]);
  });

  it("refuses scripts and pages made of data, however they are written", () => {
    opened.length = 0;
    const open = opener();
    for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x", "file:///etc/passwd"]) open(bad);
    expect(opened).toEqual([]);
  });
});
