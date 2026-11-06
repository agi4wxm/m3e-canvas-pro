import { createFileRoute } from "@tanstack/react-router"
import { Suspense, lazy } from "react"
import type { GallerySearch } from "@/components/Gallery"

/* every part under one style, for looking at a style and fixing it: /gallery?style=ios&dark=0&category=Navigation&lang=zh
 * (`kits=1`: the kits alone, every variant, the one the style picks starred; `splits=1`: each composite that splits
 * beside the atoms it splits into). A custom style: /gallery?style=custom:… with the style as JSON in `custom`, or,
 * without it, from the document the editor keeps in this browser */
const Gallery = lazy(() => import("@/components/Gallery").then((m) => ({ default: m.Gallery })))

const text = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : undefined)
/* a custom style in the address comes as JSON, which the router may already have read as an object */
const json = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" ? JSON.stringify(v) : undefined)

export const Route = createFileRoute("/gallery")({
  validateSearch: (s: Record<string, unknown>): GallerySearch => ({
    style: text(s.style),
    dark: text(s.dark),
    category: text(s.category),
    lang: text(s.lang),
    part: text(s.part),
    kits: text(s.kits),
    splits: text(s.splits),
    chosen: text(s.chosen),
    custom: json(s.custom),
  }),
  component: Page,
})

function Page() {
  const search = Route.useSearch()
  return (
    <Suspense fallback={null}>
      <Gallery search={search} />
    </Suspense>
  )
}
