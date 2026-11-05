import { createFileRoute } from "@tanstack/react-router"
import { Suspense, lazy } from "react"
import type { GallerySearch } from "@/components/Gallery"

/* every part under one style, for looking at a style and fixing it: /gallery?style=ios&dark=0&category=Navigation&lang=zh */
const Gallery = lazy(() => import("@/components/Gallery").then((m) => ({ default: m.Gallery })))

const text = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : undefined)

export const Route = createFileRoute("/gallery")({
  validateSearch: (s: Record<string, unknown>): GallerySearch => ({
    style: text(s.style),
    dark: text(s.dark),
    category: text(s.category),
    lang: text(s.lang),
    part: text(s.part),
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
