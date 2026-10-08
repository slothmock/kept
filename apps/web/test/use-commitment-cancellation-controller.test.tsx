// @vitest-environment jsdom

import {
  act,
  renderHook,
} from "@testing-library/react";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  getAddress,
  type Hex,
} from "viem";

import type {
  CommitmentDto,
  KeptApi,
} from "../src/api/kept-api.js";
import {
  useCommitmentCancellationController,
} from "../src/features/commitments/use-commitment-cancellation-controller.js";

const commitment = {
  id: "commitment-1",
  userId: "user-1",
  savingsGoalId: "goal-1",
  definition: {
    code: "WEEKLY_SAVINGS_V1",
    version: 1,
  },
  parameters: {
    targetAmountAtomic: "25000000",
    periodDays: 7,
  },
  epochStart: "2026-10-01T00:00:00.000Z",
  epochEnd: "2026-10-08T00:00:00.000Z",
  verificationDeadline: "2026-10-09T00:00:00.000Z",
  state: "ACTIVE",
  stateVersion: 2,
  onchainCommitmentId: "7",
  activatedAt: "2026-10-01T00:00:00.000Z",
  finalizedAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
} satisfies CommitmentDto;

describe("useCommitmentCancellationController", () => {
  it("cancels on-chain, persists cancellation, and refreshes product data", async () => {
    const transactionHash =
      `0x${"a".repeat(64)}` as Hex;
    const sendTransaction =
      vi.fn().mockResolvedValue(transactionHash);
    const cancelCommitment =
      vi.fn().mockResolvedValue({
        ...commitment,
        state: "CANCELLED",
      });
    const refreshProductData =
      vi.fn().mockResolvedValue(undefined);
    const ensureTransactionNetwork =
      vi.fn().mockResolvedValue(undefined);
    const waitForReceipt =
      vi.fn().mockResolvedValue({
        status: "success" as const,
      });
    const coordinator = {
      pendingKind: null,
      run: vi.fn(
        async (
          _kind: "commitment",
          operation: () => Promise<void>,
        ) => {
          await operation();
          return true;
        },
      ),
      subscribe: vi.fn(() => () => undefined),
    };

    const { result } = renderHook(() =>
      useCommitmentCancellationController({
        api: {
          cancelCommitment,
        } as unknown as KeptApi,
        account:
          getAddress(
            "0x2222222222222222222222222222222222222222",
          ),
        manager:
          getAddress(
            "0x1111111111111111111111111111111111111111",
          ),
        chainId: 143,
        sender: {
          sendTransaction,
        },
        transactionCoordinator:
          coordinator,
        ensureTransactionNetwork,
        waitForReceipt,
        refreshProductData,
      }),
    );

    let succeeded = false;

    await act(async () => {
      succeeded =
        await result.current.cancelCommitment(
          commitment,
        );
    });

    expect(succeeded).toBe(true);
    expect(ensureTransactionNetwork).toHaveBeenCalledOnce();
    expect(sendTransaction).toHaveBeenCalledOnce();
    expect(waitForReceipt).toHaveBeenCalledWith(transactionHash);
    expect(cancelCommitment).toHaveBeenCalledWith(
      commitment,
      {
        onchainCommitmentId: "7",
        owner:
          "0x2222222222222222222222222222222222222222",
      },
    );
    expect(refreshProductData).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
  });

  it("does not send a transaction for a non-active commitment", async () => {
    const sendTransaction = vi.fn();

    const { result } = renderHook(() =>
      useCommitmentCancellationController({
        api: {} as KeptApi,
        account:
          getAddress(
            "0x2222222222222222222222222222222222222222",
          ),
        manager:
          getAddress(
            "0x1111111111111111111111111111111111111111",
          ),
        chainId: 143,
        sender: {
          sendTransaction,
        },
        transactionCoordinator: {
          pendingKind: null,
          run: vi.fn(),
          subscribe: vi.fn(() => () => undefined),
        },
        ensureTransactionNetwork:
          vi.fn(),
        waitForReceipt:
          vi.fn(),
        refreshProductData:
          vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.cancelCommitment({
        ...commitment,
        state: "COMPLETED",
      });
    });

    expect(sendTransaction).not.toHaveBeenCalled();
    expect(result.current.error).toBe(
      "Only an active commitment can be cancelled.",
    );
  });
});
