/* The kit's own lint: what the exported app's root config asks of code, every rule on the kit (it is copied into the
 * apps as it is); the documents printed into src/printed are the printer's, checked as an exported app checks them. */
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist/", "node_modules/", "shots/"]),
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ["src/**/*.{ts,tsx}", "test/**/*.ts"],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["config/**", "scripts/**", "*.config.{js,mjs}", "babel.config.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["babel.config.js", "scripts/**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  /* the printed documents: generated code, checked the way an exported app checks its src/generated */
  {
    files: ["src/printed/**", "types/**"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-namespace": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
]);
