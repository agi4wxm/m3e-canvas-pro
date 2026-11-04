/* The components this project draws itself, beside the shadcn M3E ones, and the file each is in. Plain
 * data: the definitions name these components without loading React. */

const FILES: Record<string, string[]> = {
  Rating: ["Rating"],
  ColorField: ["ColorField"],
  ClipboardRow: ["ClipboardRow"],
  Joystick: ["Joystick"],
  QuantityStepper: ["QuantityStepper"],
  Draws: ["Wheel", "GridWheel", "Gacha", "SlotMachine", "MoneyTree", "EggSmash"],
  Panels: ["SideTabs", "Inventory", "ItemCell", "TaskBar", "RewardTrack", "CheckIn", "FunctionButton"],
};

/** where printed code imports each widget from */
export const WIDGET_SOURCES: Record<string, string> = Object.fromEntries(Object.entries(FILES).flatMap(([file, names]) => names.map((name) => [name, `@/components/widgets/${file}`])));
