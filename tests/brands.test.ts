import { describe, expect, it } from "vitest";
import { getAutotraderBrandPage, getAutotraderPageFromQuery, getGooNetBrandPage, getBrandPages, getModelFamily, getModelSearchCandidates } from "../src/brands.js";

describe("brand URLs", () => {
  it("builds model URLs with Goo-net brand/car schema", () => {
    expect(getGooNetBrandPage("Toyota", "Camry")).toBe(
      "https://www.goo-net.com/usedcar/brand-TOYOTA/car-CAMRY/",
    );
  });

  it("normalizes spaces in Goo-net make and model segments", () => {
    expect(getGooNetBrandPage("Mercedes Benz", "C Class")).toBe(
      "https://www.goo-net.com/usedcar/brand-MERCEDES_BENZ/car-C_CLASS/",
    );
  });

  it("uses model page directly when brand and model are provided", () => {
    expect(getBrandPages("TOYOTA", "CAMRY")).toEqual([
      "https://www.goo-net.com/usedcar/brand-TOYOTA/car-CAMRY/",
    ]);
  });

  it("builds model-family fallbacks for grade searches", () => {
    expect(getModelFamily("ls500h")).toBe("ls");
    expect(getModelSearchCandidates("ls500h")).toEqual(["ls500h", "ls"]);
  });

  it("builds Autotrader year URLs", () => {
    expect(getAutotraderBrandPage("toyota", "camry", 2023)).toBe(
      "https://www.autotrader.com.au/for-sale/toyota/camry/year-2023",
    );
  });

  it("builds Autotrader query year URLs", () => {
    expect(getAutotraderPageFromQuery("Toyota Camry", 2023)).toBe(
      "https://www.autotrader.com.au/for-sale/toyota/camry/year-2023",
    );
  });
});
