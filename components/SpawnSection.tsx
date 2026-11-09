import { useContext } from "react";
import { t, useLang } from "@/lib/i18n";
import { SPAWN_DEFAULTS, SPAWN_LIMITS, spawnSpecOf, type SpawnMotion } from "@/lib/spawn";
import type { Palette } from "@/lib/tokens";
import { BehaviorContext } from "./EffectsPanel";
import { Num } from "./PartPanel";
import { Section, Select, Toggle } from "./ui";

/* On a group: whether it is a template drawn once per event (docs/交互规则.md “按事件生成”), how long each instance lives,
 * how many live at once, and how it moves. What spawns one is a Spawn effect on an event, in the effects panel. */

const MOTIONS: { key: SpawnMotion; text: "spawnFloat" | "spawnFade" | "spawnStill"; icon: string }[] = [
  { key: "float", text: "spawnFloat", icon: "arrow_upward" },
  { key: "fade", text: "spawnFade", icon: "blur_on" },
  { key: "none", text: "spawnStill", icon: "block" },
];

export function SpawnSection({ p }: { p: Palette }) {
  const lang = useLang();
  const b = useContext(BehaviorContext);
  if (!b.group || !b.patchSpawn) return null;
  const spec = b.group.spawn ? spawnSpecOf(b.group.spawn) : undefined;
  const patch = b.patchSpawn;
  return (
    <Section id="part-spawn" icon="auto_awesome" title={t("spawnSection", lang)} p={p}>
      <div data-spawn-section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Toggle on={!!spec} onChange={(on) => patch(on ? { life: SPAWN_DEFAULTS.life, max: SPAWN_DEFAULTS.max, motion: "float" } : null)} label={t("spawnOn", lang)} p={p} grow />
        {spec && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant, padding: "0 4px" }}>{t("spawnLife", lang)}</span>
              <Num value={spec.life} min={SPAWN_LIMITS.life.min} max={SPAWN_LIMITS.life.max} step={0.1} title={t("spawnLife", lang)} lazy onChange={(life) => patch({ life })} p={p} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant, padding: "0 4px" }}>{t("spawnMax", lang)}</span>
              <Num value={spec.max} min={SPAWN_LIMITS.max.min} max={SPAWN_LIMITS.max.max} title={t("spawnMax", lang)} lazy onChange={(max) => patch({ max })} p={p} />
            </div>
            <Select options={MOTIONS.map((m) => ({ key: m.key, label: t(m.text, lang), icon: m.icon }))} value={spec.motion ?? "none"} onChange={(motion) => patch({ motion: motion as SpawnMotion })} p={p} label={t("spawnMotion", lang)} />
          </>
        )}
        <div style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 4px", textWrap: "pretty" }}>{t("spawnHint", lang)}</div>
      </div>
    </Section>
  );
}
