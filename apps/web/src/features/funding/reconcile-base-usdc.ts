export type BaseUsdcBalanceReader = (
    address: `0x${string}`,
) => Promise<bigint>;

export interface BaseUsdcReconciliationOptions {
    readonly address: `0x${string}`;
    readonly startingBalance: bigint;
    readonly readBalance: BaseUsdcBalanceReader;
    readonly attempts?: number;
    readonly delayMs?: number;
    readonly sleep?: (
        milliseconds: number,
    ) => Promise<void>;
}

function defaultSleep(
    milliseconds: number,
): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

export async function waitForBaseUsdcIncrease({
    address,
    startingBalance,
    readBalance,
    attempts = 15,
    delayMs = 2_000,
    sleep = defaultSleep,
}: BaseUsdcReconciliationOptions): Promise<bigint> {
    for (
        let attempt = 0;
        attempt < attempts;
        attempt += 1
    ) {
        const currentBalance =
            await readBalance(address);

        const increase =
            currentBalance - startingBalance;

        if (increase > 0n) {
            return increase;
        }

        if (attempt < attempts - 1) {
            await sleep(delayMs);
        }
    }

    throw new Error(
        "Your purchase was confirmed, but the funds haven't appeared yet.",
    );
}