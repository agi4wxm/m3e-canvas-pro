import { describe, expect, it } from "vitest";
import { AiHttpError } from "../lib/ai";
import { aiErrorText } from "./AiPanel";

describe("aiErrorText", () => {
  it("says in words what the author can check, by the provider's status", () => {
    expect(aiErrorText(new AiHttpError(401, "401: Incorrect API key"), "zh")).toBe("服务商拒绝了这个密钥。请检查 API 密钥和它的使用权限");
    expect(aiErrorText(new AiHttpError(403, "403: forbidden"), "en")).toBe("The provider refused the key. Check the API key and what it may access");
    expect(aiErrorText(new AiHttpError(404, "404 Not Found: The model `x` does not exist"), "zh")).toBe("找不到这个模型。请检查模型 ID 和基础 URL");
    expect(aiErrorText(new AiHttpError(429, "429: quota"), "ja")).toContain("利用枠");
    expect(aiErrorText(new AiHttpError(529, "529: Overloaded"), "ko")).toBe("제공업체가 지금 응답할 수 없습니다. 잠시 후 다시 시도하세요");
  });

  it("keeps the provider's own words for any other status", () => {
    expect(aiErrorText(new AiHttpError(400, "400 Bad Request: Unsupported parameter: 'temperature'"), "zh")).toBe("AI 请求失败: 400 Bad Request: Unsupported parameter: 'temperature'");
  });

  it("maps the codes lib/ai throws, a cut-off reply included", () => {
    expect(aiErrorText(new Error("long"), "zh")).toBe("回复过长被截断了。请减少屏幕数量再试");
    expect(aiErrorText(new Error("json"), "zh")).toBe("无法解析模型的回复");
    expect(aiErrorText(new Error("refusal"), "zh")).toBe("模型拒绝回答");
    expect(aiErrorText(new Error("svg"), "en")).toBe("The drawing came back with nothing the editor can draw");
    expect(aiErrorText(new TypeError("Failed to fetch"), "zh")).toBe("无法连接。请检查 URL、网络和服务器的 CORS 设置");
  });
});
