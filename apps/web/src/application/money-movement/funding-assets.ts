export interface FundingAsset {
  readonly assetId:
    string;

  readonly symbol:
    string;

  readonly blockchain:
    string;

  readonly contractAddress:
    string | null;

  readonly decimals:
    number;

  readonly kind:
    "native" | "token";
}

export interface KeptFundingAssets {
  readonly origins:
    readonly FundingAsset[];

  readonly destination:
    FundingAsset;
}

export type FundingAssetsResolver =
  () => Promise<KeptFundingAssets>;
