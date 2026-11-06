/* The packages an exported project names besides what its copied files import. Read by the export (exportProject.ts)
 * and by scripts/gen-versions.ts, which writes their exact versions out of this repo's lockfile. */

/** what an exported project always depends on: what its entry, its stylesheet and its components' CLI name */
export const EXPORT_ALWAYS = ["react", "react-dom", "motion", "tailwindcss", "tw-animate-css", "shadcn"];

/** what an exported project builds with, its devDependencies. Tailwind is a build tool there, though the stylesheet names it */
export const EXPORT_DEV = ["@tailwindcss/vite", "@types/react", "@types/react-dom", "@vitejs/plugin-react", "tailwindcss", "typescript", "vite", "vite-plus"];
