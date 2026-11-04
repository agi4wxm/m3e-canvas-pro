import { auth } from "./auth";
import { content } from "./content";
import { desktop } from "./desktop";
import { flows } from "./flows";
import type { Template, TemplateCategory } from "./kit";
import { shop } from "./shop";
import { social } from "./social";
import { tools } from "./tools";

export { instantiate, type Template, type TemplateCategory } from "./kit";

export const TEMPLATE_CATEGORIES: TemplateCategory[] = ["flow", "auth", "shop", "social", "content", "tools", "desktop"];

export const TEMPLATES: Template[] = [...flows, ...auth, ...shop, ...social, ...content, ...tools, ...desktop];

const BY_SLUG = new Map(TEMPLATES.map((d) => [d.slug, d]));
export const templateBySlug = (slug: string) => BY_SLUG.get(slug);

/** One line per template for public/agent.md, so an agent can tell the person which to add. */
export const templateCatalog = (): string => TEMPLATES.map((d) => `- \`${d.slug}\`: ${d.name}, ${d.frame}${d.category === "flow" ? `, ${d.build().length} linked screens` : ""}`).join("\n");
