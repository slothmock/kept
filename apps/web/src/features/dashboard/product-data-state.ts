import type { CommitmentDto, GoalDto } from "@/api/kept-api";

interface ProductData {
  readonly goals: readonly GoalDto[];
  readonly commitments: readonly CommitmentDto[];
}

export type ProductDataState =
  | ({ readonly kind: "loading" } & ProductData)
  | ({ readonly kind: "ready" } & ProductData)
  | ({ readonly kind: "error"; readonly message: string } & ProductData);

export function initialProductDataState(): ProductDataState {
  return { kind: "loading", goals: [], commitments: [] };
}

export function beginProductRefresh(state: ProductDataState): ProductDataState {
  return {
    kind: "loading",
    goals: state.goals,
    commitments: state.commitments,
  };
}

export function failProductRefresh(state: ProductDataState, message: string): ProductDataState {
  return {
    kind: "error",
    message,
    goals: state.goals,
    commitments: state.commitments,
  };
}
