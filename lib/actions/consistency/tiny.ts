/* The one stand-in React of a runner's test file (tinyReact.ts): its mocks of `react` and `react/jsx-runtime` and the
 * runner itself read this same instance. */

import { createTinyReact } from "./tinyReact";

export const tiny = createTinyReact();
