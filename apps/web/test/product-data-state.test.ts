import { describe, expect, it } from "vitest";

import type { CommitmentDto, GoalDto } from "../src/api/kept-api.js";
import {
  beginProductRefresh,
  failProductRefresh,
  initialProductDataState,
  type ProductDataState,
} from "../src/features/dashboard/product-data-state.js";

const goal = { id: "goal-1" } as GoalDto;
const commitment = { id: "commitment-1" } as CommitmentDto;

describe("product data refresh state", () => {
  it("preserves loaded data while refreshing", () => {
    const ready: ProductDataState = {
      kind: "ready",
      goals: [goal],
      commitments: [commitment],
    };

    expect(beginProductRefresh(ready)).toEqual({
      kind: "loading",
      goals: [goal],
      commitments: [commitment],
    });
  });

  it("preserves loaded data when a refresh fails", () => {
    const loading: ProductDataState = {
      kind: "loading",
      goals: [goal],
      commitments: [commitment],
    };

    expect(failProductRefresh(loading, "Temporarily unavailable")).toEqual({
      kind: "error",
      message: "Temporarily unavailable",
      goals: [goal],
      commitments: [commitment],
    });
  });
});


it("starts with an empty loading state", () => {
  expect(initialProductDataState()).toEqual({
    kind: "loading",
    goals: [],
    commitments: [],
  });
});

it("preserves stale data when refreshing from an error state", () => {
  const errored: ProductDataState = {
    kind: "error",
    message: "Temporary failure",
    goals: [goal],
    commitments: [commitment],
  };

  expect(beginProductRefresh(errored)).toEqual({
    kind: "loading",
    goals: [goal],
    commitments: [commitment],
  });
});

it("preserves loaded data when a ready-state refresh fails", () => {
  const ready: ProductDataState = {
    kind: "ready",
    goals: [goal],
    commitments: [commitment],
  };

  expect(
    failProductRefresh(
      ready,
      "Refresh failed",
    ),
  ).toEqual({
    kind: "error",
    message: "Refresh failed",
    goals: [goal],
    commitments: [commitment],
  });
});
