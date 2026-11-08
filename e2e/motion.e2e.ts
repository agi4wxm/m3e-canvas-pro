/* The components' press feedback and reduced motion (report UI-1), in the live preview: a press grows the ripple with
 * a script animation; with the system asking for reduced motion -- switched while the page is open -- it is a still
 * layer instead and the pressed state stays. What the ripple's delayed steps do once it has gone (UI-2) is checked in
 * components/m3e/ripple.test.ts: here the preview fades out for longer than a press's minimum time. */

import { check, equal, settle, type E2ETest, type Page } from "./lib";

type Emulating = Page & { emulateMedia(o: { reducedMotion: "reduce" | "no-preference" }): Promise<void> };

/** what the Share button's press looks like now: script animations that move the ripple, its pressed mark, the control's */
const pressState = (page: Page) =>
  page.evaluate(() => {
    const button = [...document.querySelectorAll("[data-preview-screen] button")].find((b) => b.textContent?.includes("Share") && b.querySelector(':scope > [data-slot="ripple"]'));
    const press = button?.querySelector<HTMLElement>(':scope > [data-slot="ripple"] .m3-ripple');
    const moving = press?.getAnimations().filter((a) => !(a instanceof CSSTransition) && ((a.effect as KeyframeEffect | null)?.getKeyframes() ?? []).some((k) => "transform" in k)).length ?? -1;
    return { found: !!press, moving, pressed: !!press?.hasAttribute("data-pressed"), control: !!button?.hasAttribute("data-press") };
  });

export const tests: E2ETest[] = [
  {
    name: "motion: the ripple grows, and holds still under reduced motion switched while the page is open",
    async run({ page }) {
      const emulating = page as Emulating;
      await page.keyboard.press("p");
      await page.waitForSelector("[data-preview-screen]", { timeout: 10_000 });
      await settle(page, 1500);
      const share = page.locator('[data-preview-screen] button:has(> [data-slot="ripple"])').filter({ hasText: "Share" }).first();
      const b = await share.boundingBox();
      check(b, "the Share button in the preview");
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);

      const press = async () => {
        await page.mouse.down();
        await page.waitForTimeout(60);
        const down = await pressState(page);
        await page.mouse.up();
        await settle(page, 600);
        return { down, up: await pressState(page) };
      };

      let seen = await press();
      check(seen.down.found, "the ripple is there");
      equal(seen.down.moving, 1, "a press grows the ripple with a script animation");
      check(seen.down.pressed && seen.down.control, "the ripple and the control show the press");
      check(!seen.up.pressed && !seen.up.control, "and let go of it");

      await emulating.emulateMedia({ reducedMotion: "reduce" });
      seen = await press();
      equal(seen.down.moving, 0, "with reduced motion nothing grows or travels");
      check(seen.down.pressed, "the press still shows, as a still layer");
      check(seen.down.control, "the control's pressed state stays");
      check(!seen.up.pressed && !seen.up.control, "and goes on release");

      await emulating.emulateMedia({ reducedMotion: "no-preference" });
      seen = await press();
      equal(seen.down.moving, 1, "asked for motion again, it grows again");
    },
  },
];
