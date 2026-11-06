import { createFileRoute } from "@tanstack/react-router"
import { Suspense, lazy, useEffect, useState } from "react"
import { Skeleton } from "@/components/Skeleton"
import { isLang, setGlobalLang, type Lang } from "@/lib/i18n"

/** what fetches the parts' drawings (parts/prefetch.ts), once it has come */
let parts: typeof import("@/parts/prefetch") | undefined

/** whether the page is the editor's (this route), not another route the app started on */
const onEditorPage = () =>
  window.location.pathname.replace(/\/+$/, "") === (import.meta.env.VITE_BASE_PATH ?? "").replace(/\/+$/, "")

/* the components the opening document's parts are drawn with come beside the
   editor's own code, so its first frame draws the real parts, not stand-ins:
   a guess at once (parts/opening.ts), then exactly, once the part definitions
   have come */
let editorLoad: Promise<typeof import("../Editor")> | undefined
const loadEditor = () =>
  (editorLoad ??= Promise.all([
    import("../Editor"),
    /* the project the tab opens is read meanwhile (lib/projects/opening.ts), and the drawings its parts need fetched;
       only on the editor's own page: this runs wherever the app starts, and the gallery opens no project */
    Promise.all([import("@/parts/prefetch"), onEditorPage() ? import("@/lib/projects/opening") : null])
      .then(([m, projects]) => {
        parts = m
        return m.loadOpeningModules(projects?.openingDoc())
      })
      .catch(() => {}),
    import("@/parts/opening")
      .then((m) => {
        m.rememberOnLeave()
        void m.loadHeadStart()
      })
      .catch(() => {}),
  ]).then(([editor]) => editor))
/* the editor chunk starts downloading as soon as this module runs, alongside
   the document, instead of waiting for the first client render */
if (typeof window !== "undefined") void loadEditor()

/** how long the boot screen waits at most for the parts on the canvas to be drawn */
const PARTS_WAIT_MS = 4000

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/** Settles once the parts' drawings still on their way (a document from a
 *  link, what the opening fetch missed) have come, or after PARTS_WAIT_MS, and
 *  two frames more: one draws them, one has them measured and laid out. */
const partsDrawn = (p: typeof import("@/parts/prefetch")) =>
  Promise.race([p.modulesSettled(), new Promise<void>((resolve) => setTimeout(resolve, PARTS_WAIT_MS))])
    .catch(() => {})
    .then(frame)
    .then(frame)

const Editor = lazy(loadEditor)

export const Route = createFileRoute("/")({ component: Page })

/** the static shell with nothing in it, standing over the editor until the
 *  document has been read, then fading away to show the real one in its place */
function Boot({ done }: { done: boolean }) {
  return (
    <div
      className="m3e-boot"
      data-done={done ? "" : undefined}
      aria-busy={!done}
      aria-hidden={done}
    >
      <Skeleton />
    </div>
  )
}

function initialLanguage(): Lang {
  /* the page is in Chinese until someone picks another language */
  try {
    const ui = JSON.parse(localStorage.getItem("m3e:ui") ?? "null")
    if (isLang(ui?.pickedLang)) return ui.pickedLang
  } catch {}
  return "zh"
}

/** how long the overlay takes to fade; matches .m3e-boot in index.css */
const BOOT_FADE_MS = 420

function Page() {
  const [lang, setLang] = useState<Lang | null>(null)
  const [phase, setPhase] = useState<"loading" | "fading" | "done">("loading")
  useEffect(() => {
    const initialLang = initialLanguage()
    document.documentElement.lang = initialLang
    setGlobalLang(initialLang)
    setLang(initialLang)
  }, [])
  useEffect(() => {
    if (phase !== "fading") return
    const id = setTimeout(() => setPhase("done"), BOOT_FADE_MS)
    /* the editor is up: what is likely to be wanted soon may be fetched while the page is idle */
    parts?.startIdleFetching()
    return () => clearTimeout(id)
  }, [phase])
  return (
    <>
      {lang && (
        <Suspense fallback={null}>
          <Editor
            initialLang={lang}
            onReady={() => {
              /* marks for timing the start (performance.getEntriesByName) */
              performance.mark("m3e:editor-ready")
              const show = () => {
                performance.mark("m3e:editor-shown")
                setPhase((p) => (p === "loading" ? "fading" : p))
              }
              /* every part on the canvas drawn with its own components: at once */
              if (parts?.modulesPending()) void partsDrawn(parts).then(show)
              else show()
            }}
          />
        </Suspense>
      )}
      {phase !== "done" && <Boot done={phase === "fading"} />}
    </>
  )
}
