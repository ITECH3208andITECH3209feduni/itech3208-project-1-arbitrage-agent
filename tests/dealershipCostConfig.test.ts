import { describe, expect, it } from "vitest";
import {
  dealershipCostOverridesFromInputs,
  parseDealershipCostConfiguration,
} from "../src/dealershipCostConfig.js";

describe("dealership cost configuration", () => {
  it("loads valid stored values and ignores invalid or unknown entries", () => {
    const result = parseDealershipCostConfiguration(JSON.stringify({
      agentFeeAud: "125.50",
      insuranceRate: "1.5",
      overrideCustomsDutyRate: "101",
      plateFee: "-1",
      unknownValue: "500",
    }));

    expect(result).toEqual({ agentFeeAud: "125.50", insuranceRate: "1.5" });
  });

  it("converts percentage inputs to rates and keeps zero cost overrides", () => {
    expect(dealershipCostOverridesFromInputs({
      agentFeeAud: "0",
      insuranceRate: "1.5",
      overrideCustomsDutyRate: "5",
    })).toEqual({
      agentFeeAud: 0,
      insuranceRate: 0.015,
      overrideCustomsDutyRate: 0.05,
    });
  });

  it("uses empty settings for invalid stored JSON", () => {
    expect(parseDealershipCostConfiguration("not json")).toEqual({});
  });
});
