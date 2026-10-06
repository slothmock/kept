// @vitest-environment jsdom

import {
  act,
  renderHook,
  waitFor,
} from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock(
  "@/features/funding/intents/supported-tokens",
  () => ({
    resolveKeptFundingAssets:
      vi.fn(async () => ({
        destination: {
          assetId:
            "nep141:usdc.monad",
          symbol:
            "USDC",
          blockchain:
            "monad",
          kind:
            "token",
          decimals:
            6,
          contractAddress:
            "0x1111111111111111111111111111111111111111",
        },
        origins: [
          {
            assetId:
              "nep141:usdc.base",
            symbol:
              "USDC",
            blockchain:
              "base",
            kind:
              "token",
            decimals:
              6,
            contractAddress:
              "0x2222222222222222222222222222222222222222",
          },
        ],
      })),
  }),
);

import {
  useCryptoWithdrawalUiController,
} from "../src/features/dashboard/use-crypto-withdrawal-ui-controller.js";

describe(
  "useCryptoWithdrawalUiController",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();
      },
    );

    it(
      "invalidates a ready preview when the transfer input changes",
      async () => {
        const {
          result,
        } =
          renderHook(
            () =>
              useCryptoWithdrawalUiController(),
          );

        await waitFor(
          () => {
            expect(
              result.current
                .destinationAssetId,
            ).not.toBeNull();
          },
        );

        act(
          () => {
            result.current
              .completePreview(
                "Transfer route ready.",
              );
          },
        );

        expect(
          result.current
            .previewReady,
        ).toBe(true);

        act(
          () => {
            result.current
              .setAmount(
                "10",
              );
          },
        );

        expect(
          result.current
            .previewReady,
        ).toBe(false);

        expect(
          result.current
            .previewStatus,
        ).toBeNull();

        expect(
          result.current
            .previewError,
        ).toBeNull();

        expect(
          result.current
            .executionStatus,
        ).toBeNull();

        expect(
          result.current
            .executionError,
        ).toBeNull();
      },
    );

    it(
      "clears preview readiness and status when previewing fails",
      async () => {
        const {
          result,
        } =
          renderHook(
            () =>
              useCryptoWithdrawalUiController(),
          );

        await waitFor(
          () => {
            expect(
              result.current
                .destinationAssetId,
            ).not.toBeNull();
          },
        );

        act(
          () => {
            result.current
              .completePreview(
                "Transfer ready.",
              );
          },
        );

        act(
          () => {
            result.current
              .failPreview(
                "Route unavailable.",
              );
          },
        );

        expect(
          result.current
            .previewing,
        ).toBe(false);

        expect(
          result.current
            .previewReady,
        ).toBe(false);

        expect(
          result.current
            .previewStatus,
        ).toBeNull();

        expect(
          result.current
            .previewError,
        ).toBe(
          "Route unavailable.",
        );
      },
    );

    it(
      "clears execution progress on failure without clearing transfer inputs",
      async () => {
        const {
          result,
        } =
          renderHook(
            () =>
              useCryptoWithdrawalUiController(),
          );

        await waitFor(
          () => {
            expect(
              result.current
                .destinationAssetId,
            ).not.toBeNull();
          },
        );

        act(
          () => {
            result.current
              .setAmount(
                "25",
              );

            result.current
              .setRecipient(
                "0x3333333333333333333333333333333333333333",
              );

            result.current
              .startExecution(
                "Preparing transfer…",
              );
          },
        );

        act(
          () => {
            result.current
              .failExecution(
                "Transfer failed.",
              );
          },
        );

        expect(
          result.current
            .executing,
        ).toBe(false);

        expect(
          result.current
            .executionStatus,
        ).toBeNull();

        expect(
          result.current
            .executionError,
        ).toBe(
          "Transfer failed.",
        );

        expect(
          result.current.amount,
        ).toBe(
          "25",
        );

        expect(
          result.current.recipient,
        ).toBe(
          "0x3333333333333333333333333333333333333333",
        );
      },
    );
  },
);
