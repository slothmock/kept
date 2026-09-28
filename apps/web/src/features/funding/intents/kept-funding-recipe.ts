import type {
  Recipe,
} from "@aurora-is-near/intents-connect";

export const BASE_USDC =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export const BASE_USDC_DECIMALS = 6;

export interface KeptFundingRecipeParams {
  readonly recipient: string;
}

export function createKeptFundingRecipe(
  monadUsdcAssetId: string,
  monadUsdcAddress: string,
): Recipe<KeptFundingRecipeParams> {
  return {
    id: "kept-funding",

    intent: "fund_kept",

    title: "Add money to Kept",

    flow: "bridge-in",

    type: "evm",

    destination: {
      chain: "monad",
      assetId:
        monadUsdcAssetId,
      tokenAddress:
        monadUsdcAddress,
    },

    buildSteps: () => [],
  };
}