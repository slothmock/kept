import { describe, expect, it } from "vitest";

import {
  readFiatEnabled,
} from "../src/app/feature-flags.js";

describe("fiat feature flag", () => {
  it("is disabled by default", () => {
    expect(readFiatEnabled({})).toBe(false);
  });

  it("enables fiat only when explicitly true", () => {
    expect(readFiatEnabled({
      VITE_FIAT_ENABLED: "true",
    })).toBe(true);

    expect(readFiatEnabled({
      VITE_FIAT_ENABLED: true,
    })).toBe(true);

    expect(readFiatEnabled({
      VITE_FIAT_ENABLED: "false",
    })).toBe(false);
  });
});
