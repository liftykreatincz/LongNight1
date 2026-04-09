import { describe, it, expect } from "vitest";
import { classifyByName } from "./classify-name";

describe("classifyByName", () => {
  it("returns null for empty string", () => {
    expect(classifyByName("")).toBeNull();
  });

  it("returns null for plain campaign names", () => {
    expect(classifyByName("CBO - Pack3 - 530 Kč - L3")).toBeNull();
    expect(classifyByName("Prospecting Q1")).toBeNull();
  });

  it("detects SALE prefix case-insensitive", () => {
    expect(classifyByName("SALE_2025_winter")).toBe("sale");
    expect(classifyByName("sale_2025")).toBe("sale");
    expect(classifyByName("Sale Promotion")).toBe("sale");
  });

  it("detects SLEVA keyword", () => {
    expect(classifyByName("SLEVA 30%")).toBe("sale");
    expect(classifyByName("sleva_vanoce")).toBe("seasonal"); // seasonal wins
  });

  it("detects Czech keywords", () => {
    expect(classifyByName("AKCE leto")).toBe("sale");
    expect(classifyByName("VÝPRODEJ")).toBe("sale");
    expect(classifyByName("Vyprodej zbozi")).toBe("sale");
  });

  it("detects discount regex -XX%", () => {
    expect(classifyByName("Produkt -30% leto")).toBe("sale");
    expect(classifyByName("-50% dnes")).toBe("sale");
    expect(classifyByName("Sleva -5 %")).toBe("sale");
  });

  it("detects seasonal BF keyword", () => {
    expect(classifyByName("BF_2025")).toBe("seasonal");
    expect(classifyByName("BlackFriday weekend")).toBe("seasonal");
    expect(classifyByName("Black_Friday deal")).toBe("seasonal");
  });

  it("detects Christmas keywords", () => {
    expect(classifyByName("XMAS_drop")).toBe("seasonal");
    expect(classifyByName("VANOCE 2025")).toBe("seasonal");
    expect(classifyByName("Vánoce last chance")).toBe("seasonal");
  });

  it("seasonal has priority over sale in mixed names", () => {
    expect(classifyByName("BF_SALE_2025")).toBe("seasonal");
    expect(classifyByName("XMAS -40% drop")).toBe("seasonal");
  });

  it("handles spaces and underscores interchangeably", () => {
    expect(classifyByName("Black Friday deal")).toBe("seasonal");
    expect(classifyByName("Black-Friday")).toBe("seasonal");
  });

  it("matches substring inside longer name", () => {
    expect(classifyByName("Q4_BF_evergreen_test")).toBe("seasonal");
  });

  it("known limitation: substring match can produce false positives", () => {
    expect(classifyByName("PROBFG_campaign")).toBe("seasonal"); // known limitation
  });
});
