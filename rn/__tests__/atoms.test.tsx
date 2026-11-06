import { fireEvent, screen } from "@testing-library/react-native";
import { Text as RNText } from "react-native";

import {
  Avatar,
  Badge,
  Box,
  Button,
  Cell,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Dot,
  Icon,
  IconButton,
  Image,
  Input,
  Kbd,
  Label,
  Link,
  LoadingIndicator,
  PageDots,
  Progress,
  Radio,
  Rating,
  Separator,
  Shape,
  Skeleton,
  Slider,
  Spacer,
  Spinner,
  Svg,
  Switch,
  Text,
  Textarea,
  Toggle,
  TypingIndicator,
} from "../src/kit";
import { THEMES } from "../src/gallery/themes.generated";
import { draw, MATERIAL_THEME, styleOf } from "./helpers";

/* Every atom, drawn from its props: what it says, how it is laid out, what a tap does, and how a style builds it. */

const colors = MATERIAL_THEME.light.colors;

describe("box", () => {
  it("lays out what it holds in a row with its gap and padding, on its surface", async () => {
    await draw(
      <Box testID="b" surface="card" layout="row" gap={12} padX={16} padY={8} align="center" justify="between">
        <Text text="One" fit="auto" />
        <Text text="Two" fit="auto" />
      </Box>,
    );
    const s = styleOf(screen.getByTestId("b"));
    expect(s).toMatchObject({ flexDirection: "row", columnGap: 12, paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, alignItems: "center", justifyContent: "space-between", backgroundColor: colors["surface-container-low"] });
    expect(screen.getByText("One")).toBeTruthy();
    expect(screen.getByText("Two")).toBeTruthy();
  });

  it("takes each side's padding over the pair when it is set, and wraps a row with a gap between lines", async () => {
    await draw(
      <Box testID="b" layout="row" wrap gap={8} gapY={4} padX={10} padY={10} padTop={2}>
        <Text text="A" />
      </Box>,
    );
    expect(styleOf(screen.getByTestId("b"))).toMatchObject({ flexWrap: "wrap", columnGap: 8, rowGap: 4, paddingTop: 2, paddingBottom: 10 });
  });

  it("keeps its own size while it holds nothing, and hugs what it holds once it does", async () => {
    await draw(<Box testID="empty" width={160} height={96} />);
    expect(styleOf(screen.getByTestId("empty"))).toMatchObject({ width: 160, height: 96 });
    await draw(
      <Box testID="full" width={160} height={96}>
        <Text text="x" />
      </Box>,
    );
    const s = styleOf(screen.getByTestId("full"));
    expect(s.width).toBeUndefined();
    expect(s.height).toBeUndefined();
  });

  it("keeps its size on an axis it does not hug", async () => {
    await draw(
      <Box testID="b" hugWidth={false} width={200}>
        <Text text="x" />
      </Box>,
    );
    expect(styleOf(screen.getByTestId("b")).width).toBe(200);
  });

  it("lays a grid out as rows of its columns", async () => {
    await draw(
      <Box testID="g" layout="grid" columns={2} gap={4}>
        <Text text="1" />
        <Text text="2" />
        <Text text="3" />
      </Box>,
    );
    expect(screen.getByText("3")).toBeTruthy();
    const rows = screen.getByTestId("g").children.filter((c) => typeof c !== "string" && styleOf(c).flexDirection === "row");
    expect(rows).toHaveLength(2);
  });

  it("gives a part in a cell the room the layout asks for", async () => {
    await draw(
      <Box layout="row">
        <Cell dir="row" grow minW={40}>
          <Button testID="btn" label="Go" />
        </Cell>
      </Box>,
    );
    expect(styleOf(screen.getByTestId("btn"))).toMatchObject({ width: "100%" });
  });

  it("is a button when its surface is one, its words in the on-color", async () => {
    const tap = jest.fn();
    await draw(
      <Box testID="b" surface="button" onPress={tap}>
        <Text text="Buy" />
      </Box>,
    );
    expect(styleOf(screen.getByText("Buy")).color).toBe(colors["on-primary"]);
    await fireEvent.press(screen.getByTestId("b"));
    expect(tap).toHaveBeenCalled();
  });

  it("wears a fill, corners and effects", async () => {
    await draw(<Box testID="b" fill="primaryContainer" corners={{ tl: 1, tr: 2, br: 3, bl: 4 }} look={{ opacity: 50, rotate: 10, shadows: [{ x: 0, y: 2, blur: 4, spread: 0, color: "#000000" }], stroke: { width: 2, color: "primary" } }} />);
    expect(styleOf(screen.getByTestId("b"))).toMatchObject({ backgroundColor: colors["primary-container"], borderTopLeftRadius: 1, borderBottomLeftRadius: 4, opacity: 0.5, transform: [{ rotate: "10deg" }], boxShadow: "0px 2px 4px 0px #000000", outlineWidth: 2, outlineOffset: -2, outlineColor: colors.primary });
  });
});

describe("words", () => {
  it("sets its type role, color, alignment and line limit", async () => {
    await draw(<Text text="Hello" styleVariant="title" color="muted" align="center" maxLines={2} bold />);
    const t = screen.getByText("Hello");
    expect(styleOf(t)).toMatchObject({ fontSize: 22, lineHeight: 28, fontWeight: "700", color: colors["on-surface-variant"], textAlign: "center", width: 280 });
    expect(t.props.numberOfLines).toBe(2);
  });

  it("hugs its words on one line per line when it hugs", async () => {
    await draw(<Text text={"a\nb"} fit="auto" />);
    const t = screen.getByText("a\nb");
    expect(t.props.numberOfLines).toBe(2);
    expect(styleOf(t).width).toBeUndefined();
  });

  it("takes the look's words", async () => {
    await draw(<Text text="Big" look={{ text: { size: 40, weight: 800, case: "upper", italic: true, color: "#ff0000" } }} />);
    expect(styleOf(screen.getByText("Big"))).toMatchObject({ fontSize: 40, fontWeight: "800", textTransform: "uppercase", fontStyle: "italic", color: "#ff0000" });
  });

  it("reads in the on-color of a fill around it", async () => {
    await draw(
      <Box fill="primary">
        <Text text="On" />
      </Box>,
    );
    expect(styleOf(screen.getByText("On")).color).toBe(colors["on-primary"]);
  });

  it("reads the style's own accent for words where its fill would not read", async () => {
    await draw(<Text text="Link" color="primary" />, THEMES.wechat);
    expect(styleOf(screen.getByText("Link")).color).toBe(THEMES.wechat.light.st.primaryText);
  });
});

describe("icons and drawings", () => {
  it("draws a glyph of the family at its size and color", async () => {
    await draw(<Icon testID="i" name="home" size={32} color="primary" />);
    expect(styleOf(screen.getByTestId("i"))).toMatchObject({ width: 32, height: 32 });
    expect(screen.getByLabelText("home")).toBeTruthy();
  });

  it("leaves an empty square for a name nothing draws", async () => {
    await draw(<Icon testID="i" name="no_such_icon_at_all" size={20} />);
    expect(styleOf(screen.getByTestId("i"))).toMatchObject({ width: 20, height: 20 });
    expect(screen.getByTestId("i").children).toHaveLength(0);
  });

  it("draws a library shape, a path and cleaned markup", async () => {
    await draw(<Svg testID="s" preset="star" width={40} height={40} />);
    expect(styleOf(screen.getByTestId("s"))).toMatchObject({ width: 40, height: 40 });
    await draw(<Svg testID="p" mode="path" path="M0 0L10 10" viewBox="bad" />);
    expect(screen.getByTestId("p")).toBeTruthy();
    await draw(<Svg testID="m" mode="markup" markup={'<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'} />);
    expect(screen.getByTestId("m")).toBeTruthy();
  });

  it("draws a Material shape", async () => {
    await draw(<Shape testID="sh" name="heart" width={60} height={50} />);
    expect(styleOf(screen.getByTestId("sh"))).toMatchObject({ width: 60, height: 50 });
  });

  it("stands a placeholder in for a picture it does not have", async () => {
    await draw(<Image testID="img" alt="Cover" width={100} height={80} />);
    expect(styleOf(screen.getByTestId("img"))).toMatchObject({ width: 100, height: 80, backgroundColor: colors["surface-container-high"] });
    await draw(<Image testID="pic" src="https://example.com/a.png" alt="A" />);
    expect(screen.getByLabelText("A")).toBeTruthy();
  });

  it("draws a line and a gap of their sizes", async () => {
    await draw(<Separator testID="l" length={120} thickness={2} />);
    expect(styleOf(screen.getByTestId("l"))).toMatchObject({ width: 120, height: 2, backgroundColor: colors["outline-variant"] });
    await draw(<Separator testID="v" orientation="vertical" length={30} />);
    expect(styleOf(screen.getByTestId("v"))).toMatchObject({ width: 1, height: 30 });
    await draw(<Spacer testID="g" width={10} height={20} />);
    expect(styleOf(screen.getByTestId("g"))).toMatchObject({ width: 10, height: 20 });
  });
});

describe("buttons", () => {
  it("says its label in its variant's colors and answers a tap", async () => {
    const tap = jest.fn();
    await draw(<Button testID="b" label="Save" onPress={tap} />);
    expect(styleOf(screen.getByTestId("b"))).toMatchObject({ height: 40, backgroundColor: colors.primary, borderRadius: 20 });
    expect(styleOf(screen.getByText("Save")).color).toBe(colors["on-primary"]);
    await fireEvent.press(screen.getByTestId("b"));
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled", async () => {
    const tap = jest.fn();
    await draw(<Button testID="b" label="No" disabled onPress={tap} />);
    await fireEvent.press(screen.getByTestId("b"));
    expect(tap).not.toHaveBeenCalled();
  });

  it("takes its size and square corners", async () => {
    await draw(<Button testID="b" label="Big" size="md" shape="square" variant="outlined" />);
    expect(styleOf(screen.getByTestId("b"))).toMatchObject({ height: 56, borderRadius: 16, borderWidth: 1, borderColor: colors["outline-variant"] });
  });

  it("as a toggle, swaps its words when on", async () => {
    await draw(<Button testID="b" label="Follow" toggle onLabel="Following" />);
    await fireEvent.press(screen.getByTestId("b"));
    expect(screen.getByText("Following")).toBeTruthy();
  });

  it("follows the style: iOS's tinted button", async () => {
    await draw(<Button testID="b" label="Tinted" variant="tonal" />, THEMES.ios);
    expect(styleOf(screen.getByText("Tinted")).color).toBe(THEMES.ios.light.colors.primary);
  });

  it("an icon button names itself and answers a tap", async () => {
    const tap = jest.fn();
    await draw(<IconButton icon="add" label="Add" variant="filled" onPress={tap} />);
    await fireEvent.press(screen.getByLabelText("Add"));
    expect(tap).toHaveBeenCalled();
  });

  it("a toggle stays pressed", async () => {
    await draw(<Toggle testID="t" icon="star" variant="filled" />);
    await fireEvent.press(screen.getByTestId("t"));
    expect(styleOf(screen.getByTestId("t")).backgroundColor).toBe(colors.primary);
  });
});

describe("choices", () => {
  it("a chip row: a filter chip is chosen by a tap", async () => {
    const second = jest.fn();
    await draw(<Chip testID="c" kind="filter" items={[{ label: "All" }, { label: "Bags" }]} taps={{ "tab:1": second }} />);
    await fireEvent.press(screen.getByLabelText("Bags"));
    expect(second).toHaveBeenCalled();
    expect(styleOf(screen.getByLabelText("Bags")).backgroundColor).toBe(colors["secondary-container"]);
  });

  it("a switch turns on and off", async () => {
    await draw(<Switch label="Wi-Fi" checked={false} />);
    const s = screen.getByRole("switch");
    expect(s.props.accessibilityState.checked).toBe(false);
    await fireEvent.press(s);
    expect(screen.getByRole("switch").props.accessibilityState.checked).toBe(true);
  });

  it("a switch is iOS's on iOS", async () => {
    await draw(<Switch label="" checked />, THEMES.ios);
    const track = screen.getByRole("switch").children[0];
    expect(typeof track !== "string" && styleOf(track)).toMatchObject({ width: 51, height: 31, backgroundColor: THEMES.ios.light.st.toggleOn });
  });

  it("a check box checks", async () => {
    await draw(<Checkbox label="Terms" checked={false} />);
    await fireEvent.press(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox").props.accessibilityState.checked).toBe(true);
    await draw(<Checkbox label="Some" indeterminate />);
    expect(screen.getByRole("checkbox").props.accessibilityState.checked).toBe("mixed");
  });

  it("a radio button is chosen", async () => {
    await draw(<Radio label="A" checked={false} />);
    await fireEvent.press(screen.getByRole("radio"));
    expect(screen.getByRole("radio").props.accessibilityState.checked).toBe(true);
  });

  it("a slider holds its value", async () => {
    await draw(<Slider testID="s" value={30} />);
    expect(screen.getByRole("adjustable").props.accessibilityValue).toMatchObject({ now: 30 });
  });

  it("a rating is set by a tap", async () => {
    await draw(<Rating value={4} count={5} />);
    expect(screen.getByRole("adjustable").props.accessibilityValue).toMatchObject({ now: 4, max: 5 });
    await fireEvent.press(screen.getByLabelText("2"));
    expect(screen.getByRole("adjustable").props.accessibilityValue).toMatchObject({ now: 2 });
  });

  it("a label works its control", async () => {
    await draw(<Label text="Remember me" control="switch" />);
    expect(screen.getByText("Remember me")).toBeTruthy();
  });

  it("a link opens only a web address", async () => {
    await draw(<Link label="Docs" href="javascript:alert(1)" />);
    expect(screen.getByRole("link").props.onPress).toBeUndefined();
    await draw(<Link label="Site" href="https://example.com" />);
    expect(screen.getByRole("link").props.onPress).toBeDefined();
  });
});

describe("inputs", () => {
  it("an input takes what is typed, in the style's field", async () => {
    await draw(<Input placeholder="Email" type="email" />);
    const field = screen.getByPlaceholderText("Email");
    expect(field.props.keyboardType).toBe("email-address");
    await fireEvent.changeText(field, "a@b.c");
    expect(screen.getByDisplayValue("a@b.c")).toBeTruthy();
    expect(styleOf(field)).toMatchObject({ height: 56, borderWidth: 1, borderColor: colors.outline });
  });

  it("an input is the system grey on iOS, and bare when plain", async () => {
    await draw(<Input placeholder="Search" />, THEMES.ios);
    expect(styleOf(screen.getByPlaceholderText("Search"))).toMatchObject({ borderRadius: 10, backgroundColor: expect.stringMatching(/^#85858A/i) });
    await draw(<Input placeholder="Plain" variant="plain" />);
    expect(styleOf(screen.getByPlaceholderText("Plain")).borderWidth).toBeUndefined();
  });

  it("a password hides what is typed", async () => {
    await draw(<Input placeholder="Password" type="password" />);
    expect(screen.getByPlaceholderText("Password").props.secureTextEntry).toBe(true);
  });

  it("a text area has lines for its rows", async () => {
    await draw(<Textarea placeholder="Message" rows={4} />);
    const t = screen.getByPlaceholderText("Message");
    expect(t.props.multiline).toBe(true);
    expect(styleOf(t).minHeight).toBe(4 * 24 + 24);
  });
});

describe("indicators", () => {
  it("a badge says its word, a count or a dot", async () => {
    await draw(<Badge label="New" />);
    expect(screen.getByText("New")).toBeTruthy();
    await draw(<Badge kind="count" count={1200} />);
    expect(screen.getByText("999+")).toBeTruthy();
  });

  it("an avatar shows initials, or a group of them", async () => {
    await draw(<Avatar initials="TK" />);
    expect(screen.getByText("TK")).toBeTruthy();
    await draw(<Avatar count={3} />);
    expect(screen.getByText("EF")).toBeTruthy();
  });

  it("progress shows its value", async () => {
    await draw(<Progress value={60} label="Upload" showValue />);
    expect(screen.getByRole("progressbar").props.accessibilityValue).toMatchObject({ now: 60 });
    expect(screen.getByText("60%")).toBeTruthy();
    await draw(<CircularProgress value={70} />);
    expect(screen.getByRole("progressbar").props.accessibilityValue).toMatchObject({ now: 70 });
  });

  it("a spinner, a loading indicator, a dot, page dots, someone typing and placeholders draw", async () => {
    await draw(<Spinner testID="sp" size="lg" />);
    expect(styleOf(screen.getByTestId("sp"))).toMatchObject({ width: 48 });
    await draw(<LoadingIndicator testID="li" variant="contained" />);
    expect(styleOf(screen.getByTestId("li")).backgroundColor).toBe(colors["primary-container"]);
    await draw(<Dot testID="d" size={12} color="error" />);
    expect(styleOf(screen.getByTestId("d"))).toMatchObject({ width: 12, backgroundColor: colors.error });
    await draw(<PageDots count={5} current={2} />);
    expect(screen.getByLabelText("3 / 5")).toBeTruthy();
    await draw(<TypingIndicator label="Ana is typing" />);
    expect(screen.getByText("Ana is typing")).toBeTruthy();
    await draw(<Skeleton layout="text" lines={3} />);
    expect(screen.getByLabelText("Loading")).toBeTruthy();
    await draw(<Kbd keys={[{ label: "Ctrl" }, { label: "K" }]} caption="Search" />);
    expect(screen.getByText("Ctrl")).toBeTruthy();
    expect(screen.getByText("Search")).toBeTruthy();
  });
});

describe("the layout container", () => {
  it("says its label while it lays nothing out, and holds what it is given", async () => {
    await draw(<Container label="Section" />);
    expect(screen.getByText("Section")).toBeTruthy();
    await draw(
      <Container testID="c" layout="row" gap={4} ground="primary-container">
        <RNText>inside</RNText>
      </Container>,
    );
    expect(styleOf(screen.getByTestId("c"))).toMatchObject({ flexDirection: "row", backgroundColor: colors["primary-container"] });
    expect(screen.getByText("inside")).toBeTruthy();
  });
});
