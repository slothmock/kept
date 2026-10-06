import {
  useCallback,
  useEffect,
  useState,
} from "react";
import type {
  Address,
} from "viem";

import type {
  CommitmentDto,
} from "@/api/kept-api";
import {
  readCommitmentRewardState,
  type CommitmentRewardState,
} from "@/commitments/commitment-manager";
import {
  diagnostics,
} from "@/lib/diagnostics";

export type RewardState =
  | {
      readonly kind:
        "loading";
    }
  | {
      readonly kind:
        "ready";

      readonly reward:
        CommitmentRewardState;
    }
  | {
      readonly kind:
        "error";

      readonly message:
        string;
    };

interface UseRewardStateControllerInput {
  readonly manager:
    Address | null;

  readonly commitments:
    readonly CommitmentDto[]
    | null;

  readonly readContract:
    ((
      input: unknown,
    ) => Promise<unknown>)
    | null;
}

export function useRewardStateController({
  manager,
  commitments,
  readContract,
}: UseRewardStateControllerInput): {
  readonly rewardStates:
    Readonly<
      Record<
        string,
        RewardState
      >
    >;

  readonly refreshRewardStates:
    (
      commitmentsToRefresh:
        readonly CommitmentDto[],
    ) => Promise<void>;
} {
  const [
    rewardStates,
    setRewardStates,
  ] =
    useState<
      Readonly<
        Record<
          string,
          RewardState
        >
      >
    >({});

  const refreshRewardStates =
    useCallback(
      async (
        commitmentsToRefresh:
          readonly CommitmentDto[],
      ) => {
        if (
          !manager
          || !readContract
        ) {
          return;
        }

        const completed =
          commitmentsToRefresh
            .filter(
              (
                commitment,
              ) =>
                commitment.state
                  === "COMPLETED"
                && commitment
                  .onchainCommitmentId
                  !== null,
            );

        if (
          completed.length
            === 0
        ) {
          setRewardStates(
            {},
          );

          return;
        }

        setRewardStates(
          (
            current,
          ) => {
            const next =
              {
                ...current,
              };

            for (
              const commitment
              of completed
            ) {
              next[
                commitment.id
              ] = {
                kind:
                  "loading",
              };
            }

            return next;
          },
        );

        await Promise.all(
          completed.map(
            async (
              commitment,
            ) => {
              try {
                const onchainCommitmentId =
                  commitment
                    .onchainCommitmentId;

                if (
                  !onchainCommitmentId
                ) {
                  return;
                }

                const reward =
                  await readCommitmentRewardState({
                    manager,
                    commitmentId:
                      onchainCommitmentId,
                    readContract:
                      (request) =>
                        readContract(
                          request,
                        ),
                  });

                setRewardStates(
                  (
                    current,
                  ) => ({
                    ...current,

                    [commitment.id]:
                      {
                        kind:
                          "ready",
                        reward,
                      },
                  }),
                );
              } catch (
                error
              ) {
                diagnostics.warn(
                  "commitment.reward_read_failed",
                  error,
                  {
                    commitmentId:
                      commitment.id,
                  },
                );

                setRewardStates(
                  (
                    current,
                  ) => ({
                    ...current,

                    [commitment.id]:
                      {
                        kind:
                          "error",
                        message:
                          "Reward details are temporarily unavailable.",
                      },
                  }),
                );
              }
            },
          ),
        );
      },
      [
        manager,
        readContract,
      ],
    );

  useEffect(
    () => {
      if (
        !commitments
      ) {
        return;
      }

      queueMicrotask(
        () => {
          void refreshRewardStates(
            commitments,
          );
        },
      );
    },
    [
      commitments,
      refreshRewardStates,
    ],
  );

  return {
    rewardStates,
    refreshRewardStates,
  };
}
