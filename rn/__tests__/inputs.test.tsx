import { fireEvent, screen } from "@testing-library/react-native";

import {
  Calendar,
  ColorField,
  ColorPalette,
  Combobox,
  CopyRow,
  Field,
  Form,
  InputOtp,
  ItemPicker,
  MultiSelect,
  NativeSelect,
  NumberPad,
  NumberPicker,
  PhoneInput,
  QuantityStepper,
  RegionPicker,
  RichTextEditor,
  SeatMap,
  SignaturePad,
  TagInput,
  TransferList,
  WheelPicker,
  hexOf,
  levelsOf,
  markNext,
  padNext,
  padReady,
  pickDay,
  placesOf,
  tagsOf,
  toggleSeat,
  weeksOf,
  wordsOfPlaces,
} from "../src/kit";
import { draw, MATERIAL_THEME, styleOf } from "./helpers";

/* The pickers and the entry parts (D3): each is an input whose value is its prop. Given a change handler it shows the
 * prop as given and only hands a change out (a refusal leaves it as it was); without one it keeps a draft that starts
 * over when the prop changes. Their field states and the names a screen reader reads are checked beside. */

const colors = MATERIAL_THEME.light.colors;
const accessibilityState = (node: { props: { accessibilityState?: Record<string, unknown> } }) => node.props.accessibilityState ?? {};

describe("what the inputs do with what they are given", () => {
  it("count places from 1 and back, and keep rows apart by their words", () => {
    expect(placesOf("1, 3,3,x", 5)).toEqual([0, 2]);
    expect(placesOf([0, 4], 3)).toEqual([0]);
    expect(wordsOfPlaces([2, 0])).toBe("1,3");
    expect(tagsOf("a\n\nb")).toEqual(["a", "b"]);
    expect(tagsOf([{ label: "x" }, "y"])).toEqual(["x", "y"]);
  });

  it("pick days alone, several, or a range's two ends", () => {
    expect(pickDay("single", ["2026-11-02"], "2026-11-05")).toEqual(["2026-11-05"]);
    expect(pickDay("multiple", ["2026-11-02"], "2026-11-01")).toEqual(["2026-11-01", "2026-11-02"]);
    expect(pickDay("multiple", ["2026-11-02"], "2026-11-02")).toEqual([]);
    expect(pickDay("range", ["2026-11-02"], "2026-11-05")).toEqual(["2026-11-02", "2026-11-05"]);
    expect(pickDay("range", ["2026-11-02", "2026-11-05"], "2026-11-01")).toEqual(["2026-11-01"]);
    const weeks = weeksOf(2026, 10, true);
    expect(weeks[0][0]).toMatchObject({ m: 9, d: 26, outside: true });
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("read a hex, the levels of a region, a seat, a key of the pad and a mark", () => {
    expect(hexOf("386a20")).toBe("#386a20");
    expect(hexOf("#38")).toBeUndefined();
    const rows = [
      ["A", "a1"],
      ["A", "a2"],
      ["B", "b1"],
    ];
    expect(levelsOf(rows, [])).toEqual([["A", "B"], []]);
    expect(levelsOf(rows, ["A"])).toEqual([["A", "B"], ["a1", "a2"]]);
    expect(toggleSeat(["A1", "A2"], "A3", 2)).toEqual(["A1", "A2"]);
    expect(toggleSeat(["A1", "A2"], "A1", 2)).toEqual(["A2"]);
    expect(padNext("amount", 6, "1.2", "5")).toBe("1.25");
    expect(padNext("amount", 6, "1.25", "5")).toBe("1.25");
    expect(padNext("pin", 4, "1234", "5")).toBe("1234");
    expect(padReady("pin", 4, "123")).toBe(false);
    expect(markNext(["bold", "bullets"], "numbers")).toEqual(["bold", "numbers"]);
    expect(markNext(["bold"], "clear")).toEqual([]);
  });
});

describe("the pickers", () => {
  it("a native select lists its options over the screen and hands the one chosen out", async () => {
    const onSelect = jest.fn();
    await draw(<NativeSelect items={[{ label: "One" }, { label: "Two" }]} selected={0} onSelect={onSelect} ariaLabel="Count" required />);
    expect(screen.getByRole("combobox", { name: "Count *" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("combobox"));
    await fireEvent.press(screen.getByRole("menuitem", { name: "Two" }));
    expect(onSelect).toHaveBeenCalledWith(1, "Two");
    /* the form did not take it: what it shows is still what it is given */
    expect(screen.getByRole("combobox").props.accessibilityValue).toEqual({ text: "One" });
  });

  it("a combobox finds an option as it is typed, says when none matches, and clears", async () => {
    await draw(<Combobox items={[{ label: "Astro" }, { label: "Remix" }]} placeholder="Pick" clear />);
    await fireEvent.press(screen.getByRole("combobox", { name: "Pick" }));
    await fireEvent.changeText(screen.getByPlaceholderText("Pick"), "rem");
    expect(screen.queryByRole("menuitem", { name: "Astro" })).toBeNull();
    await fireEvent.press(screen.getByRole("menuitem", { name: "Remix" }));
    expect(screen.getByText("Remix")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Clear"));
    expect(screen.getByText("Pick")).toBeTruthy();
  });

  it("a calendar picks a range, its days between on a band, and hands the ends out", async () => {
    const onChange = jest.fn();
    await draw(<Calendar mode="range" month="2026-03" value="2026-03-02" onChange={onChange} />);
    expect(screen.getByText("March 2026")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("2026-03-05"));
    expect(onChange).toHaveBeenCalledWith("2026-03-02,2026-03-05");
    await draw(<Calendar mode="range" month="2026-03" value="2026-03-02,2026-03-05" />);
    expect(accessibilityState(screen.getByLabelText("2026-03-04")).selected).toBe(true);
    expect(styleOf(screen.getByLabelText("2026-03-02")).backgroundColor).toBe(colors.primary);
    await fireEvent.press(screen.getByLabelText("Next month"));
    expect(screen.getByText("April 2026")).toBeTruthy();
  });

  it("a calendar held read-only picks nothing, and leaves out the days of other months when told", async () => {
    const onChange = jest.fn();
    await draw(<Calendar month="2026-03" outside={false} readOnly onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText("2026-03-05"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("2026-02-28")).toBeNull();
  });

  it("a color field hands out a color once what is typed is one, and shows its own while nobody takes it", async () => {
    const onChangeText = jest.fn();
    await draw(<ColorField label="Accent" value="#6750A4" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText("Accent"), "#38");
    expect(onChangeText).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Accent"), "#386A20");
    expect(onChangeText).toHaveBeenCalledWith("#386a20");
    await draw(<ColorField label="Accent" value="#6750A4" />);
    await fireEvent.changeText(screen.getByLabelText("Accent"), "386A20");
    expect(screen.getByLabelText("#386A20")).toBeTruthy();
  });

  it("a wheel turns to the option tapped, and a screen reader turns it a step", async () => {
    const onSelect = jest.fn();
    await draw(<WheelPicker label="Minutes" items={[{ label: "5" }, { label: "10" }, { label: "15" }]} selected={0} onSelect={onSelect} />);
    await fireEvent.press(screen.getByText("15"));
    expect(onSelect).toHaveBeenLastCalledWith(2, "15");
    await fireEvent(screen.getByRole("adjustable"), "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(onSelect).toHaveBeenLastCalledWith(1, "10");
  });

  it("an item picker, a palette and several choices hand out what is picked", async () => {
    const item = jest.fn();
    await draw(<ItemPicker items={[{ label: "Home", icon: "home" }, { label: "Work", icon: "work" }]} selected={0} onSelect={item} ariaLabel="Place" />);
    await fireEvent.press(screen.getByRole("radio", { name: "Work" }));
    expect(item).toHaveBeenCalledWith(1, "Work");
    expect(accessibilityState(screen.getByRole("radio", { name: "Home" })).checked).toBe(true);
    const swatch = jest.fn();
    await draw(<ColorPalette colors="#6750A4,nope,#386A20" selected={0} onSelect={swatch} />);
    expect(screen.queryByLabelText("nope")).toBeNull();
    await fireEvent.press(screen.getByRole("radio", { name: "#386A20" }));
    expect(swatch).toHaveBeenCalledWith(2, "#386A20");
    await draw(<MultiSelect items={[{ label: "Email" }, { label: "Push" }, { label: "SMS" }]} selected="1" />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "SMS" }));
    expect(accessibilityState(screen.getByRole("checkbox", { name: "SMS" })).checked).toBe(true);
    expect(accessibilityState(screen.getByRole("checkbox", { name: "Email" })).checked).toBe(true);
  });

  it("several choices start over from what they are given when that changes", async () => {
    const view = await draw(<MultiSelect items={[{ label: "A" }, { label: "B" }]} selected="1" />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "B" }));
    expect(accessibilityState(screen.getByRole("checkbox", { name: "B" })).checked).toBe(true);
    await view.rerender(<MultiSelect items={[{ label: "A" }, { label: "B" }]} selected="" />);
    expect(accessibilityState(screen.getByRole("checkbox", { name: "B" })).checked).toBe(false);
  });

  it("a number picker steps inside its range", async () => {
    const onValueChange = jest.fn();
    await draw(<NumberPicker value={10} min={0} max={10} onValueChange={onValueChange} />);
    expect(accessibilityState(screen.getByLabelText("Increase")).disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText("Decrease"));
    expect(onValueChange).toHaveBeenCalledWith(9);
  });

  it("a transfer list moves the rows ticked, and hands the right side out", async () => {
    const onChangeText = jest.fn();
    await draw(<TransferList items={[{ label: "View" }, { label: "Edit" }, { label: "Bill" }]} chosen="3" from="Available" to="Granted" onChangeText={onChangeText} />);
    expect(screen.getByText("0 / 2")).toBeTruthy();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Edit" }));
    expect(screen.getByText("1 / 2")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Move right"));
    expect(onChangeText).toHaveBeenCalledWith("3,2");
  });

  it("a region picker opens a level once the one above is picked, and its button once the last is", async () => {
    const confirm = jest.fn();
    const data = { columns: ["P", "C"], rows: [["Zhejiang", "Hangzhou"], ["Zhejiang", "Ningbo"], ["Beijing", "Beijing"]] };
    await draw(<RegionPicker label="Area" placeholder="Choose" data={data} action="Confirm" taps={{ confirm }} />);
    expect(screen.getByText("Choose")).toBeTruthy();
    expect(screen.queryByLabelText("Ningbo")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Zhejiang"));
    await fireEvent.press(screen.getByLabelText("Ningbo"));
    expect(screen.getByText("Zhejiang / Ningbo")).toBeTruthy();
    await fireEvent.press(screen.getByText("Confirm"));
    expect(confirm).toHaveBeenCalled();
  });

  it("a seat map holds the taken seats, picks at most so many, and shows the total only as given", async () => {
    const onChangeText = jest.fn();
    await draw(<SeatMap rows={2} columns={3} taken="A2" most={1} picked="B1" price={45} currency="$" onChangeText={onChangeText} />);
    expect(accessibilityState(screen.getByLabelText("A2")).disabled).toBe(true);
    expect(screen.queryByText("$45")).toBeNull();
    await fireEvent.press(screen.getByLabelText("A3"));
    expect(onChangeText).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("B1"));
    expect(onChangeText).toHaveBeenCalledWith("");
    await draw(<SeatMap rows={2} columns={3} picked="B1" total="$45" />);
    expect(screen.getByText("$45")).toBeTruthy();
  });

  it("show their field states: disabled, its error's message, a spinner while it loads", async () => {
    const onSelect = jest.fn();
    await draw(<ItemPicker items={[{ label: "Home" }, { label: "Work" }]} disabled onSelect={onSelect} error errorText="Pick one" loading />);
    await fireEvent.press(screen.getByRole("radio", { name: "Work" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText("Pick one")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("the entry parts", () => {
  it("a code fills its boxes as it is typed", async () => {
    const onChangeText = jest.fn();
    await draw(<InputOtp length={4} group={2} value="12" onChangeText={onChangeText} />);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Verification code"), "12345");
    expect(onChangeText).toHaveBeenCalledWith("1234");
  });

  it("a field: its label starred while required, its words, its error in their place", async () => {
    await draw(<Field label="Email" helperText="Never shared" required />);
    expect(screen.getByText("Email *")).toBeTruthy();
    expect(screen.getByText("Never shared")).toBeTruthy();
    await draw(<Field label="Terms" control="switch" errorText="Accept them" />);
    expect(screen.getByRole("switch", { name: "Terms" })).toBeTruthy();
    expect(screen.getByRole("alert").props.children).toBe("Accept them");
  });

  it("a form lays out its fields and runs its tap from its button", async () => {
    const onPress = jest.fn();
    await draw(<Form fields={[{ label: "Name" }, { label: "Role" }]} submit="Send" onPress={onPress} />);
    expect(screen.getByLabelText("Role")).toBeTruthy();
    await fireEvent.press(screen.getByText("Send"));
    expect(onPress).toHaveBeenCalled();
  });

  it("a copy row hands its words to what copies them and says it did", async () => {
    const onCopy = jest.fn(() => Promise.resolve());
    await draw(<CopyRow text="npm run deploy" onCopy={onCopy} />);
    await fireEvent.press(screen.getByLabelText("Copy"));
    expect(onCopy).toHaveBeenCalledWith("npm run deploy");
    expect(await screen.findByLabelText("Copied")).toBeTruthy();
  });

  it("a copy row says it copied only on a real success: not for a capability that answered it could not", async () => {
    /* the app's clipboard.write with no adapter on a phone answers not-implemented, an outcome that is not ok */
    const notImplemented = jest.fn(async () => ({ ok: false, error: { type: "not-implemented", capability: "clipboard.write" } }));
    await draw(<CopyRow text="npm run deploy" onCopy={notImplemented} />);
    await fireEvent.press(screen.getByLabelText("Copy"));
    expect(await screen.findByLabelText("Not copied")).toBeTruthy();
    expect(screen.queryByLabelText("Copied")).toBeNull();
    await draw(<CopyRow text="npm run deploy" onCopy={async () => false} />);
    await fireEvent.press(screen.getByLabelText("Copy"));
    expect(await screen.findByLabelText("Not copied")).toBeTruthy();
    await draw(<CopyRow text="npm run deploy" onCopy={async () => ({ ok: true, result: {} })} />);
    await fireEvent.press(screen.getByLabelText("Copy"));
    expect(await screen.findByLabelText("Copied")).toBeTruthy();
  });

  it("a quantity steps inside its range, each step a place of its own", async () => {
    const inc = jest.fn();
    const onValueChange = jest.fn();
    await draw(<QuantityStepper value={2} max={2} taps={{ inc }} onValueChange={onValueChange} />);
    expect(accessibilityState(screen.getByLabelText("Increase")).disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText("Decrease"));
    expect(onValueChange).toHaveBeenCalledWith(1);
    await fireEvent(screen.getByRole("adjustable"), "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(inc).toHaveBeenCalled();
  });

  it("tags: one typed is added when sent, one taken away by its button, each said", async () => {
    const onChange = jest.fn();
    const onAdd = jest.fn();
    const onRemove = jest.fn();
    await draw(<TagInput items={"Design\nPrototype"} placeholder="Add a tag" onChange={onChange} onAdd={onAdd} onRemove={onRemove} />);
    await fireEvent.changeText(screen.getByLabelText("Add a tag"), "Ship");
    await fireEvent(screen.getByLabelText("Add a tag"), "submitEditing");
    expect(onChange).toHaveBeenLastCalledWith(["Design", "Prototype", "Ship"]);
    expect(onAdd).toHaveBeenCalledWith("Ship");
    await fireEvent.press(screen.getByLabelText("Remove Design"));
    expect(onRemove).toHaveBeenCalledWith("Design");
  });

  it("a phone number has its code before it and the phone's keypad", async () => {
    await draw(<PhoneInput code="+86" placeholder="Phone number" required />);
    expect(screen.getByText("+86 *")).toBeTruthy();
    expect(screen.getByLabelText("Phone number *").props.keyboardType).toBe("phone-pad");
  });

  it("a number pad types, confirms with what is typed, and says sent only as it is given", async () => {
    const onSubmit = jest.fn();
    const confirm = jest.fn();
    await draw(<NumberPad mode="amount" prefix="$" action="Pay" done="Sent" onSubmit={onSubmit} taps={{ confirm }} />);
    expect(accessibilityState(screen.getByText("Pay")).disabled ?? false).toBeFalsy();
    for (const k of ["4", "2"]) await fireEvent.press(screen.getByLabelText(k));
    expect(screen.getByText("$42")).toBeTruthy();
    await fireEvent.press(screen.getByText("Pay"));
    expect(onSubmit).toHaveBeenCalledWith("42");
    expect(confirm).toHaveBeenCalled();
    expect(screen.queryByText("Sent")).toBeNull();
    await draw(<NumberPad mode="amount" action="Pay" done="Sent" value="42" sent />);
    expect(screen.getByText("Sent")).toBeTruthy();
  });

  it("a signature pad draws a stroke and hands it out, and clears only by its own button", async () => {
    const onChangeText = jest.fn();
    const clear = jest.fn();
    const onPress = jest.fn();
    await draw(<SignaturePad hint="Sign here" clear="Clear" action="Done" onChangeText={onChangeText} taps={{ clear }} onPress={onPress} />);
    const pad = screen.getByLabelText("Sign here");
    const at = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y, pageX: x, pageY: y, touches: [], changedTouches: [] }, touchHistory: { touchBank: [] } });
    await fireEvent(pad, "responderGrant", at(10, 20));
    await fireEvent(pad, "responderMove", at(30, 40));
    await fireEvent(pad, "responderRelease", at(30, 40));
    expect(onChangeText).toHaveBeenCalledWith(expect.stringMatching(/^M10\.0 20\.0 L10\.0 20\.0/));
    await draw(<SignaturePad hint="Sign here" clear="Clear" action="Done" value="M1 1 L2 2" taps={{ clear }} onPress={onPress} />);
    await fireEvent.press(screen.getByText("Clear"));
    expect(clear).toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByText("Sign here")).toBeTruthy();
  });

  it("words with a toolbar: the words are the value, a mark is their look, the count follows", async () => {
    const onChangeText = jest.fn();
    await draw(<RichTextEditor text="Hello" placeholder="Write" onChangeText={onChangeText} />);
    expect(screen.getByText("5")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Bold"));
    expect(accessibilityState(screen.getByLabelText("Bold")).selected).toBe(true);
    expect(styleOf(screen.getByLabelText("Write")).fontWeight).toBe("700");
    await fireEvent.changeText(screen.getByLabelText("Write"), "Hello there");
    expect(onChangeText).toHaveBeenCalledWith("Hello there");
  });
});
