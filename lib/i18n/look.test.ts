import { describe, expect, it } from "vitest";
import { COLOR_ROLES } from "../look";
import { roleName } from "./look";

describe("the names of the color roles", () => {
  it("names every role in every language, and no two alike", () => {
    for (const lang of ["ja", "zh", "ko"] as const) {
      const names = COLOR_ROLES.map((r) => roleName(r, lang));
      for (const [i, n] of names.entries()) expect(n, `${COLOR_ROLES[i]} in ${lang}`).not.toBe(COLOR_ROLES[i]);
      expect(new Set(names).size, lang).toBe(names.length);
    }
  });

  it("says them as Material does", () => {
    expect(roleName("outline", "zh")).toBe("轮廓线");
    expect(roleName("on-primary-container", "zh")).toBe("主色容器上");
    expect(roleName("on-tertiary-fixed-variant", "ko")).toBe("세 번째 색 고정 위(약하게)");
    expect(roleName("surface-container-high", "en")).toBe("Surface container high");
    expect(roleName("#ff0000", "zh")).toBe("#ff0000");
  });
});
