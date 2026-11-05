import { describe, expect, it } from "vitest";
import { winnerOf } from "./GameParts";

const board = (s: string) => s.replace(/\s/g, "").split("").map((c) => (c === "." ? "" : c));

describe("winnerOf", () => {
  it("finds a line across, down and on both diagonals", () => {
    expect(winnerOf(board("XXX ... ..."), 3, 3, 3)).toBe("X");
    expect(winnerOf(board("O.. O.. O.."), 3, 3, 3)).toBe("O");
    expect(winnerOf(board("X.. .X. ..X"), 3, 3, 3)).toBe("X");
    expect(winnerOf(board("..O .O. O.."), 3, 3, 3)).toBe("O");
  });
  it("finds nothing on a board with no line, or an empty one", () => {
    expect(winnerOf(board("XOX XOO OXX"), 3, 3, 3)).toBeNull();
    expect(winnerOf(board("... ... ..."), 3, 3, 3)).toBeNull();
  });
  it("does not run a line off one row onto the next", () => {
    expect(winnerOf(board("..X XX. ..."), 3, 3, 3)).toBeNull();
  });
  it("counts as many in a row as the game asks for", () => {
    expect(winnerOf(board("XXXX. ..... ..... ..... ....."), 5, 5, 5)).toBeNull();
    expect(winnerOf(board("XXXXX ..... ..... ..... ....."), 5, 5, 5)).toBe("X");
  });
});
