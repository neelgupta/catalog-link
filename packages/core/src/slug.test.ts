import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it.each([
    ["Shree Krishna Textiles", "shree-krishna-textiles"],
    ["  Rangoli   Vol-3 ", "rangoli-vol-3"],
    ["Patel & Sons", "patel-and-sons"],
    ["Café Fabrics", "cafe-fabrics"],
    ["!!!", "catalog"],
    ["श्री कृष्णा", "catalog"],
  ])("%s -> %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("caps length without a trailing dash", () => {
    const s = slugify("a".repeat(59) + " bbbb");
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free, then numbered suffixes", async () => {
    const taken = new Set(["shree-krishna", "shree-krishna-2"]);
    expect(await uniqueSlug("Other Name", async (s) => taken.has(s))).toBe("other-name");
    expect(await uniqueSlug("Shree Krishna", async (s) => taken.has(s))).toBe("shree-krishna-3");
  });

  it("falls back to a random suffix", async () => {
    const s = await uniqueSlug("Busy", async (slug) => slug.startsWith("busy") && !/-[0-9a-f]{6}$/.test(slug));
    expect(s).toMatch(/^busy-[0-9a-f]{6}$/);
  });
});
