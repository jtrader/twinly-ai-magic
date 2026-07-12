import { describe, expect, it } from "vitest";
import { contentPersonaForCeiling, rankContentRecords } from "../twinly-content.server";

describe("Twinly Content connector", () => {
  it("maps the enforced persona ceiling to the matching library edition", () => {
    expect(contentPersonaForCeiling("sfw")).toBe("nice");
    expect(contentPersonaForCeiling("suggestive")).toBe("naughty");
    expect(contentPersonaForCeiling("explicit")).toBe("wicked");
  });

  it("ranks relevant library records without returning unrelated material", () => {
    const records = [
      { title: "Welcome", base_text: "A warm welcome for a new follower" },
      { title: "Renewal", base_text: "A subscriber renewal message" },
      { title: "Lighting", base_text: "Studio lighting checklist" },
    ];

    expect(rankContentRecords(records, "Help me welcome a new follower", 2)).toEqual([records[0]]);
  });
});
