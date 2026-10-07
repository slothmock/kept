import type {
    FundingAsset,
} from "@/features/funding/intents/supported-tokens";
import type {
    ExternalWalletFamily,
} from "@/features/funding/use-external-funding-wallet";

export const SOURCE_NETWORK_ORDER =
    [
        "eth",
        "base",
        "arb",
        "op",
        "sol",
    ] as const;

type FundingWalletFamily =
    ExternalWalletFamily
    | null;

function assetMatchesWalletFamily(
    asset:
        FundingAsset,
    family:
        FundingWalletFamily,
): boolean {
    if (
        family ===
        "sol"
    ) {
        return asset.blockchain ===
            "sol";
    }

    if (
        family ===
        "evm"
    ) {
        return asset.blockchain !==
            "sol";
    }

    return true;
}

export function findFundingSourceAsset(
    assets:
        readonly FundingAsset[],
    assetId:
        string | null,
): FundingAsset | null {
    if (
        !assetId
    ) {
        return null;
    }

    return (
        assets.find(
            (
                asset,
            ) =>
                asset.assetId ===
                assetId,
        ) ??
        null
    );
}

export function filterFundingAssetsForWallet(
    assets:
        readonly FundingAsset[],
    family:
        FundingWalletFamily,
): readonly FundingAsset[] {
    return assets.filter(
        (
            asset,
        ) =>
            SOURCE_NETWORK_ORDER.includes(
                asset.blockchain as typeof SOURCE_NETWORK_ORDER[number],
            )
            && assetMatchesWalletFamily(
                asset,
                family,
            ),
    );
}

export function listFundingSourceBlockchains(
    assets:
        readonly FundingAsset[],
): readonly string[] {
    return SOURCE_NETWORK_ORDER.filter(
        (
            blockchain,
        ) =>
            assets.some(
                (
                    asset,
                ) =>
                    asset.blockchain ===
                    blockchain,
            ),
    );
}

export function filterFundingAssetsByBlockchain(
    assets:
        readonly FundingAsset[],
    blockchain:
        string | null,
): readonly FundingAsset[] {
    if (
        !blockchain
    ) {
        return [];
    }

    return assets.filter(
        (
            asset,
        ) =>
            asset.blockchain ===
            blockchain,
    );
}

export function selectFundingSourceBlockchain(
    origins:
        readonly FundingAsset[],
    family:
        FundingWalletFamily,
    current:
        string | null,
): string | null {
    if (
        current
        && origins.some(
            (
                asset,
            ) =>
                asset.blockchain ===
                current,
        )
        && (
            family ===
                "sol"
                ? current ===
                    "sol"
                : family ===
                    "evm"
                  ? current !==
                    "sol"
                  : true
        )
    ) {
        return current;
    }

    const preferredAsset =
        family ===
            "sol"
            ? origins.find(
                (
                    asset,
                ) =>
                    asset.blockchain ===
                    "sol",
            )
            : origins.find(
                (
                    asset,
                ) =>
                    asset.blockchain ===
                    "base",
            );

    return (
        preferredAsset?.blockchain ??
        origins[0]?.blockchain ??
        null
    );
}

export function selectFundingSourceAssetId(
    origins:
        readonly FundingAsset[],
    family:
        FundingWalletFamily,
    current:
        string | null,
): string | null {
    if (
        current
    ) {
        const currentAsset =
            origins.find(
                (
                    asset,
                ) =>
                    asset.assetId ===
                    current,
            );

        if (
            currentAsset
            && assetMatchesWalletFamily(
                currentAsset,
                family,
            )
        ) {
            return current;
        }
    }

    const preferredUsdc =
        origins.find(
            (
                asset,
            ) =>
                asset.blockchain ===
                    (
                        family ===
                            "sol"
                            ? "sol"
                            : "base"
                    )
                && asset.symbol ===
                    "USDC",
        );

    return (
        preferredUsdc?.assetId ??
        origins[0]?.assetId ??
        null
    );
}
