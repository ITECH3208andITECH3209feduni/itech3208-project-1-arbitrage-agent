import { describe, expect, it } from "vitest";

const SITE_URL = "https://prestigemotorsport.com.au/auctions/";
const AJAX_URL = "https://prestigemotorsport.com.au/wp-admin/admin-ajax.php";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

describe("prestigemotorsport live validation", () => {
  it("fetches a live auction page and prints readable model details from the site", async () => {
    const pageRes = await fetch(SITE_URL, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
    });

    expect(pageRes.ok).toBe(true);
    const pageHtml = await pageRes.text();
    expect(pageHtml.length).toBeGreaterThan(500);
    expect(pageHtml.toLowerCase()).toContain("prestige");

    const directLinks = [...new Set([...pageHtml.matchAll(/href=["']([^"']+)["']/gi)].map((match) => match[1]))]
      .map((link) => {
        if (!link) return null;
        if (/^https?:\/\//i.test(link)) return link;
        if (link.startsWith("/")) return new URL(link, SITE_URL).toString();
        return null;
      })
      .filter((link): link is string => !!link && /prestigemotorsport\.com\.au/i.test(link) && /(vehicle|lot)/i.test(link));

    console.log("Found live auction page:", SITE_URL);
    console.log("Direct vehicle links found on the live page:", directLinks.length > 0 ? directLinks.slice(0, 5) : [SITE_URL]);
    const titleMatch = /<title>(.*?)<\/title>/i.exec(pageHtml);
    const title = titleMatch?.[1] ?? "unknown";
    console.log("Live auction page title:", title);

    const modelRes = await fetch(AJAX_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": USER_AGENT,
        accept: "application/json, text/javascript, */*",
      },
      body: new URLSearchParams({
        action: "search_model_car",
        marka_id: "1",
        "auction-date": "Past",
      }).toString(),
    });

    expect(modelRes.ok).toBe(true);
    console.log("Found live AJAX model endpoint:", AJAX_URL);
    const modelText = await modelRes.text();
    const modelJson = JSON.parse(modelText) as { models?: Array<{ id?: number; ext_id?: number; name?: string }> };

    expect(Array.isArray(modelJson.models)).toBe(true);
    expect(modelJson.models?.length).toBeGreaterThan(0);

    const alphardModel = modelJson.models?.find((model) =>
      typeof model.name === "string" && model.name.toLowerCase().includes("alphard")
    );

    expect(alphardModel).toBeTruthy();
    expect(alphardModel?.ext_id).toEqual(expect.any(Number));
    expect(alphardModel?.name).toMatch(/alphard/i);

    console.log("Live model lookup result:", JSON.stringify(alphardModel, null, 2));
    console.log("Live auction page contains search hooks:", /search_model_car|search_results_car_dev|auction-date|marka_id|model_id/i.test(pageHtml));
  });
});
