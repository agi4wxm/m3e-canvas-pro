import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCode } from "../../lib/codegen";
import { arrangeFlows } from "../../lib/flow";
import { buildPrompt } from "../../lib/prompt";
import { LANGS, type Lang } from "../../lib/i18n";
import { PROJECT_FORMAT, PROJECT_VERSION, isProject, openProject } from "../../lib/project";
import { BACK_TARGET, frameRect, PHONE_MODELS, type Doc, type Group, type Item } from "../../lib/tokens";
import { defaultTextOf, listTextOf } from "../labels";
import { partBySlug, reader } from "../registry";
import { lengthToHold } from "../../lib/tidy";
import { defaultMeasures, inLang, instantiate, seedGroups } from "./kit";
import { TEMPLATES, templateCatalog } from "./index";
import { panesOfSplit, splitOf } from "../../lib/split";

const seedsOf = (t: (typeof TEMPLATES)[number]) => t.build().map((s) => ({ seed: s, groups: seedGroups(s) }));
const docOf = (t: (typeof TEMPLATES)[number], lang: Lang): Doc => {
  const { frames, groups } = instantiate(t, lang);
  return { frames, groups, paletteKey: "purple", frame: "phone", title: t.name, brief: "" };
};

/* words on a part that are not read as words */
const NOT_WORDS = new Set(["link.href", "text-field.value"]);
const wordy = (s: string) => /\p{L}{2,}/u.test(s);

describe.each(TEMPLATES.map((t) => [t.slug, t] as const))("template %s", (_slug, t) => {
  it("builds from parts that exist, setting only props they have", () => {
    for (const { groups } of seedsOf(t))
      for (const g of groups)
        for (const it of g.items) {
          const def = partBySlug(it.component);
          expect(def, `${it.component}`).toBeDefined();
          for (const key of Object.keys(it.props ?? {})) expect(def!.props.map((d) => d.key), `${it.component}.${key}`).toContain(key);
        }
  });

  it("stands on its screen as parts, and what is nested is in a layout of the same screen", () => {
    for (const { groups } of seedsOf(t)) {
      const ids = new Set(groups.map((g) => g.id));
      expect(groups.filter((g) => !g.inFlow).length).toBeGreaterThan(0);
      for (const g of groups) if (g.inFlow) expect(ids, g.id).toContain(g.inFlow);
      /* a screen's own bars stand on the screen itself, where a style can move them */
      for (const g of groups.filter((x) => x.inFlow)) expect(["app-bar", "navigation-bar", "navigation-rail"], `${g.items[0].component} in a layout`).not.toContain(g.items[0].component);
    }
  });

  it("fits its device as it comes, and is not longer than it says", () => {
    const { frames, groups } = instantiate(t, "en");
    const m = defaultMeasures(groups);
    for (const f of frames) {
      if (f.length) continue;
      const mine = groups.filter((g) => g.x >= f.x && g.x < f.x + (f.w ?? 412));
      expect(lengthToHold(mine, f, m), `${f.name} needs`).toBeLessThanOrEqual(f.h ?? 892);
    }
  });

  it("has ids of its own, in the seed and in every copy", () => {
    const all = seedsOf(t).flatMap(({ groups }) => groups.flatMap((g) => [g.id, ...g.items.map((it) => it.id)]));
    expect(new Set(all).size).toBe(all.length);
    const a = instantiate(t, "en");
    const b = instantiate(t, "en");
    const idsOf = (d: typeof a) => [...d.frames.map((f) => f.id), ...d.groups.flatMap((g) => [g.id, ...g.items.map((it) => it.id)])];
    expect(new Set([...idsOf(a), ...idsOf(b)]).size).toBe(idsOf(a).length * 2);
  });

  it("links only within itself, from places the part has", () => {
    const screens = t.build().map((s) => s.id);
    for (const { groups } of seedsOf(t))
      for (const g of groups)
        for (const it of g.items) {
          const def = partBySlug(it.component)!;
          const slots = def.slots?.(reader(def, inLang(it.props, "en"))).map((s) => s.key) ?? [];
          if (it.action) expect([...screens, BACK_TARGET], it.id).toContain(it.action.to);
          for (const [slot, a] of Object.entries(it.actions ?? {})) {
            expect(slots, `${it.component} slot ${slot}`).toContain(slot);
            expect([...screens, BACK_TARGET], it.id).toContain(a.to);
          }
        }
    /* what an added document links to is a screen in it */
    const doc = docOf(t, "en");
    const frames = doc.frames.map((f) => f.id);
    for (const g of doc.groups)
      for (const it of g.items) for (const a of [it.action, ...Object.values(it.actions ?? {})]) if (a) expect([...frames, BACK_TARGET], it.id).toContain(a.to);
  });

  it("opens as a project", () => {
    const doc = docOf(t, "zh");
    expect(isProject(doc)).toBe(true);
    const round = openProject(JSON.parse(JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION, document: doc })));
    expect(round).not.toBeNull();
    expect(round!.groups.length).toBe(doc.groups.length);
  });

  it("settles under auto layout, with nothing wider than its screen", () => {
    const { frames, groups } = instantiate(t, "en");
    const again = arrangeFlows(groups, defaultMeasures(groups));
    expect(again).toBe(groups);
    const m = defaultMeasures(groups);
    for (const g of groups) {
      const f = frames.find((x) => g.x >= frameRect(x).l - 1 && g.x <= frameRect(x).r)!;
      expect(f, `${g.id} is on a screen`).toBeDefined();
      const r = frameRect(f);
      const it = g.items[0];
      const w = m[it.id];
      expect(g.x, `${it.component} left`).toBeGreaterThanOrEqual(r.l);
      expect(g.x + w, `${it.component} right`).toBeLessThanOrEqual(r.r);
    }
  });

  it("prints with no unknown component", () => {
    const { code } = buildCode(docOf(t, "ko"), defaultMeasures(docOf(t, "ko").groups));
    expect(code).not.toContain("unknown component");
  });

  it("names no product, game or brand: a template is for anyone's", () => {
    const words = JSON.stringify(t.build().map((s) => s.roots)) + t.name + Object.values(t.labels).join(" ");
    expect(words).not.toMatch(/WeChat|微信|TikTok|抖音|Instagram|Genshin|原神|Royal Match|Honor of Kings|王者荣耀|Harbour|海港/i);
  });

  it("reads in every language", () => {
    const lacks = (it: Item, lang: Lang): string[] => {
      const def = partBySlug(it.component)!;
      const p = reader(def, it.props);
      return def.props.flatMap((d) => {
        if (d.when && !d.when(p)) return [];
        if (it.props && d.key in it.props) return [];
        const id = `${def.slug}.${d.key}`;
        if (NOT_WORDS.has(id)) return [];
        if (d.kind === "text" && d.default && wordy(d.default) && defaultTextOf(d, lang) === d.default) return [id];
        if (d.kind === "list" && d.default.some((row) => wordy(row.label) && listTextOf(row.label, lang) === row.label)) return [id];
        /* a table's default has no translations at all */
        if (d.kind === "table" && d.default.rows.flat().some(wordy)) return [id];
        return [];
      });
    };
    for (const { key: lang } of LANGS) {
      if (lang === "en") continue;
      const { frames, groups } = instantiate(t, lang);
      for (const f of frames) expect(f.name).toBeTruthy();
      expect(groups.flatMap((g: Group) => g.items.flatMap((it) => lacks(it, lang)))).toEqual([]);
      /* nothing is left as a dictionary of languages */
      expect(JSON.stringify(groups)).not.toContain('"ja":');
    }
  });
});

describe("the set of templates", () => {
  it("has a slug of its own for each, and a name in every language", () => {
    expect(new Set(TEMPLATES.map((t) => t.slug)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) for (const l of ["ja", "zh", "ko"] as const) expect(t.labels[l], `${t.slug}.${l}`).not.toBe(t.name);
  });

  it("names two screens apart, and leaves a screen with no links when it is added alone", () => {
    const shop = TEMPLATES.find((t) => t.slug === "shop-flow")!;
    const again = instantiate(shop, "en", { x: 0, y: 0 }, instantiate(shop, "en").frames.map((f) => f.name));
    expect(new Set(again.frames.map((f) => f.name)).size).toBe(again.frames.length);
    expect(again.frames[0].name).toMatch(/ 2$/);
    for (const t of TEMPLATES.filter((x) => x.category !== "flow")) {
      expect(t.build().length, t.slug).toBe(1);
      expect(seedsOf(t).flatMap(({ groups }) => groups.flatMap((g) => g.items.flatMap((it) => [it.action, ...Object.values(it.actions ?? {})].filter(Boolean)))), t.slug).toEqual([]);
    }
  });

  it("is described by the names its groups carry, and a name the author gives wins", () => {
    const doc = docOf(TEMPLATES.find((t) => t.slug === "login")!, "en");
    const form = doc.groups.find((g) => g.items[0].component === "auth-form")!;
    /* the code a part prints still has its own words: it is what the part is called that changes */
    const called = (d: Doc) => buildPrompt(d, defaultMeasures(d.groups), d.frames[0].id, "en").includes('form "Front door"');
    expect(called(doc)).toBe(false);
    expect(called({ ...doc, groups: doc.groups.map((g) => (g === form ? { ...g, name: "Front door" } : g)) })).toBe(true);
  });

  it("goes on from the splash when the first launch is added as a flow", () => {
    const { groups, frames } = instantiate(TEMPLATES.find((t) => t.slug === "start-flow")!, "en");
    const onboarding = frames.find((f) => f.name === "Onboarding")!;
    const links = groups.flatMap((g) => g.items.flatMap((it) => (it.action ? [it.action.to] : [])));
    expect(links).toContain(onboarding.id);
  });

  it("keeps the login flow to signing in: what comes after is the app's own", () => {
    const flow = TEMPLATES.find((t) => t.slug === "auth-flow")!;
    const names = flow.build().map((s) => s.id);
    expect(names).toEqual(["login", "signup", "forgot", "verify", "reset"]);
    expect(names).not.toContain("home");
  });

  it("takes the size of the phone it is added for, screens on their side too", () => {
    const small = { w: 360, h: 780 };
    const { frames } = instantiate(TEMPLATES.find((t) => t.slug === "login")!, "en", { x: 0, y: 0 }, [], small);
    expect(frames[0]).toMatchObject(small);
    const wide = instantiate(TEMPLATES.find((t) => t.slug === "battle-hud")!, "en", { x: 0, y: 0 }, [], small);
    expect(wide.frames[0]).toMatchObject({ w: 780, h: 360 });
    /* the usual phone says nothing, as any frame does */
    expect(instantiate(TEMPLATES.find((t) => t.slug === "login")!, "en").frames[0].w).toBeUndefined();
  });

  it("stays on the narrowest phone there is a model for, what stands by one edge too", () => {
    const narrowest = PHONE_MODELS.reduce((a, b) => (b.w < a.w || (b.w === a.w && b.h < a.h) ? b : a));
    const size = { w: narrowest.w, h: narrowest.h };
    for (const t of TEMPLATES) {
      const { frames, groups } = instantiate(t, "en", { x: 0, y: 0 }, [], size);
      const m = defaultMeasures(groups);
      for (const f of frames) {
        const screen = frameRect(f);
        const mine = groups.filter((g) => !g.inFlow && g.x >= screen.l && g.x < screen.r);
        for (const g of mine) {
          const w = m[g.items[0].id];
          expect(g.x + w, `${t.slug}: ${g.items[0].component} runs off ${f.name}`).toBeLessThanOrEqual(screen.r + 1);
        }
      }
    }
  });

  it("covers what games need, whatever the game", () => {
    const games = TEMPLATES.filter((t) => t.category === "game").map((t) => t.slug);
    expect(games.length).toBeGreaterThanOrEqual(20);
    for (const s of ["game-title", "game-lobby", "level-select", "battle-hud", "pause-menu", "victory", "defeat", "game-inventory", "game-shop", "gacha-pull", "daily-check-in", "game-quests", "battle-pass", "game-leaderboard", "game-guild", "pc-main-menu"]) expect(games, s).toContain(s);
  });

  it("is named in the guide an AI agent reads (bun run gen:agent)", () => {
    const guide = readFileSync(new URL("../../public/agent.md", import.meta.url), "utf8").replaceAll("\r\n", "\n");
    expect(guide).toContain(templateCatalog());
  });

  it("splits a desktop window's panes with split views the reader drags, not rows of fixed widths", () => {
    /* the mail's list and message, the files and the details, the editor's files, editors and terminal */
    const want: Record<string, { splits: number; words: string[][] }> = {
      "mail-inbox": { splits: 1, words: [["Search"], ["Notes from the review", "Reply"]] },
      "file-manager": { splits: 1, words: [["Report.pdf"], ["Open", "Share"]] },
      "editor-workspace": { splits: 3, words: [["Files"], []] },
    };
    for (const [slug, w] of Object.entries(want)) {
      const doc = docOf(TEMPLATES.find((t) => t.slug === slug)!, "en");
      const groups = arrangeFlows(doc.groups, defaultMeasures(doc.groups));
      const splits = groups.filter((g) => !!splitOf(g));
      expect(splits.length, slug).toBe(w.splits);
      for (const s of splits) {
        const panes = panesOfSplit(groups, s.id);
        expect(panes.first && panes.second, slug).toBeTruthy();
        /* each pane as big as its split gives it, beside (or under) the other */
        const sp = splitOf(s)!;
        const size = (g: Group) => g.items[0].props as { width: number; height: number };
        const along = (g: Group) => (sp.vertical ? size(g).height : size(g).width);
        expect(along(panes.first!) + along(panes.second!) + sp.divider, slug).toBe(sp.vertical ? size(s).height : size(s).width);
      }
      /* the outer split's panes hold what they did as fixed columns */
      const outer = panesOfSplit(groups, splits[0].id);
      const textIn = (pane: Group) => {
        const inside = new Set([pane.id]);
        for (let grew = true; grew; ) {
          grew = false;
          for (const g of groups)
            if (g.inFlow && inside.has(g.inFlow) && !inside.has(g.id)) {
              inside.add(g.id);
              grew = true;
            }
        }
        return JSON.stringify(groups.filter((g) => inside.has(g.id)).map((g) => g.items[0].props));
      };
      w.words[0].forEach((x) => expect(textIn(outer.first!), `${slug}: ${x}`).toContain(x));
      w.words[1].forEach((x) => expect(textIn(outer.second!), `${slug}: ${x}`).toContain(x));
    }
  });
});
