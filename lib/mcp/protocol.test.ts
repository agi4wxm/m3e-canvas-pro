import { describe, expect, it } from "vitest";
import { editorOrigin, loopbackHost, pairingCode, parseMsg } from "./protocol";

describe("the live bridge's rules", () => {
  it("lets in the editor served on this machine, and origins it was told about", () => {
    for (const o of ["http://localhost:3000", "http://127.0.0.1:3004", "http://[::1]:4173", "http://LOCALHOST:5173/", "http://127.0.0.1:4183"]) expect(editorOrigin(o), o).toBe(true);
    for (const o of [undefined, "", "null", "https://localhost:3000", "http://localhost:8080", "http://localhost", "http://evil.example:3000", "http://127.0.0.1.evil.example:3000", "file://", "chrome-extension://abc"]) expect(editorOrigin(o), String(o)).toBe(false);
    expect(editorOrigin("https://canvas.example.com", ["https://canvas.example.com/"])).toBe(true);
    expect(editorOrigin("https://canvas.example.com.evil.example", ["https://canvas.example.com"])).toBe(false);
  });

  it("takes only a Host that names this machine at the port", () => {
    expect(loopbackHost("127.0.0.1:47831", 47831)).toBe(true);
    expect(loopbackHost("localhost:47831", 47831)).toBe(true);
    expect(loopbackHost("[::1]:47831", 47831)).toBe(true);
    expect(loopbackHost("localhost:47832", 47831)).toBe(false);
    expect(loopbackHost("rebound.example:47831", 47831)).toBe(false);
    expect(loopbackHost(undefined, 47831)).toBe(false);
  });

  it("makes six-digit codes and reads only messages", () => {
    let n = 0;
    expect(pairingCode(() => n++ % 10)).toBe("012-345");
    expect(parseMsg('{"t":"hello"}')).toEqual({ t: "hello" });
    expect(parseMsg("not json")).toBeNull();
    expect(parseMsg('{"x":1}')).toBeNull();
  });
});
