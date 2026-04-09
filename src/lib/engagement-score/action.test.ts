import { describe, it, expect } from "vitest";
import { actionLabelFromScore } from "./action";

describe("actionLabelFromScore", () => {
  it("null → insufficient_data", () => {
    expect(actionLabelFromScore(null)).toBe("insufficient_data");
  });

  it("0, 30 → weak", () => {
    expect(actionLabelFromScore(0)).toBe("weak");
    expect(actionLabelFromScore(30)).toBe("weak");
  });

  it("31, 60 → average", () => {
    expect(actionLabelFromScore(31)).toBe("average");
    expect(actionLabelFromScore(60)).toBe("average");
  });

  it("61, 80 → good", () => {
    expect(actionLabelFromScore(61)).toBe("good");
    expect(actionLabelFromScore(80)).toBe("good");
  });

  it("81, 100 → excellent", () => {
    expect(actionLabelFromScore(81)).toBe("excellent");
    expect(actionLabelFromScore(100)).toBe("excellent");
  });

  it("boundary 30.9 → weak, 31.0 → average", () => {
    expect(actionLabelFromScore(30.9)).toBe("weak");
    expect(actionLabelFromScore(31)).toBe("average");
  });
});
