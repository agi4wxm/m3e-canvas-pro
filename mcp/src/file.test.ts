/* The MCP server on a project file, through the SDK's own client: the tools it lists and how, reads and edits that
 * reach the file, a batch that fails leaving the file as it was, read-only sessions, a file changed on disk, the
 * generative tools only with a key, destructive calls asked of the person at the client. */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { attachFiles, parseProject, serializeProject } from "../../lib/core/projectFile";
import { setGlobalLang } from "../../lib/i18n";
import { openProject, projectFile } from "../../lib/project";
import { connect, errorOf, scratchDir, textOf, writeProject } from "./testkit";

beforeAll(() => setGlobalLang("en"));

const onDisk = (path: string) => openProject(JSON.parse(readFileSync(path, "utf8")))!;

let done: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const d of done) await d();
  done = [];
});

async function open(o: Parameters<typeof connect>[0] = {}, elicit?: (m: string) => boolean) {
  const path = join(scratchDir(), "m3e-canvas Shop.json");
  writeProject(path);
  const s = await connect({ file: path, ...o }, elicit);
  done.push(s.close);
  return { ...s, path };
}

describe("the MCP server on a project file", () => {
  it("lists the registry's tools with their schemas and hints", async () => {
    const { client, registry } = await open();
    const { tools } = await client.listTools();
    const by = new Map(tools.map((t) => [t.name, t]));
    expect(tools.length).toBe(registry.tools.length + 1);
    expect(by.get("get_outline")?.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
    expect(by.get("remove_nodes")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(by.get("add_part")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
    expect(by.get("add_part")?.inputSchema.properties).toHaveProperty("slug");
    expect(by.get("apply_ops")?.outputSchema).toMatchObject({ type: "object", required: ["result"] });
    expect(by.has("connection_status")).toBe(true);
    /* no key in the environment: nothing that draws with a model */
    expect(by.has("generate_svg")).toBe(false);
    expect(by.has("generate_image")).toBe(false);
    expect(client.getInstructions()).toContain("apply_ops");
  });

  it("offers the generative tools when OPENAI_API_KEY is in the server's environment", async () => {
    const { client } = await open({ env: { OPENAI_API_KEY: "test-key-not-used" } });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("generate_svg");
    expect(names).toContain("generate_image");
    /* the key itself is never in what a client is told */
    expect(JSON.stringify(await client.listTools())).not.toContain("test-key-not-used");
    expect(client.getInstructions()).not.toContain("test-key-not-used");
  });

  it("reads the document and writes each change to the file", async () => {
    const { call, path } = await open();
    const outline = await call("get_outline");
    expect(outline.isError).toBeFalsy();
    expect(textOf(outline)).toContain('## screen home "Home"');
    expect(textOf(outline)).toContain("hello text");
    expect((outline.structuredContent as { result: string }).result).toBe(textOf(outline));

    const added = await call("add_screen", { id: "cart", name: "Cart" });
    expect(added.isError).toBeFalsy();
    expect(added.structuredContent).toEqual({ result: { id: "cart" } });
    expect(onDisk(path).frames.map((f) => f.id)).toEqual(["home", "cart"]);

    const kit = await call("add_kit", { slug: "search-bar", screen: "cart" });
    expect(kit.isError).toBeFalsy();
    const doc = onDisk(path);
    expect(doc.groups.some((g) => g.kit?.slug === "search-bar")).toBe(true);
    /* the file is the editor's own format, as "Save project" writes it */
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ format: "m3e-project", version: 2 });
  });

  it("gives back errors a model can act on", async () => {
    const { call } = await open();
    const r = await call("set_props", { id: "nothing-here", props: { text: "x" } });
    expect(r.isError).toBe(true);
    expect(errorOf(r)).toMatchObject({ code: "not_found" });
    expect(errorOf(r)?.hint).toBeTruthy();
    const bad = await call("add_screen", { name: 3 });
    expect(errorOf(bad)?.code).toBe("bad_args");
  });

  it("runs a batch all or nothing", async () => {
    const { call, path } = await open();
    const before = readFileSync(path, "utf8");
    const failed = await call("apply_ops", {
      ops: [
        { op: "add_screen", args: { id: "s2", name: "Two" } },
        { op: "add_part", args: { slug: "button", id: "go", screen: "s2", props: { label: "Go" } } },
        { op: "set_props", args: { id: "not-a-part", props: { label: "x" } } },
      ],
    });
    expect(failed.isError).toBe(true);
    expect(errorOf(failed)?.message).toMatch(/ops\[2\].*none of the 3 operations ran/);
    expect(readFileSync(path, "utf8")).toBe(before);
    const outline = textOf(await call("get_outline"));
    expect(outline).not.toContain("Two");

    const ok = await call("apply_ops", {
      label: "Second screen",
      ops: [
        { op: "add_screen", args: { id: "s2", name: "Two" } },
        { op: "add_part", args: { slug: "button", id: "go", screen: "s2", props: { label: "Go" } } },
      ],
    });
    expect(ok.isError).toBeFalsy();
    expect((ok.structuredContent as { result: { ran: number } }).result.ran).toBe(2);
    const doc = onDisk(path);
    expect(doc.frames.map((f) => f.id)).toContain("s2");
    expect(doc.groups.flatMap((g) => g.items).find((it) => it.id === "go")?.props?.label).toBe("Go");
  });

  it("offers only the reading tools in a read-only session, and never writes", async () => {
    const { client, call, path, registry } = await open({ readOnly: true });
    const before = readFileSync(path, "utf8");
    const tools = (await client.listTools()).tools;
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["get_outline", "find_nodes", "describe_node", "screenshot", "list_parts"]));
    expect(tools.map((t) => t.name)).not.toContain("apply_ops");
    expect(registry.tools.every((t) => t.readOnly)).toBe(true);
    const r = await call("add_screen", { name: "Nope" });
    expect(r.isError).toBe(true);
    expect(errorOf(r)?.code).toBe("unknown_tool");
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(textOf(await call("find_nodes", { text: "hello" }))).toContain('"id":"hello"');
  });

  it("does not overwrite a file changed on disk since it was read", async () => {
    const { call, path } = await open();
    await call("add_screen", { id: "cart", name: "Cart" });
    /* someone else saves the file: another screen, and the cart gone */
    const theirs = onDisk(path);
    theirs.frames = theirs.frames.filter((f) => f.id !== "cart").concat({ ...theirs.frames[0], id: "theirs", name: "Theirs", x: 2000 });
    const written = JSON.stringify(projectFile(theirs), null, 2);
    writeFileSync(path, written);

    const r = await call("add_screen", { id: "mine", name: "Mine" });
    expect(r.isError).toBe(true);
    expect(errorOf(r)).toMatchObject({ code: "refused" });
    expect(errorOf(r)?.message).toMatch(/changed on disk/);
    expect(readFileSync(path, "utf8")).toBe(written);

    /* read again: the next call works on their document */
    const outline = textOf(await call("get_outline"));
    expect(outline).toContain("Theirs");
    expect(outline).not.toContain("Cart");
    const again = await call("add_screen", { id: "mine", name: "Mine" });
    expect(again.isError).toBeFalsy();
    expect(onDisk(path).frames.map((f) => f.id)).toEqual(["home", "theirs", "mine"]);
  });

  it("writes the editor's own format, byte for byte", async () => {
    const { call, path } = await open();
    await call("add_screen", { id: "cart", name: "Cart" });
    const text = readFileSync(path, "utf8");
    /* what the editor would write for the same document (lib/core/projectFile.ts): sorted keys, one line a part */
    expect(text).toBe(serializeProject(parseProject(text)!.doc).text);
    expect(text).toMatch(/^ {4}"frames": \[\n {6}\{"id":"home"/m);
  });

  it("keeps a project folder's pictures beside it", async () => {
    const dir = scratchDir();
    const s = await connect({ file: dir });
    done.push(s.close);
    const picture = `data:image/png;base64,${Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 37) % 256)).toString("base64")}`;
    const r = await s.call("apply_ops", { ops: [{ op: "add_screen", args: { id: "home", name: "Home" } }, { op: "add_part", args: { slug: "image", id: "hero", screen: "home", at: { x: 16, y: 80 }, props: { src: picture } } }] });
    expect(r.isError).toBeFalsy();
    const text = readFileSync(join(dir, "m3e-project.json"), "utf8");
    const parsed = parseProject(text)!;
    expect(parsed.files).toHaveLength(1);
    expect(text).not.toContain(picture.slice(30, 90));
    expect(existsSync(join(dir, parsed.files[0]))).toBe(true);
    expect(JSON.stringify(attachFiles(parsed.doc, new Map([[parsed.files[0], new Uint8Array(readFileSync(join(dir, parsed.files[0])))]])))).toContain(picture);
    /* read again by another server: the picture comes back whole */
    const again = await connect({ file: dir });
    done.push(again.close);
    expect(JSON.stringify((await again.call("describe_node", { id: "hero" })).structuredContent)).toContain(picture.slice(-40));
    expect(((await again.call("connection_status")).structuredContent as { result: { layout: string } }).result.layout).toMatch(/folder/);
  });

  it("starts a file that does not exist yet with the first change", async () => {
    const path = join(scratchDir(), "new.json");
    const s = await connect({ file: path });
    done.push(s.close);
    expect(textOf(await s.call("list_screens"))).toBe("[]");
    await s.call("add_screen", { id: "first", name: "First" });
    expect(onDisk(path).frames.map((f) => f.id)).toEqual(["first"]);
  });

  it("asks the person at the client before a destructive call, and refuses it when the client cannot ask", async () => {
    const plain = await open();
    const r = await plain.call("remove_nodes", { ids: ["hello"] });
    expect(errorOf(r)).toMatchObject({ code: "refused" });
    expect(textOf(await plain.call("get_outline"))).toContain("hello text");

    const asked: string[] = [];
    let allow = false;
    const s = await open({}, (m) => {
      asked.push(m);
      return allow;
    });
    expect(errorOf(await s.call("remove_nodes", { ids: ["hello"] }))?.message).toMatch(/declined/);
    allow = true;
    const ok = await s.call("apply_ops", { ops: [{ op: "remove_nodes", args: { ids: ["hello"] } }] });
    expect(ok.isError).toBeFalsy();
    expect(asked).toHaveLength(2);
    expect(onDisk(s.path).groups.flatMap((g) => g.items).some((it) => it.id === "hello")).toBe(false);

    const free = await open({ allowDestructive: true });
    expect((await free.call("remove_screen", { id: "home" })).isError).toBeFalsy();
  });

  it("says where calls go, and that pictures need a renderer", async () => {
    const { call } = await open();
    const status = (await call("connection_status")).structuredContent as { result: { mode: string; file: string } };
    expect(status.result.mode).toBe("file");
    const shot = await call("screenshot", { id: "home" });
    expect(errorOf(shot)?.code).toBe("unavailable");
  });

  it("serves the guide as a prompt and the document as resources", async () => {
    const { client, call } = await open();
    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((p) => p.name)).toEqual(["guide", "design_screen"]);
    const guide = await client.getPrompt({ name: "guide" });
    expect((guide.messages[0].content as { text: string }).text).toContain("Tools by group");
    const design = await client.getPrompt({ name: "design_screen", arguments: { brief: "a cart" } });
    expect((design.messages[0].content as { text: string }).text).toContain("a cart");

    const list = await client.listResources();
    expect(list.resources.map((r) => r.uri)).toContain("m3e://document/outline");
    const outline = await client.readResource({ uri: "m3e://document/outline" });
    expect((outline.contents[0] as { text: string }).text).toContain('screen home "Home"');
    const screen = await client.readResource({ uri: "m3e://screen/home/outline" });
    expect((screen.contents[0] as { text: string }).text).toContain("hello");
    const part = await client.readResource({ uri: "m3e://part/button" });
    expect(JSON.parse((part.contents[0] as { text: string }).text)).toMatchObject({ slug: "button" });
    await expect(client.readResource({ uri: "m3e://node/nope" })).rejects.toThrow(/no part/i);

    /* a subscription hears of a change */
    const heard: string[] = [];
    client.setNotificationHandler((await import("@modelcontextprotocol/sdk/types.js")).ResourceUpdatedNotificationSchema, async (n) => {
      heard.push(n.params.uri);
    });
    await client.subscribeResource({ uri: "m3e://document/outline" });
    await call("set_title", { title: "Shop two" });
    await new Promise((r) => setTimeout(r, 600));
    expect(heard).toContain("m3e://document/outline");
  });
});
