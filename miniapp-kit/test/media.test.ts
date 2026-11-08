/* The media parts the mini-program kit draws natively (src/kit/composites/media.tsx), drawn headless by the stand-in React
 * the consistency table runs on (test/table/tinyReact.ts): Taro's components are names whose props a test reads and
 * presses, Taro's API a fake that answers where a view stands and keeps what was copied. What each part shows from its
 * props, what a press or a finger on each of its places sends, and that what is true (whether it plays, the marker
 * chosen, a crop done) stays the props'. */
import { afterEach, describe, expect, it, mock } from "bun:test";

import { createTinyReact, type Element } from "./table/tinyReact";

const tiny = createTinyReact();
mock.module("react", () => tiny.react);
mock.module("react/jsx-runtime", () => tiny.jsxRuntime);
mock.module("react/jsx-dev-runtime", () => tiny.jsxRuntime);
mock.module("@tarojs/components", () => ({ View: "View", Image: "Image", Input: "Input", Picker: "Picker", Slider: "Slider", Textarea: "Textarea", Text: "Text", ScrollView: "ScrollView" }));

const copied: string[] = [];
/** where every view stands when asked: the box a test sets */
let rect = { left: 0, top: 0, width: 380, height: 240 };
mock.module("@tarojs/taro", () => {
  const taro = {
    getSystemInfoSync: () => ({ windowWidth: 375 }),
    onThemeChange: () => {},
    offThemeChange: () => {},
    setClipboardData: async ({ data }: { data: string }) => void copied.push(data),
    createSelectorQuery: () => {
      const q = { select: () => q, boundingClientRect: (fn: (r: typeof rect) => void) => ((q as { fn?: typeof fn }).fn = fn, q), exec: () => (q as { fn?: (r: typeof rect) => void }).fn?.(rect) };
      return q;
    },
  };
  return { default: taro, ...taro };
});

const { ThemeProvider } = await import("../src/kit/theme");
const { MATERIAL } = await import("../src/kit/theme.generated");
const M = await import("../src/kit/composites/media");

const h = tiny.react.createElement as (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => Element;
let root: unknown = null;

/** the part drawn afresh, every element of it */
function draw(type: unknown, props: Record<string, unknown> = {}): Element[] {
  tiny.reset();
  root = h(type, props);
  return redraw();
}
/** the part drawn again with what its state now holds */
const redraw = (): Element[] => tiny.elements(tiny.render(h(ThemeProvider, { theme: MATERIAL, dark: false }, root), (t) => typeof t === "function"));

const views = (els: Element[]) => els.filter((e) => typeof e.type === "string");
const byLabel = (els: Element[], label: string) => views(els).filter((e) => e.props.ariaLabel === label);
const one = (els: Element[], label: string) => {
  const found = byLabel(els, label);
  if (!found.length) throw new Error(`nothing is called ${label}`);
  return found[0];
};
const byPart = (els: Element[], id: string) => views(els).find((e) => e.props["data-part"] === id);
/** every word a part shows */
const words = (els: Element[]) => views(els).flatMap((e) => (typeof e.props.children === "string" ? [e.props.children] : Array.isArray(e.props.children) ? e.props.children.filter((x): x is string => typeof x === "string") : []));
const event = (more: Record<string, unknown> = {}) => ({ stopPropagation: () => {}, ...more });
/** a press on a view, and the part drawn again */
function press(el: Element): Element[] {
  (el.props.onClick as (e: unknown) => void)(event());
  return redraw();
}
const touch = (x: number, y: number) => event({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] });
const styleOf = (el: Element | undefined) => (el?.props.style ?? {}) as Record<string, unknown>;

/** a QR symbol's rows as base-36 numbers: what the editor's own encoder (parts/widgets/AppTools.tsx) draws for the same words */
const sig = (m: boolean[][] | null) => (m ? m.map((r) => parseInt(r.map((b) => (b ? 1 : 0)).join(""), 2).toString(36)).join(".") : null);

afterEach(() => tiny.reset());

describe("a carousel", () => {
  const slides = [{ label: "Sunrise" }, { label: "Forest" }, { label: "Ocean" }];

  it("pages through its slides under a finger going its way, saying which one shows", () => {
    let els = draw(M.Carousel, { testID: "c", slides });
    expect(words(els)).toContain("1/3");
    const box = byPart(els, "c")!;
    (box.props.onTouchStart as (e: unknown) => void)(touch(200, 100));
    (box.props.onTouchMove as (e: unknown) => void)(touch(80, 104));
    els = redraw();
    (byPart(els, "c")!.props.onTouchEnd as () => void)();
    els = redraw();
    expect(words(els)).toContain("2/3");
    /* a finger going up and down is the page's */
    (byPart(els, "c")!.props.onTouchStart as (e: unknown) => void)(touch(200, 100));
    (byPart(els, "c")!.props.onTouchMove as (e: unknown) => void)(touch(190, 300));
    els = redraw();
    (byPart(els, "c")!.props.onTouchEnd as () => void)();
    expect(words(redraw())).toContain("2/3");
    expect(byPart(els, "c")!.props.catchMove).toBe(false);
  });

  it("runs a slide's tap, and keeps a finger to itself when it pages up and down", () => {
    const second = mock(() => {});
    let els = draw(M.Carousel, { testID: "c", slides, taps: { "tab:1": second }, orientation: "vertical" });
    press(one(els, "Forest"));
    expect(second).toHaveBeenCalled();
    els = redraw();
    expect(byPart(els, "c")!.props.catchMove).toBe(true);
    expect(M.trackOffset(2, 3, 200, 16, 200)).toBe(432);
    expect(M.trackOffset(3, 4, 100, 10, 320)).toBe(110);
  });
});

describe("an expressive carousel", () => {
  it("lays its items on M3's keylines and moves them under a finger, settling on a step", () => {
    const k = M.keylinesOf("multi-browse", 420, 186, 8)!;
    expect(M.layoutAt(4, 0, k, 8).map((a) => Math.round(a.w))).toEqual([213, 135, 56, 0]);
    expect(M.widthAt(-1, k)).toBe(56);
    rect = { left: 0, top: 0, width: 420, height: 180 };
    let els = draw(M.ExpressiveCarousel, { testID: "x", slides: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }] });
    expect(Math.round(styleOf(one(els, "A")).width as number)).toBe(213);
    const box = byPart(els, "x")!;
    (box.props.onTouchStart as (e: unknown) => void)(touch(300, 50));
    (box.props.onTouchMove as (e: unknown) => void)(touch(150, 50));
    els = redraw();
    (byPart(els, "x")!.props.onTouchEnd as () => void)();
    els = redraw();
    expect(Math.round(styleOf(one(els, "A")).width as number)).toBe(56);
  });

  it("scrolls past items of one width when uncontained", () => {
    const els = draw(M.ExpressiveCarousel, { variant: "uncontained", itemWidth: 160, slides: [{ label: "A" }, { label: "B" }] });
    expect(styleOf(one(els, "B")).width).toBe(160);
  });
});

describe("stand-ins for what the kit does not play", () => {
  it("a video is its frame at 16:9 with its title and time, a page its address, an animation its file", () => {
    const els = draw(M.Video, { testID: "v", width: 320, title: "Trailer", time: "00:30", src: "https://example.com/a.mp4" });
    expect(styleOf(byPart(els, "v"))).toMatchObject({ width: 320, height: 180 });
    expect(words(els)).toEqual(expect.arrayContaining(["Trailer", "00:30"]));
    expect(views(els).some((e) => e.type === "Video")).toBe(false);
    expect(words(draw(M.WebPage, { address: "https://m3e.dev", load: true }))).toContain("https://m3e.dev");
    expect(words(draw(M.Animation, { file: "spin.json" }))).toContain("spin.json");
  });
});

describe("the camera's stand-in", () => {
  it("names its shutter by what it takes, the press its place's; refused, its words and no shutter", () => {
    const shutter = mock(() => {});
    press(one(draw(M.CameraStandIn, { mode: "scan", taps: { shutter } }), "Scan"));
    expect(shutter).toHaveBeenCalled();
    const els = draw(M.CameraStandIn, { state: "denied", denied: "Allow the camera" });
    expect(words(els)).toContain("Allow the camera");
    expect(byLabel(els, "Take a picture")).toHaveLength(0);
  });
});

describe("the map's stand-in", () => {
  const markers = { columns: ["Id", "Title", "Lat", "Lng"], rows: [["a", "Harbour", "31.2", "121.4"], ["b", "Old town", "31.25", "121.5"], ["c", "", "x", "1"]] };

  it("places the markers with a place, and given the choice, shows only that while it hands a tap out", () => {
    const changed = mock(() => {});
    const tapped = mock(() => {});
    let els = draw(M.MapStandIn, { markers, selected: "a", onValueChange: changed, onMarkerTap: tapped });
    expect(byLabel(els, "Harbour")).toHaveLength(1);
    expect(byLabel(els, "")).toHaveLength(0);
    expect(words(els)).toContain("Harbour");
    els = press(one(els, "Old town"));
    expect(changed).toHaveBeenCalledWith("b");
    expect(tapped).toHaveBeenCalledWith({ id: "b" });
    expect(words(els)).not.toContain("Old town");
    els = press(one(draw(M.MapStandIn, { markers }), "Old town"));
    expect(words(els)).toContain("Old town");
  });

  it("sends a long press with where it was on the map, and draws the route as a picture", () => {
    rect = { left: 10, top: 20, width: 380, height: 240 };
    const held = mock(() => {});
    const els = draw(M.MapStandIn, { testID: "m", markers, route: true, onLongPress: held, label: "Stores" });
    (byPart(els, "m")!.props.onLongPress as (e: unknown) => void)(touch(67, 56));
    expect(held).toHaveBeenCalledWith({ lat: expect.closeTo(31.25, 5), lng: expect.closeTo(121.4, 5) });
    expect(views(els).some((e) => e.type === "Image" && String(e.props.src).startsWith("data:image/svg+xml;base64,"))).toBe(true);
  });
});

describe("a grid of photos, an audio player, a marquee", () => {
  it("draws as many square cells as it says", () => {
    const els = draw(M.PhotoGrid, { testID: "g", count: 5, columns: 2 });
    const cells = views(els).filter((e) => styleOf(e).height === 0);
    expect(cells).toHaveLength(5);
    expect(styleOf(cells[0]).paddingBottom).toBe("calc((100% - 2px) / 2)");
  });

  it("an audio player shows where it is as given, and asks to play: the prop says whether it plays", () => {
    const changed = mock(() => {});
    const play = mock(() => {});
    let els = draw(M.AudioPlayer, { seconds: 200, position: 65, playing: false, onValueChange: changed, onPlay: play });
    expect(words(els)).toEqual(expect.arrayContaining(["01:05", "03:20"]));
    els = press(one(els, "Play"));
    expect(changed).toHaveBeenCalledWith(true);
    expect(play).toHaveBeenCalledWith({ position: 65 });
    expect(byLabel(els, "Play")).toHaveLength(1);
    els = press(one(draw(M.AudioPlayer, {}), "Play"));
    expect(byLabel(els, "Pause")).toHaveLength(1);
  });

  it("a marquee writes its words twice, the second hidden from a screen reader, and holds still under test", () => {
    const els = draw(M.Marquee, { text: "Breaking", seconds: 6 });
    expect(words(els).filter((w) => w === "Breaking")).toHaveLength(2);
    expect(views(els).some((e) => e.props.ariaHidden === true)).toBe(true);
    expect(views(els).some((e) => e.props.className === "m3e-marquee")).toBe(false);
    expect(views(els).find((e) => styleOf(e).animationDuration)?.props.style).toMatchObject({ animationDuration: "6s" });
  });
});

describe("a playlist", () => {
  it("asks to play a row, or to pause the one that plays; a locked row is held", () => {
    const play = mock(() => {});
    const data = { columns: ["Title", "Detail", "Length", "State"], rows: [["Welcome", "Ch 1", "03:12", "done"], ["Next", "Ch 1", "08:45", ""], ["Final", "Ch 3", "24:00", "locked"]] };
    const els = draw(M.Playlist, { title: "Course", data, selected: 1, playing: true, onPlay: play });
    expect(words(els)).toContain("1 / 3");
    press(one(els, "Next"));
    expect(play).toHaveBeenLastCalledWith({ index: 1, playing: false });
    press(one(els, "Welcome"));
    expect(play).toHaveBeenLastCalledWith({ index: 0, playing: true });
    expect(one(els, "Final").props.onClick).toBeUndefined();
  });
});

describe("a QR code", () => {
  it("draws the same symbol as the editor's encoder, UTF-8 and the version bits included", () => {
    expect(M.utf8("é🌍")).toEqual([0xc3, 0xa9, 0xf0, 0x9f, 0x8c, 0x8d]);
    expect(sig(M.qrMatrix("https://example.com", "M"))).toBe("jtvun.a5nb5.ekual.ek0nx.el1lp.a6ts1.jvfy7.1fk0.etv24.5zhk2.jkisr.h81nl.8wkbb.jeh4a.a8nej.bbkkx.d0zqs.29zs.jtn4n.a7ggq.el4hh.ejye7.el9n1.a5f3t.jvuv3");
    expect(sig(M.qrMatrix("你好，世界 🌍", "Q"))).toBe("jtocf.a5agx.ejiot.el00t.ejvj1.a703l.jvfy7.1pmo.7nqzs.bv5v5.4nnni.1wf26.4abp4.2w63f.jy46u.4p7as.io6bd.1vrt.juf6c.a5b10.ejc35.ejgce.ekmlj.a6z7g.ju7ih");
    const long = sig(M.qrMatrix("M3E Canvas ".repeat(14).slice(0, 150), "L"));
    expect(long?.startsWith("cehgjwdxb.6crf3wl6p.935ra5ie5")).toBe(true);
    expect(long?.endsWith("6dnbf7l8x.cempbtgqc")).toBe(true);
    expect(M.qrMatrix("x".repeat(300), "H")).toBeNull();
  });

  it("is a picture named by its words; too many words say so; its button copies with the platform's clipboard", async () => {
    let els = draw(M.QrCode, { text: "https://m3e.dev", copy: "Copy link", copied: "Copied" });
    expect(views(els).find((e) => e.type === "Image" && e.props.ariaLabel === "https://m3e.dev")).toBeTruthy();
    press(one(els, "Copy link"));
    await Promise.resolve();
    await Promise.resolve();
    expect(copied).toEqual(["https://m3e.dev"]);
    els = redraw();
    expect(byLabel(els, "Copied")).toHaveLength(1);
    expect(words(draw(M.QrCode, { text: "x".repeat(300), level: "H", tooLong: "Too long" }))).toContain("Too long");
  });
});

describe("a scene", () => {
  it("answers a tap on each of its places, darkens where it says, and holds what stands on it", () => {
    const door = mock(() => {});
    const els = draw(M.Scene, { scrim: "bottom", hotspots: { columns: ["Label", "x", "y", "w", "h"], rows: [["Door", "10", "20", "30", "40%"]] }, taps: { "tab:0": door } });
    const spot = one(els, "Door");
    expect(styleOf(spot)).toMatchObject({ left: "10%", top: "20%", width: "30%", height: "40%" });
    press(spot);
    expect(door).toHaveBeenCalled();
    expect(views(els).some((e) => String(styleOf(e).backgroundImage).includes("transparent 55%"))).toBe(true);
    const held = draw(M.Scene, { children: h("View", { ariaLabel: "HUD" }) });
    expect(byLabel(held, "HUD")).toHaveLength(1);
  });
});

describe("a picture viewer", () => {
  const images = [{ label: "Harbour" }, { label: "Old town" }, { label: "Market" }];

  it("moves through its pictures, handing each out and sending change; a thumbnail is its place", () => {
    const change = mock(() => {});
    const third = mock(() => {});
    let els = draw(M.ImageViewer, { images, onChange: change, taps: { "tab:2": third } });
    expect(words(els)).toContain("1 / 3");
    els = press(one(els, "Next"));
    expect(change).toHaveBeenLastCalledWith({ index: 1 });
    expect(words(els)).toContain("2 / 3");
    els = press(one(els, "Market"));
    expect(third).toHaveBeenCalled();
    expect(words(els)).toContain("3 / 3");
    const changed = mock(() => {});
    els = press(one(draw(M.ImageViewer, { images, index: 0, onValueChange: changed }), "Previous"));
    expect(changed).toHaveBeenCalledWith(2);
    expect(words(els)).toContain("1 / 3");
  });

  it("covers the page full screen, says so, and zooms there", () => {
    const full = mock(() => {});
    let els = press(one(draw(M.ImageViewer, { testID: "iv", images, onFullscreen: full }), "Full screen"));
    expect(full).toHaveBeenCalledWith({ open: true });
    expect(styleOf(byPart(els, "iv-full"))).toMatchObject({ position: "fixed" });
    els = press(one(els, "Zoom in"));
    expect(views(els).some((e) => styleOf(e).transform === "scale(1.5)")).toBe(true);
    els = press(one(els, "Close"));
    expect(full).toHaveBeenLastCalledWith({ open: false });
    expect(byPart(els, "iv-full")).toBeUndefined();
  });
});

describe("a picture cropper", () => {
  it("moves its frame under a finger, asks for the crop with the frame and the turn; done is the prop's", () => {
    rect = { left: 0, top: 0, width: 364, height: 300 };
    const crop = mock(() => {});
    let els = draw(M.ImageCropper, { testID: "ic", crop: "0.1,0.1,0.5,0.5", aspect: "free", onCrop: crop });
    const frame = byPart(els, "ic-frame")!;
    expect(frame.props.catchMove).toBe(true);
    (frame.props.onTouchStart as (e: unknown) => void)(touch(0, 0));
    (frame.props.onTouchMove as (e: unknown) => void)(touch(36.4, 0));
    els = press(one(redraw(), "Rotate"));
    press(one(els, "Done"));
    expect(crop).toHaveBeenCalledWith({ x: expect.closeTo(0.2, 5), y: 0.1, w: 0.5, h: 0.5, turn: 90 });
    expect(words(els)).not.toContain("Cropped");
    expect(words(draw(M.ImageCropper, { cropped: true, doneText: "Cropped" }))).toContain("Cropped");
  });

  it("pulls its corner keeping the aspect, and starts over with reset", () => {
    rect = { left: 0, top: 0, width: 300, height: 300 };
    let els = draw(M.ImageCropper, { testID: "ic", crop: "0.2,0.2,0.4,0.4", aspect: "1:1", width: 300, height: 300 });
    expect(byPart(els, "ic-frame")!.props.ariaLabel).toBe("Crop 120 × 120");
    const corner = views(els).find((e) => e.props.catchMove && e !== byPart(els, "ic-frame"))!;
    (corner.props.onTouchStart as (e: unknown) => void)(touch(0, 0));
    (corner.props.onTouchMove as (e: unknown) => void)(touch(30, 0));
    els = redraw();
    expect(byPart(els, "ic-frame")!.props.ariaLabel).toBe("Crop 150 × 150");
    els = press(one(els, "Reset"));
    expect(byPart(els, "ic-frame")!.props.ariaLabel).toBe("Crop 120 × 120");
    expect(M.startCrop("", "free", 380, 300)).toEqual({ x: 0.15, y: 0.15, w: 0.7, h: 0.7 });
  });
});

describe("what the parts read", () => {
  it("a table's rows, a centre, a clock, a number's marks", () => {
    expect(M.rowsOfTable({ columns: ["A"], rows: [["1", 2, null]] })).toEqual([["1", "2", ""]]);
    expect(M.rowsOfTable("no")).toEqual([]);
    expect(M.centerOf("31.2, 121.4")).toEqual({ lat: 31.2, lng: 121.4 });
    expect(M.centerOf("here")).toBeUndefined();
    expect(M.clock(3725)).toBe("01:02:05");
    expect(M.grouped(-1234567)).toBe("-1,234,567");
    expect(M.webAddress("javascript:alert(1)")).toBe("");
  });
});
