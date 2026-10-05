import type {
  CommitmentDto,
  GoalDto,
} from "@/api/kept-api";

import {
  beginProductRefresh as beginDomainProductRefresh,
  failProductRefresh as failDomainProductRefresh,
  initialProductDataState as initialDomainProductDataState,
  type ProductDataState as DomainProductDataState,
} from "@/domain/product-data-state";

export type ProductDataState =
  DomainProductDataState<
    GoalDto,
    CommitmentDto
  >;

export function initialProductDataState():
  ProductDataState {
  return initialDomainProductDataState();
}

export function beginProductRefresh(
  state: ProductDataState,
): ProductDataState {
  return beginDomainProductRefresh(
    state,
  );
}

export function failProductRefresh(
  state: ProductDataState,
  message: string,
): ProductDataState {
  return failDomainProductRefresh(
    state,
    message,
  );
}
