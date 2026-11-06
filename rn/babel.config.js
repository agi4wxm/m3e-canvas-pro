/* NativeWind compiles `className` into styles at build time; Expo's preset does the rest (and adds the worklets plugin
 * Reanimated needs). */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
  };
};
