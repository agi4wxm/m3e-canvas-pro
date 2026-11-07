/* The packages an exported project names besides what its copied files import. Read by the export (exportProject.ts)
 * and by scripts/gen-versions.ts, which writes their exact versions out of this repo's lockfile. */

/** what an exported project always depends on: what its entry, its stylesheet and its components' CLI name */
export const EXPORT_ALWAYS = ["react", "react-dom", "motion", "tailwindcss", "tw-animate-css"];

/** what an exported project builds with, its devDependencies. Tailwind is a build tool there, though the stylesheet names it;
 *  so is shadcn, whose stylesheet the build reads (its CLI and that CLI's own dependencies never reach the app) */
export const EXPORT_DEV = ["@tailwindcss/vite", "@types/react", "@types/react-dom", "@vitejs/plugin-react", "shadcn", "tailwindcss", "typescript", "vite", "vite-plus"];

/** The packages a product (the monorepo export, lib/export) names that this repo does not run itself, at the exact
 *  version it pins them at. Each was checked against the npm registry when it was written here
 *  (`bun scripts/gen-versions.ts --registry` checks them again and says which have newer releases); every other package
 *  a product names is pinned at the version this repo's lockfile has, as the prototype export does.
 *
 *  - vite: plain Vite, where the editor builds with vite-plus (the product lints with ESLint and formats with Prettier).
 *  - typescript: 6.0, the last line typescript-eslint supports (its peer range is <6.1.0); the editor's 7.x has no
 *    JavaScript API for it. The copied components typecheck with it (scripts/check-product.ts).
 *  - the server's Fastify plugins and its validator (ajv with the JSON Schema 2020-12 dialect OpenAPI 3.1 uses): the
 *    newest release at least two weeks old when they were written here. */
export const PRODUCT_PINS: Record<string, string> = {
  "@eslint/js": "10.0.1",
  "@fastify/cors": "11.3.1",
  "@fastify/multipart": "10.1.6",
  "@fastify/swagger": "9.9.2",
  "@fastify/swagger-ui": "6.1.2",
  "@fastify/websocket": "11.3.4",
  /* MSW 3's own interceptors, for React Native (packages/mocks/src/native.ts): the version msw 3.0.4 resolves to */
  "@mswjs/interceptors": "0.45.11",
  "@types/node": "22.20.5",
  "@types/ws": "8.18.2",
  ajv: "8.20.0",
  "ajv-formats": "3.0.1",
  esbuild: "0.28.2",
  eslint: "10.14.0",
  "eslint-plugin-react-hooks": "7.1.1",
  "eslint-plugin-react-refresh": "0.5.7",
  fastify: "5.12.8",
  globals: "17.14.0",
  msw: "3.0.4",
  prettier: "3.9.10",
  tsx: "4.23.15",
  typescript: "6.0.3",
  "typescript-eslint": "8.72.1",
  vite: "8.3.6",
  vitest: "5.1.0",
};

/** what a product's web app builds with, beside the packages its copied files import */
export const PRODUCT_WEB_DEV = ["@tailwindcss/vite", "@types/react", "@types/react-dom", "@vitejs/plugin-react", "msw", "shadcn", "tailwindcss", "typescript", "vite", "vitest"];
