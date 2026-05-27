import { describe, expect, it } from "vitest";
import { canonicalizeUrl } from "../src/utils.js";

describe("canonicalizeUrl", () => {
  it("canonicalizes host and removes trailing slash", () => {
    expect(canonicalizeUrl("https://Example.COM/UsedCar/Car?a=1#frag")).toBe(
      "https://example.com/UsedCar/Car?a=1",
    );
  });

  it("removes tracking params and preserves non-tracking params", () => {
    expect(
      canonicalizeUrl("https://example.com/list?utm_source=google&view=list&gclid=abc&utm_medium=cpc"),
    ).toBe("https://example.com/list?view=list");
  });

  it("sorts remaining query params for dedupe", () => {
    expect(canonicalizeUrl("https://example.com/list?b=2&a=1")).toBe(
      "https://example.com/list?a=1&b=2",
    );
  });

  it("keeps hash out", () => {
    expect(canonicalizeUrl("https://example.com/page#section")).toBe("https://example.com/page");
  });

  it("returns input for invalid urls", () => {
    expect(canonicalizeUrl("not-a-url")).toBe("not-a-url");
  });
});
