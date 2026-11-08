/* Expo's flat config; the generated data and the build output are not linted. */
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "node_modules/*", ".expo/*", "shots/*"],
  },
  /* the exported app's own files (src/app): the packages it installs that the kit does not are declared in types/app.d.ts */
  {
    files: ["src/app/**"],
    rules: { "import/no-unresolved": ["error", { ignore: ["^expo-router$", "^expo-secure-store$", "^expo-document-picker$", "^expo-image-picker$", "^@m3e/mocks$"] }] },
  },
  /* the scripts run under plain Node */
  {
    files: ["scripts/**/*.cjs", "*.config.js"],
    languageOptions: { sourceType: "commonjs", globals: { require: "readonly", module: "writable", __dirname: "readonly", process: "readonly", console: "readonly" } },
  },
]);
