import { describe, expect, it } from "vitest";

import { createLatestRequestGate } from "../src/lib/latest-request.js";

describe("createLatestRequestGate", () => {
  it("accepts only the most recently started request", () => {
    const gate = createLatestRequestGate();
    const first = gate.begin();
    const second = gate.begin();

    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
  });
});