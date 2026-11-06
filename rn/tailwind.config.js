/* NativeWind reads the classes the gallery and printed screens write. The kit itself is styled from the theme (src/kit/theme),
 * so a style can repaint it at run time; the classes are for layout, the way the web export writes it. */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: {} },
  plugins: [],
};
