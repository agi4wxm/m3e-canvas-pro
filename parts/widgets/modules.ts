/* Where each file of widgets in sources.ts is fetched from. Each is a chunk of its own, fetched the first time a part
 * on screen draws one of its widgets (parts/components.ts), so a document without a game pays nothing for the games. */

export const WIDGET_MODULES: Record<string, () => Promise<Record<string, unknown>>> = {
  Rating: () => import("./Rating"),
  FieldFrame: () => import("./FieldFrame"),
  ColorField: () => import("./ColorField"),
  ClipboardRow: () => import("./ClipboardRow"),
  Joystick: () => import("./Joystick"),
  QuantityStepper: () => import("./QuantityStepper"),
  Draws: () => import("./Draws"),
  Panels: () => import("./Panels"),
  Inputs: () => import("./Inputs"),
  Content: () => import("./Content"),
  Motion: () => import("./Motion"),
  AppParts: () => import("./AppParts"),
  AppTools: () => import("./AppTools"),
  AppMore: () => import("./AppMore"),
  GameParts: () => import("./GameParts"),
  Scene: () => import("./Scene"),
};
