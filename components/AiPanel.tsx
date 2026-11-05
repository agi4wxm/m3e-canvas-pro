
import { useRef } from "react";
import { Palette } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import { AiSettings, IMAGE_PROVIDERS, ImageProvider, PROVIDERS, Provider, imageSpec, providerSpec } from "@/lib/ai";

/** the message shown for a failed request, mapped from the error codes lib/ai throws */
export function aiErrorText(e: unknown, lang: ReturnType<typeof useLang>): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m === "refusal") return t("aiErrorRefusal", lang);
  if (m === "json" || m === "empty") return t("aiErrorJson", lang);
  if (m === "model") return t("aiErrorModel", lang);
  if (m === "insecure") return t("aiErrorInsecure", lang);
  if (/failed to fetch|networkerror|load failed/i.test(m)) return t("aiErrorNetwork", lang);
  return `${t("aiError", lang)}: ${m}`;
}

export type AiActionKey = "behavior" | "describe";

const BASE = import.meta.env.VITE_BASE_PATH ?? "";

const field = (p: Palette): React.CSSProperties => ({
  width: "100%",
  height: 44,
  padding: "0 14px",
  borderRadius: 22,
  border: `1px solid ${p.outlineVariant}`,
  background: p.surface,
  color: p.onSurface,
  fontSize: 13,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  outline: "none",
  boxSizing: "border-box",
});

function Input({ value, onChange, placeholder, p, type = "text", label }: { value: string; onChange: (v: string) => void; placeholder?: string; p: Palette; type?: string; label: string }) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} spellCheck={false} autoComplete="off" style={field(p)} />;
}

const Label = ({ children, p, right }: { children: React.ReactNode; p: Palette; right?: React.ReactNode }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: p.onSurfaceVariant, marginBottom: 6, padding: "0 4px" }}>
    <span style={{ flex: 1 }}>{children}</span>
    {right}
  </div>
);

/** The providers as one connected button group; each segment shows the provider's mark in the button's color. */
function ProviderGroup<K extends string>({ value, onChange, p, options }: { value: K; onChange: (k: K) => void; p: Palette; options: { key: K; label: string }[] }) {
  const n = options.length;
  const ref = useRef<HTMLDivElement>(null);
  const move = (from: number, delta: number) => {
    const to = (from + delta + n) % n;
    onChange(options[to].key);
    (ref.current?.children[to] as HTMLElement | undefined)?.focus();
  };
  return (
    <div ref={ref} role="radiogroup" style={{ display: "flex", gap: 3 }}>
      {options.map((pr, i) => {
        const on = pr.key === value;
        const outer = 22;
        const inner = 8;
        const l = i === 0 ? outer : inner;
        const r = i === n - 1 ? outer : inner;
        return (
          <button
            key={pr.key}
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={pr.label}
            aria-label={pr.label}
            onClick={() => onChange(pr.key)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className="m3-press"
            style={{
              flex: 1,
              height: 44,
              border: "none",
              borderRadius: `${l}px ${r}px ${r}px ${l}px`,
              background: on ? p.primary : p.surfaceContainerHigh,
              color: on ? p.onPrimary : p.onSurfaceVariant,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              transition: "background 160ms, color 160ms",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                display: "block",
                background: "currentColor",
                WebkitMaskImage: `url(${BASE}/logos/${pr.key}.svg)`,
                maskImage: `url(${BASE}/logos/${pr.key}.svg)`,
                WebkitMaskSize: "contain",
                maskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

/** The AI tab of the left rail: the provider settings. The actions live with each screen on the right. */
export function AiPanel({ p, settings, onSettings }: { p: Palette; settings: AiSettings; onSettings: (s: AiSettings) => void }) {
  const lang = useLang();
  const spec = providerSpec(settings.provider);
  const image = imageSpec(settings.imageProvider);
  const pick = (k: Provider) => {
    const s = providerSpec(k);
    onSettings({ ...settings, provider: k, baseUrl: s.baseUrl, model: s.model });
  };
  return (
    <div className="no-scrollbar" style={{ height: "100%", overflowY: "auto", padding: "12px 12px 20px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: p.onSurfaceVariant, padding: "8px 6px 12px" }}>{t("aiSettings", lang)}</div>
      <div style={{ padding: "0 4px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <Label p={p}>{t("aiProvider", lang)}</Label>
            <ProviderGroup<Provider> value={settings.provider} onChange={pick} p={p} options={PROVIDERS} />
          </div>
          <div>
            <Label p={p}>{t("aiModel", lang)}</Label>
            <Input label={t("aiModel", lang)} value={settings.model} onChange={(model) => onSettings({ ...settings, model })} placeholder={spec.model || "model"} p={p} />
          </div>
          <div>
            <Label p={p}>{t("aiBaseUrl", lang)}</Label>
            <Input label={t("aiBaseUrl", lang)} value={settings.baseUrl} onChange={(baseUrl) => onSettings({ ...settings, baseUrl })} placeholder={spec.baseUrl} p={p} />
          </div>
          <div>
            <Label
              p={p}
              right={
                spec.keysUrl && (
                  <a href={spec.keysUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: p.primary }}>
                    {t("aiGetKey", lang)}
                  </a>
                )
              }
            >
              {t("aiKey", lang)}
            </Label>
            <Input label={t("aiKey", lang)} value={settings.key} onChange={(key) => onSettings({ ...settings, key })} placeholder="sk-…" p={p} type="password" />
            <div style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, marginTop: 8, padding: "0 4px" }}>{t("aiKeyHint", lang)}</div>
          </div>
        </div>
        <div data-image-settings style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: p.onSurfaceVariant, padding: "0 4px" }}>{t("aiImageSettings", lang)}</div>
          <ProviderGroup<ImageProvider> value={image.key} onChange={(imageProvider) => onSettings({ ...settings, imageProvider, imageBaseUrl: undefined, imageModel: undefined })} p={p} options={IMAGE_PROVIDERS} />
          <div>
            <Label p={p}>{t("aiModel", lang)}</Label>
            <Input label={`${t("aiImageSettings", lang)} ${t("aiModel", lang)}`} value={settings.imageModel ?? image.model} onChange={(imageModel) => onSettings({ ...settings, imageModel })} placeholder={image.model} p={p} />
          </div>
          <div>
            <Label p={p}>{t("aiBaseUrl", lang)}</Label>
            <Input label={`${t("aiImageSettings", lang)} ${t("aiBaseUrl", lang)}`} value={settings.imageBaseUrl ?? image.baseUrl} onChange={(imageBaseUrl) => onSettings({ ...settings, imageBaseUrl })} placeholder={image.baseUrl} p={p} />
          </div>
          <div>
            <Label
              p={p}
              right={
                <a href={image.keysUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: p.primary }}>
                  {t("aiGetKey", lang)}
                </a>
              }
            >
              {t("aiKey", lang)}
            </Label>
            <Input label={`${t("aiImageSettings", lang)} ${t("aiKey", lang)}`} value={settings.imageKey ?? ""} onChange={(imageKey) => onSettings({ ...settings, imageKey })} placeholder="sk-…" p={p} type="password" />
            <div style={{ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, marginTop: 8, padding: "0 4px" }}>{t("aiImageHint", lang)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
