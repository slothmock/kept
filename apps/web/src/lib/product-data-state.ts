export interface ProductData<TGoal, TCommitment> {
  readonly goals: readonly TGoal[];
  readonly commitments: readonly TCommitment[];
}

export type ProductDataState<TGoal, TCommitment> =
  | ({ readonly kind: "loading" } & ProductData<TGoal, TCommitment>)
  | ({ readonly kind: "ready" } & ProductData<TGoal, TCommitment>)
  | ({
      readonly kind: "error";
      readonly message: string;
    } & ProductData<TGoal, TCommitment>);

export function initialProductDataState<TGoal, TCommitment>():
  ProductDataState<TGoal, TCommitment> {
  return {
    kind: "loading",
    goals: [],
    commitments: [],
  };
}

export function beginProductRefresh<TGoal, TCommitment>(
  state: ProductDataState<TGoal, TCommitment>,
): ProductDataState<TGoal, TCommitment> {
  return {
    kind: "loading",
    goals: state.goals,
    commitments: state.commitments,
  };
}

export function failProductRefresh<TGoal, TCommitment>(
  state: ProductDataState<TGoal, TCommitment>,
  message: string,
): ProductDataState<TGoal, TCommitment> {
  return {
    kind: "error",
    message,
    goals: state.goals,
    commitments: state.commitments,
  };
}
