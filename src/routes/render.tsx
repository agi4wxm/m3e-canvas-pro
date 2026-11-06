import { createFileRoute } from "@tanstack/react-router"
import { Suspense, lazy } from "react"

/* a screen drawn the way "export image" draws it and nothing else, for the MCP server's headless screenshots
 * (src/editor/RenderPage.tsx); the page itself shows nothing until the server hands it a document */
const RenderPage = lazy(() => import("../editor/RenderPage").then((m) => ({ default: m.RenderPage })))

export const Route = createFileRoute("/render")({ component: Page })

function Page() {
  return (
    <Suspense fallback={null}>
      <RenderPage />
    </Suspense>
  )
}
