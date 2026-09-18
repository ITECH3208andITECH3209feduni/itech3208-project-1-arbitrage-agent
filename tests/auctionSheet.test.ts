import { describe, expect, it } from "vitest";
import {
  convertImperialYear,
  translateExteriorGrade,
  translateInteriorGrade,
  parseAuctionMileage,
  translateOwnershipHistory,
  extractSalesPoints,
  translateBodyDamageCode,
  translateOtherCode,
  translateAuctionSheet,
} from "../src/auctionSheet.js";

describe("auctionSheet", () => {
  it("converts Japanese-era registration codes to Gregorian years", () => {
    expect(convertImperialYear("R5")).toBe(2023);
    expect(convertImperialYear("H30")).toBe(2018);
    expect(convertImperialYear("S64")).toBe(1989);
    expect(convertImperialYear("Q9")).toBeNull();
    expect(convertImperialYear(undefined)).toBeNull();
  });

  it("translates exterior and interior grades", () => {
    expect(translateExteriorGrade("4.5")).toMatch(/very clean/i);
    expect(translateExteriorGrade("R")).toMatch(/repaired/i);
    expect(translateExteriorGrade("")).toBeUndefined();
    expect(translateInteriorGrade("A")).toMatch(/excellent/i);
    expect(translateInteriorGrade("D")).toMatch(/poor/i);
  });

  it("parses auction mileage with reliability flags", () => {
    expect(parseAuctionMileage("35,000km")).toMatchObject({ km: 35_000, flag: "", warning: expect.stringMatching(/accurate/i) });
    expect(parseAuctionMileage("35,000km★")).toMatchObject({ km: 35_000, flag: "★" });
    expect(parseAuctionMileage("35,000km★★★")).toMatchObject({ flag: "★★★" });
    expect(parseAuctionMileage("－")).toMatchObject({ km: null, flag: "-", warning: expect.stringMatching(/replaced/i) });
  });

  it("translates ownership history", () => {
    expect(translateOwnershipHistory("ワンオーナー")).toMatch(/one owner/i);
    expect(translateOwnershipHistory("教習車")).toMatch(/driving school/i);
    expect(translateOwnershipHistory("")).toBeUndefined();
  });

  it("extracts multiple sales points without double-matching overlapping terms", () => {
    const points = extractSalesPoints("禁煙車・本革・社外マフラー積込あり");
    const jp = points.map((p) => p.jp);
    expect(jp).toContain("禁煙車");
    expect(jp).toContain("本革");
    expect(jp).toContain("社外マフラー積込");
    expect(jp).not.toContain("社外マフラー");
  });

  it("translates body-diagram and misc codes", () => {
    expect(translateBodyDamageCode("A")).toBe("Scratch");
    expect(translateBodyDamageCode("XX")).toBe("Replaced");
    expect(translateOtherCode("PS")).toBe("Power steering");
    expect(translateOtherCode("Y2")).toMatch(/palm/i);
  });

  it("translates a full raw auction sheet", () => {
    const result = translateAuctionSheet({
      exteriorGradeRaw: "4.5",
      interiorGradeRaw: "B",
      mileageRaw: "3.5万km★",
      ownershipHistoryRaw: "自家用",
      registrationRaw: "R2",
      salesPointsRaw: "禁煙車、記録簿あり",
      inspectorNotesRaw: "右ドア小キズあり",
    });

    expect(result.exteriorGradeDescription).toMatch(/very clean/i);
    expect(result.interiorGradeDescription).toMatch(/good/i);
    expect(result.mileageKm).toBe(35_000);
    expect(result.mileageWarning).toMatch(/unverifiable/i);
    expect(result.ownershipHistory).toMatch(/private use/i);
    expect(result.registrationYear).toBe(2020);
    expect(result.salesPoints.map((p) => p.jp)).toContain("禁煙車");
    expect(result.inspectorNotes).toBe("右ドア小キズあり");
  });
});