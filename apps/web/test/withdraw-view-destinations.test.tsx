import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WithdrawView } from "../src/features/withdrawals/WithdrawView.js";
import type { ComponentProps } from "react";

const props: ComponentProps<typeof WithdrawView> = {
  position: { withdrawableAssets: 50_000_000n, usdcBalance: 20_000_000n },
  positionLoading: false,
  cryptoAvailable: true,
  cryptoAmount: "",
  cryptoRecipient: "",
  cryptoDestinationAssets: [],
  cryptoDestinationAssetId: null,
  cryptoPreviewing: false,
  cryptoPreviewReady: false,
  cryptoPreviewStatus: null,
  cryptoPreviewError: null,
  cryptoExecuting: false,
  cryptoExecutionStatus: null,
  cryptoExecutionError: null,
  onBack: () => {},
  onCryptoAmountChange: () => {},
  onCryptoRecipientChange: () => {},
  onCryptoDestinationAssetChange: () => {},
  onPreviewCryptoWithdrawal: () => {},
  onExecuteCryptoWithdrawal: () => {},
  bankAvailable: true,
  bankEnabled: false,
  bankAmount: "",
  bankSubmitting: false,
  bankStatus: null,
  bankError: null,
  bankPhase: "setup",
  bankReviewAmount: null,
  bankMinimumReceive: null,
  onBankAmountChange: () => {},
  onStartBankWithdrawal: () => {},
  onRefreshBankWithdrawal: () => {},
  onConfirmBankWithdrawal: () => {},
};

describe("withdraw destination screen", () => {
  it("only offers external destinations, not internal savings withdrawal", () => {
    const html = renderToStaticMarkup(<WithdrawView {...props} />);
    expect(html).toContain("Crypto wallet");
    expect(html).toContain("Bank account");
    expect(html).toContain("Move savings to available cash from your balance card first.");
    expect(html).not.toContain("Move money out of savings while keeping it inside your Kept account.");
    expect(html).not.toContain("Move to available cash");
  });
});
