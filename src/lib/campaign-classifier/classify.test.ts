import { describe, it, expect } from "vitest";
import { classifyCampaign } from "./classify";

describe("classifyCampaign", () => {
  it("prioritizes name over date", () => {
    const result = classifyCampaign({
      name: "BF_2025",
      started_at: new Date("2025-01-01"),
      ended_at: new Date("2025-01-05"),
    });
    expect(result).toEqual({ type: "seasonal", source: "auto", matchedBy: "name" });
  });

  it("falls back to date when name gives nothing", () => {
    const result = classifyCampaign({
      name: "Evergreen Q4",
      started_at: new Date("2025-11-20"),
      ended_at: new Date("2025-12-10"),
    });
    expect(result).toEqual({ type: "seasonal", source: "auto", matchedBy: "date" });
  });

  it("falls back to evergreen default when nothing matches", () => {
    const result = classifyCampaign({
      name: "CBO - Pack3 - 530 Kč",
      started_at: new Date("2025-01-01"),
      ended_at: null,
    });
    expect(result).toEqual({ type: "evergreen", source: "auto", matchedBy: "default" });
  });

  it("handles missing dates gracefully", () => {
    const result = classifyCampaign({ name: "SALE_summer" });
    expect(result).toEqual({ type: "sale", source: "auto", matchedBy: "name" });
  });

  it("defaults to evergreen for fully empty input", () => {
    const result = classifyCampaign({ name: "" });
    expect(result).toEqual({ type: "evergreen", source: "auto", matchedBy: "default" });
  });
});
