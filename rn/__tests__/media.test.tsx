import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Animation, AudioPlayer, CameraStandIn, ExpressiveCarousel, ImageCropper, ImageViewer, MapStandIn, Marquee, NavProvider, PhotoGrid, Playlist, QrCode, registerIcons, ThemeProvider, Video, WebPage, qrMatrix } from "../src/kit";
import { keylinesOf, layoutAt, projection, startCrop, utf8, widthAt } from "../src/kit/composites/media";
import { icons as mediaIcons } from "../src/printed/media/icons";
import { SCREENS as MEDIA } from "../src/printed/media/screens";
import { theme as mediaTheme } from "../src/printed/media/theme";
import { draw, MATERIAL_THEME, styleOf } from "./helpers";

/* The media parts the kit draws natively (src/kit/composites/media.tsx): what each shows from its props, what a press
 * on each of its places sends, and that what is true (whether it plays, the marker chosen, a crop done) stays the
 * props'. The camera and the map are the stand-ins a capability view's slot draws until the product writes the real one. */

const colors = MATERIAL_THEME.light.colors;

/** a QR symbol's rows as base-36 numbers: what the editor's own encoder (parts/widgets/AppTools.tsx) draws for the same words */
const sig = (m: boolean[][] | null) => (m ? m.map((r) => parseInt(r.map((b) => (b ? 1 : 0)).join(""), 2).toString(36)).join(".") : null);

describe("an expressive carousel", () => {
  it("lays its items on M3's keylines: large, then a medium and a small one, shrinking as the track moves", () => {
    const k = keylinesOf("multi-browse", 420, 186, 8)!;
    expect(k.big).toBe(1);
    expect(k.large).toBeCloseTo(213.33, 1);
    expect(k.medium).toBeCloseTo(134.67, 1);
    expect(layoutAt(4, 0, k, 8).map((a) => Math.round(a.w))).toEqual([213, 135, 56, 0]);
    expect(widthAt(-1, k)).toBe(56);
    expect(keylinesOf("hero", 420, 186, 8)).toMatchObject({ big: 1, large: 356 });
    expect(keylinesOf("uncontained", 420, 186, 8)).toBeNull();
  });

  it("draws each slide's words, runs a slide's tap, and moves a step with a screen reader's next", async () => {
    const second = jest.fn();
    await draw(<ExpressiveCarousel width={420} slides={[{ label: "Sunrise" }, { label: "Forest" }, { label: "Ocean" }, { label: "Desert" }]} taps={{ "tab:1": second }} />);
    expect(screen.getByText("Forest")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Forest"));
    expect(second).toHaveBeenCalled();
    expect(Math.round(styleOf(screen.getByLabelText("Sunrise")).width as number)).toBe(213);
    await fireEvent(screen.getByLabelText("Sunrise"), "accessibilityAction", { nativeEvent: { actionName: "next" } });
    expect(Math.round(styleOf(screen.getByLabelText("Sunrise")).width as number)).toBe(56);
  });

  it("scrolls past items of one width when uncontained", async () => {
    await draw(<ExpressiveCarousel variant="uncontained" itemWidth={160} slides={[{ label: "A" }, { label: "B" }, { label: "C" }]} />);
    expect(styleOf(screen.getByLabelText("B")).width).toBe(160);
  });
});

describe("stand-ins for what the kit does not play", () => {
  it("a video is its frame at 16:9 with its title and time, a page its address, an animation its file", async () => {
    await draw(<Video testID="v" width={320} title="Trailer" time="00:30" src="https://example.com/a.mp4" />);
    expect(styleOf(screen.getByTestId("v"))).toMatchObject({ width: 320, height: 180 });
    expect(screen.getByText("Trailer")).toBeTruthy();
    expect(screen.getByText("00:30")).toBeTruthy();
    await draw(<WebPage address="https://m3e.dev" load />);
    expect(screen.getAllByText("https://m3e.dev").length).toBeGreaterThan(0);
    await draw(<Animation file="spin.json" />);
    expect(screen.getByText("spin.json")).toBeTruthy();
  });
});

describe("the camera's stand-in", () => {
  it("names its shutter by what it takes, and the press is its place's", async () => {
    const shutter = jest.fn();
    await draw(<CameraStandIn mode="scan" taps={{ shutter }} />);
    await fireEvent.press(screen.getByLabelText("Scan"));
    expect(shutter).toHaveBeenCalled();
    await draw(<CameraStandIn mode="video" />);
    expect(screen.getByLabelText("Record")).toBeTruthy();
  });

  it("draws the camera refused with its words, and no shutter", async () => {
    await draw(<CameraStandIn state="denied" denied="Allow the camera in Settings" />);
    expect(screen.getByText("Allow the camera in Settings")).toBeTruthy();
    expect(screen.queryByLabelText("Take a picture")).toBeNull();
  });
});

describe("the map's stand-in", () => {
  const markers = { columns: ["Id", "Title", "Lat", "Lng"], rows: [["a", "Harbour", "31.2", "121.4"], ["b", "Old town", "31.25", "121.5"], ["c", "", "nope", "1"]] };

  it("places the markers with a place by their coordinates, the north up", async () => {
    const proj = projection([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }], 100, 100);
    expect(proj.at({ lat: 1, lng: 0 })).toEqual({ x: 15, y: 15 });
    expect(proj.back(85, 85)).toEqual({ lat: expect.closeTo(0, 5), lng: expect.closeTo(1, 5) });
    await draw(<MapStandIn markers={markers} />);
    expect(screen.getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual(["Harbour", "Old town"]);
  });

  it("chooses a marker it is tapped on, hands it out and sends markerTap; given the choice, it shows only that", async () => {
    const changed = jest.fn();
    const tapped = jest.fn();
    await draw(<MapStandIn markers={markers} selected="a" onValueChange={changed} onMarkerTap={tapped} />);
    expect(screen.getByLabelText("Harbour").props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByLabelText("Old town"));
    expect(changed).toHaveBeenCalledWith("b");
    expect(tapped).toHaveBeenCalledWith({ id: "b" });
    /* the other side has not said so: the choice is still its */
    expect(screen.getByLabelText("Old town").props.accessibilityState.selected).toBe(false);
    await draw(<MapStandIn markers={markers} />);
    await fireEvent.press(screen.getByLabelText("Old town"));
    expect(screen.getByLabelText("Old town").props.accessibilityState.selected).toBe(true);
    expect(screen.getByText("Old town")).toBeTruthy();
  });

  it("sends a long press with where it was, and draws the route", async () => {
    const held = jest.fn();
    await draw(<MapStandIn markers={markers} route onLongPress={held} width={380} height={240} label="Stores" />);
    await fireEvent(screen.getByLabelText("Stores"), "longPress", { nativeEvent: { locationX: 57, locationY: 36 } });
    expect(held).toHaveBeenCalledWith({ lat: expect.closeTo(31.25, 5), lng: expect.closeTo(121.4, 5) });
  });
});

describe("a grid of photos, an audio player, a marquee", () => {
  it("draws as many square cells as it says", async () => {
    await draw(<PhotoGrid testID="g" count={5} columns={2} width={202} />);
    expect(screen.getByTestId("g").children).toHaveLength(6);
  });

  it("an audio player shows where it is as given, and asks to play: the prop says whether it plays", async () => {
    const changed = jest.fn();
    const play = jest.fn();
    await draw(<AudioPlayer title="Song" seconds={200} position={65} playing={false} onValueChange={changed} onPlay={play} />);
    expect(screen.getByText("01:05")).toBeTruthy();
    expect(screen.getByText("03:20")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Play"));
    expect(changed).toHaveBeenCalledWith(true);
    expect(play).toHaveBeenCalledWith({ position: 65 });
    expect(screen.getByLabelText("Play")).toBeTruthy();
    /* nobody takes the value: it is the player's own */
    await draw(<AudioPlayer />);
    await fireEvent.press(screen.getByLabelText("Play"));
    expect(screen.getByLabelText("Pause")).toBeTruthy();
  });

  it("a marquee writes its words twice, the second hidden from a screen reader", async () => {
    await draw(<Marquee text="Breaking" seconds={6} />);
    const lines = screen.getAllByText("Breaking", { includeHiddenElements: true });
    expect(lines).toHaveLength(2);
    expect(lines[1].props.accessibilityElementsHidden).toBe(true);
  });
});

describe("a playlist", () => {
  const data = { columns: ["Title", "Detail", "Length", "State"], rows: [["Welcome", "Ch 1", "03:12", "done"], ["Next", "Ch 1", "08:45", ""], ["Final", "Ch 3", "24:00", "locked"]] };

  it("asks to play a row, or to pause the one that plays; a locked row is held", async () => {
    const play = jest.fn();
    await draw(<Playlist title="Course" data={data} selected={1} playing onPlay={play} />);
    expect(screen.getByText("1 / 3")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Next"));
    expect(play).toHaveBeenLastCalledWith({ index: 1, playing: false });
    await fireEvent.press(screen.getByLabelText("Welcome"));
    expect(play).toHaveBeenLastCalledWith({ index: 0, playing: true });
    expect(screen.getByLabelText("Final").props.accessibilityState.disabled).toBe(true);
  });
});

describe("a QR code", () => {
  it("draws the same symbol as the editor's encoder, UTF-8 and the version bits included", () => {
    expect(utf8("é🌍")).toEqual([0xc3, 0xa9, 0xf0, 0x9f, 0x8c, 0x8d]);
    expect(sig(qrMatrix("https://example.com", "M"))).toBe("jtvun.a5nb5.ekual.ek0nx.el1lp.a6ts1.jvfy7.1fk0.etv24.5zhk2.jkisr.h81nl.8wkbb.jeh4a.a8nej.bbkkx.d0zqs.29zs.jtn4n.a7ggq.el4hh.ejye7.el9n1.a5f3t.jvuv3");
    expect(sig(qrMatrix("你好，世界 🌍", "Q"))).toBe("jtocf.a5agx.ejiot.el00t.ejvj1.a703l.jvfy7.1pmo.7nqzs.bv5v5.4nnni.1wf26.4abp4.2w63f.jy46u.4p7as.io6bd.1vrt.juf6c.a5b10.ejc35.ejgce.ekmlj.a6z7g.ju7ih");
    const long = qrMatrix("M3E Canvas ".repeat(14).slice(0, 150), "L");
    expect(long).toHaveLength(45);
    expect(sig(long)?.startsWith("cehgjwdxb.6crf3wl6p.935ra5ie5")).toBe(true);
    expect(sig(long)?.endsWith("6dnbf7l8x.cempbtgqc")).toBe(true);
    expect(qrMatrix("x".repeat(300), "H")).toBeNull();
  });

  it("says when its words are too many, and copies only through the app's clipboard", async () => {
    await draw(<QrCode text={"x".repeat(300)} level="H" tooLong="Too long" />);
    expect(screen.getByText("Too long")).toBeTruthy();
    const copy = jest.fn(async () => true);
    await draw(<QrCode text="https://m3e.dev" copy="Copy link" copied="Copied" onCopy={copy} />);
    expect(screen.getByLabelText("https://m3e.dev")).toBeTruthy();
    await fireEvent.press(screen.getByText("Copy link"));
    expect(copy).toHaveBeenCalledWith("https://m3e.dev");
    expect(await screen.findByText("Copied")).toBeTruthy();
    /* the app's clipboard answered it could not (no adapter on a phone): it never says it copied */
    await draw(<QrCode text="https://m3e.dev" copy="Copy link" copied="Copied" onCopy={async () => ({ ok: false, error: { type: "not-implemented", capability: "clipboard.write" } })} />);
    await fireEvent.press(screen.getByText("Copy link"));
    await act(async () => {});
    expect(screen.queryByText("Copied")).toBeNull();
    /* nothing copies: it never says it copied */
    await draw(<QrCode text="https://m3e.dev" copy="Copy link" copied="Copied" />);
    await fireEvent.press(screen.getByText("Copy link"));
    expect(screen.queryByText("Copied")).toBeNull();
  });
});

describe("a picture viewer", () => {
  const images = [{ label: "Harbour" }, { label: "Old town" }, { label: "Market" }];

  it("moves through its pictures, handing each out and sending change; a thumbnail is its place", async () => {
    const changed = jest.fn();
    const change = jest.fn();
    const third = jest.fn();
    await draw(<ImageViewer images={images} onChange={change} taps={{ "tab:2": third }} />);
    expect(screen.getByText("1 / 3")).toBeTruthy();
    await fireEvent.press(screen.getAllByLabelText("Next")[0]);
    expect(change).toHaveBeenLastCalledWith({ index: 1 });
    expect(screen.getByText("2 / 3")).toBeTruthy();
    await fireEvent.press(screen.getAllByLabelText("Market")[0]);
    expect(third).toHaveBeenCalled();
    expect(screen.getByText("3 / 3")).toBeTruthy();
    await draw(<ImageViewer images={images} index={0} onValueChange={changed} />);
    await fireEvent.press(screen.getAllByLabelText("Previous")[0]);
    expect(changed).toHaveBeenCalledWith(2);
    expect(screen.getByText("1 / 3")).toBeTruthy();
  });

  it("opens full screen, says so, and zooms there", async () => {
    const full = jest.fn();
    await draw(<ImageViewer testID="iv" images={images} onFullscreen={full} />);
    await fireEvent.press(screen.getByLabelText("Full screen"));
    expect(full).toHaveBeenCalledWith({ open: true });
    expect(screen.getByTestId("iv-full")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Zoom in"));
    await fireEvent.press(screen.getByLabelText("Close"));
    expect(full).toHaveBeenLastCalledWith({ open: false });
  });
});

describe("a picture cropper", () => {
  it("starts centred at its aspect, or where the crop says", () => {
    expect(startCrop("", "1:1", 380, 300)).toEqual({ x: expect.closeTo(0.2237, 3), y: expect.closeTo(0.15, 5), w: expect.closeTo(0.5526, 3), h: expect.closeTo(0.7, 5) });
    expect(startCrop("0.1,0.2,0.5,0.5", "1:1", 380, 300)).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 });
    expect(startCrop("", "free", 380, 300)).toEqual({ x: 0.15, y: 0.15, w: 0.7, h: 0.7 });
  });

  it("asks for the crop with its frame and turn; whether it is done is the prop's", async () => {
    const crop = jest.fn();
    const done = jest.fn();
    await draw(<ImageCropper testID="ic" crop="0.1,0.1,0.5,0.5" aspect="free" onCrop={crop} taps={{ done }} />);
    await fireEvent.press(screen.getByLabelText("Rotate"));
    await fireEvent(screen.getByTestId("ic-frame"), "accessibilityAction", { nativeEvent: { actionName: "right" } });
    await fireEvent.press(screen.getByText("Done"));
    expect(crop).toHaveBeenCalledWith({ x: expect.closeTo(0.15, 5), y: 0.1, w: 0.5, h: 0.5, turn: 90 });
    expect(done).toHaveBeenCalled();
    expect(screen.queryByText("Cropped")).toBeNull();
    await draw(<ImageCropper cropped doneText="Cropped" />);
    expect(screen.getByText("Cropped")).toBeTruthy();
  });

  it("grows its frame for a screen reader, and starts over with reset", async () => {
    await draw(<ImageCropper testID="ic" crop="0.2,0.2,0.4,0.4" aspect="free" width={300} height={300} />);
    expect(screen.getByTestId("ic-frame").props.accessibilityValue).toEqual({ text: "120 × 120" });
    await fireEvent(screen.getByTestId("ic-frame"), "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(screen.getByTestId("ic-frame").props.accessibilityValue).toEqual({ text: "135 × 135" });
    await fireEvent.press(screen.getByText("Reset"));
    expect(screen.getByTestId("ic-frame").props.accessibilityValue).toEqual({ text: "120 × 120" });
    expect(styleOf(screen.getByTestId("ic-frame")).borderColor).toBe(colors["on-primary"]);
  });
});

/* ---------- printed: what lib/export/rn writes for a document of these parts (rn/src/printed/media) ---------- */

describe("media, printed", () => {
  it("draws every screen of them with the kit's own components, none a placeholder", async () => {
    registerIcons(mediaIcons);
    const nav = { go: jest.fn(), back: jest.fn(), open: jest.fn(), todo: jest.fn() };
    const words: Record<string, string[]> = { MediaWatch: ["Trailer", "Stores", "Doors open at six"], MediaListen: ["Morning song", "Getting started", "$1,280", "01:30"], MediaTalk: ["Today", "Which do you use?", "Ada"] };
    for (const [name, Screen] of Object.entries(MEDIA)) {
      await render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 892 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } }}>
          <ThemeProvider theme={mediaTheme} dark={false}>
            <NavProvider value={nav}>
              <Screen />
            </NavProvider>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
      expect(screen.queryAllByTestId(/^placeholder-/)).toHaveLength(0);
      for (const w of words[name] ?? []) expect(screen.getAllByText(w).length).toBeGreaterThan(0);
    }
    expect(Object.keys(MEDIA).sort()).toEqual(["MediaListen", "MediaTalk", "MediaWatch"]);
  });
});
