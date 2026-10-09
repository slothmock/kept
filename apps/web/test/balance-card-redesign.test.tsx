import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BalanceCard } from "../src/features/savings/components/BalanceCard.js";

const readyPosition = {
  kind: "ready" as const,
  position: {
    assets: 547_310_000n,
    usdcBalance: 1_441_890_000n,
    allowance: 0n,
    shares: 547_310_000n,
    withdrawableAssets: 547_310_000n,
  },
};

function renderBalanceCard(stagingFaucetAvailable: boolean) {
  return renderToStaticMarkup(
    <BalanceCard
      positionState={readyPosition}
      savingsPerformanceState={{ kind: "ready", earningsAssets: -10_790_000n }}
      marketStatusState={{
        kind: "ready",
        availableToDepositAssets: null,
        availableToWithdrawAssets: 547_310_000n,
        tvlAssets: 0n,
        suppliedAssets: null,
        supplyCapAssets: null,
        grossApyBps: 470,
        netApyBps: 450,
      }}
      allocatedGoalSavings={100_000_000n}
      showActions={false}
      transactionPending={false}
      onAddMoney={() => {}}
      onWithdraw={() => {}}
      onAddToSavings={() => {}}
      onRefresh={async () => {}}
      stagingFaucetAvailable={stagingFaucetAvailable}
      stagingFaucetClaiming={false}
      stagingFaucetStatus={null}
      stagingFaucetError={null}
      onClaimStagingFaucet={() => {}}
    />,
  );
}

describe("redesigned balance card", () => {
  it("keeps wallet cash distinct from yield-earning savings", () => {
    const html = renderBalanceCard(false);
    expect(html).toContain("Total balance");
    expect(html).toContain("1989.20 USDC");
    expect(html).toContain("547.31 USDC currently earning yield");
    expect(html).toContain("4.50% APY");
    expect(html).toContain("Available cash");
    expect(html).toContain("1441.89 USDC");
    expect(html).toContain("Assigned to goals");
    expect(html).toContain("100.00 USDC");
    expect(html).toContain("Net earnings");
    expect(html).toContain("-10.79 USDC");
    expect(html).toContain("Add to savings");
    expect(html).toContain("Withdraw");
    expect(html).not.toContain("Get test funds");
  });

  it("only shows the testnet faucet action when available", () => {
    expect(renderBalanceCard(true)).toContain("Get test funds");
  });
});
