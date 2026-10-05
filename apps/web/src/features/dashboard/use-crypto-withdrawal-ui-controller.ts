import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  resolveKeptFundingAssets,
  type FundingAsset,
} from "@/features/funding/intents/supported-tokens";
import {
  diagnostics,
} from "@/lib/diagnostics";

export interface CryptoWithdrawalUiController {
  readonly amount:
    string;

  readonly recipient:
    string;

  readonly destinationAssets:
    readonly FundingAsset[];

  readonly destinationAssetId:
    string | null;

  readonly previewing:
    boolean;

  readonly previewReady:
    boolean;

  readonly previewStatus:
    string | null;

  readonly previewError:
    string | null;

  readonly executing:
    boolean;

  readonly executionStatus:
    string | null;

  readonly executionError:
    string | null;

  readonly setAmount:
    (value: string) => void;

  readonly setRecipient:
    (value: string) => void;

  readonly setDestinationAssetId:
    (assetId: string) => void;

  readonly startPreview:
    () => void;

  readonly completePreview:
    (status?: string) => void;

  readonly failPreview:
    (message: string) => void;

  readonly startExecution:
    (status: string) => void;

  readonly setExecutionStatus:
    (status: string | null) => void;

  readonly completeExecution:
    (status?: string) => void;

  readonly failExecution:
    (message: string) => void;

  readonly clearAfterExecution:
    () => void;
}

export function useCryptoWithdrawalUiController():
  CryptoWithdrawalUiController {
  const [
    amount,
    setStoredAmount,
  ] =
    useState("");

  const [
    recipient,
    setStoredRecipient,
  ] =
    useState("");

  const [
    destinationAssets,
    setDestinationAssets,
  ] =
    useState<
      readonly FundingAsset[]
    >([]);

  const [
    destinationAssetId,
    setStoredDestinationAssetId,
  ] =
    useState<
      string | null
    >(null);

  const [
    previewing,
    setPreviewing,
  ] =
    useState(false);

  const [
    previewReady,
    setPreviewReady,
  ] =
    useState(false);

  const [
    previewStatus,
    setPreviewStatus,
  ] =
    useState<
      string | null
    >(null);

  const [
    previewError,
    setPreviewError,
  ] =
    useState<
      string | null
    >(null);

  const [
    executing,
    setExecuting,
  ] =
    useState(false);

  const [
    executionStatus,
    setStoredExecutionStatus,
  ] =
    useState<
      string | null
    >(null);

  const [
    executionError,
    setExecutionError,
  ] =
    useState<
      string | null
    >(null);

  useEffect(
    () => {
      let cancelled =
        false;

      void (
        async () => {
          try {
            const {
              origins,
              destination,
            } =
              await resolveKeptFundingAssets();

            const assets =
              [
                destination,
                ...origins,
              ].filter(
                (
                  asset,
                  index,
                  all,
                ) =>
                  all.findIndex(
                    (
                      candidate,
                    ) =>
                      candidate.assetId
                      === asset.assetId,
                  ) === index,
              );

            if (
              cancelled
            ) {
              return;
            }

            setDestinationAssets(
              assets,
            );

            setStoredDestinationAssetId(
              (
                current,
              ) =>
                current
                ?? destination.assetId,
            );
          } catch (
            error
          ) {
            diagnostics.error(
              "withdrawal.assets_load_failed",
              error,
            );

            if (
              !cancelled
            ) {
              setPreviewError(
                "Withdrawal routes are currently unavailable.",
              );
            }
          }
        }
      )();

      return () => {
        cancelled =
          true;
      };
    },
    [],
  );

  const invalidatePreview =
    useCallback(
      () => {
        setPreviewReady(
          false,
        );
        setPreviewStatus(
          null,
        );
        setPreviewError(
          null,
        );
        setStoredExecutionStatus(
          null,
        );
        setExecutionError(
          null,
        );
      },
      [],
    );

  const setAmount =
    useCallback(
      (
        value: string,
      ) => {
        setStoredAmount(
          value,
        );
        invalidatePreview();
      },
      [
        invalidatePreview,
      ],
    );

  const setRecipient =
    useCallback(
      (
        value: string,
      ) => {
        setStoredRecipient(
          value,
        );
        invalidatePreview();
      },
      [
        invalidatePreview,
      ],
    );

  const setDestinationAssetId =
    useCallback(
      (
        assetId: string,
      ) => {
        setStoredDestinationAssetId(
          assetId,
        );
        invalidatePreview();
      },
      [
        invalidatePreview,
      ],
    );

  const startPreview =
    useCallback(
      () => {
        setPreviewing(
          true,
        );
        setPreviewReady(
          false,
        );
        setPreviewStatus(
          "Preparing transfer route…",
        );
        setPreviewError(
          null,
        );
        setStoredExecutionStatus(
          null,
        );
        setExecutionError(
          null,
        );
      },
      [],
    );

  const completePreview =
    useCallback(
      (
        status =
          "Transfer route ready.",
      ) => {
        setPreviewing(
          false,
        );
        setPreviewReady(
          true,
        );
        setPreviewStatus(
          status,
        );
        setPreviewError(
          null,
        );
      },
      [],
    );

  const failPreview =
    useCallback(
      (
        message: string,
      ) => {
        setPreviewing(
          false,
        );
        setPreviewReady(
          false,
        );
        setPreviewStatus(
          null,
        );
        setPreviewError(
          message,
        );
      },
      [],
    );

  const startExecution =
    useCallback(
      (
        status: string,
      ) => {
        setExecuting(
          true,
        );
        setStoredExecutionStatus(
          status,
        );
        setExecutionError(
          null,
        );
      },
      [],
    );

  const setExecutionStatus =
    useCallback(
      (
        status:
          string | null,
      ) => {
        setStoredExecutionStatus(
          status,
        );
      },
      [],
    );

  const completeExecution =
    useCallback(
      (
        status =
          "Transfer complete.",
      ) => {
        setExecuting(
          false,
        );
        setStoredExecutionStatus(
          status,
        );
        setExecutionError(
          null,
        );
      },
      [],
    );

  const failExecution =
    useCallback(
      (
        message: string,
      ) => {
        setExecuting(
          false,
        );
        setStoredExecutionStatus(
          null,
        );
        setExecutionError(
          message,
        );
      },
      [],
    );

  const clearAfterExecution =
    useCallback(
      () => {
        setStoredAmount(
          "",
        );
        setPreviewReady(
          false,
        );
        setPreviewStatus(
          null,
        );
      },
      [],
    );

  return {
    amount,
    recipient,
    destinationAssets,
    destinationAssetId,
    previewing,
    previewReady,
    previewStatus,
    previewError,
    executing,
    executionStatus,
    executionError,
    setAmount,
    setRecipient,
    setDestinationAssetId,
    startPreview,
    completePreview,
    failPreview,
    startExecution,
    setExecutionStatus,
    completeExecution,
    failExecution,
    clearAfterExecution,
  };
}
