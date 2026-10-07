import { describe, expect, it, vi } from "vitest";

import { readVaultPosition } from "../src/wallet/vault/position.js";

const account = "0x1111111111111111111111111111111111111111";
const usdc = "0x2222222222222222222222222222222222222222";
const vault = "0x3333333333333333333333333333333333333333";

describe("readVaultPosition", () => {
  it("batches Monad position reads with an explicit Multicall3 address", async () => {
    const multicall =
      vi.fn(
        async () => [
          12_000_000n,
          80_000_000n,
          100_000_000n,
          40_000_000n,
        ] as const,
      );

    const readContract =
      vi.fn(
        async (
          input: unknown,
        ) => {
          const call =
            input as {
              readonly address: string;
              readonly functionName: string;
              readonly args?: readonly unknown[];
            };

          expect(call).toMatchObject({
            address: vault,
            functionName:
              "convertToAssets",
            args: [
              100_000_000n,
            ],
          });

          return 105_000_000n;
        },
      );

    const position =
      await readVaultPosition({
        publicClient: {
          multicall,
          readContract,
        },
        account,
        usdc,
        vault,
        chainId:
          10_143,
      });

    expect(position).toEqual({
      usdcBalance:
        12_000_000n,
      allowance:
        80_000_000n,
      shares:
        100_000_000n,
      assets:
        105_000_000n,
      withdrawableAssets:
        40_000_000n,
    });

    expect(multicall)
      .toHaveBeenCalledTimes(1);

    expect(readContract)
      .toHaveBeenCalledTimes(1);

    const multicallInput =
      multicall.mock.calls[0]?.[0] as {
        readonly allowFailure:
          boolean;
        readonly multicallAddress:
          string;
        readonly contracts:
          readonly {
            readonly address:
              string;
            readonly functionName:
              string;
            readonly args?:
              readonly unknown[];
          }[];
      };

    expect(
      multicallInput.multicallAddress,
    ).toBe(
      "0xcA11bde05977b3631167028862bE2a173976CA11",
    );

    expect(
      multicallInput.allowFailure,
    ).toBe(false);

    expect(
      multicallInput.contracts,
    ).toEqual([
      expect.objectContaining({
        address: usdc,
        functionName:
          "balanceOf",
        args: [account],
      }),
      expect.objectContaining({
        address: usdc,
        functionName:
          "allowance",
        args: [
          account,
          vault,
        ],
      }),
      expect.objectContaining({
        address: vault,
        functionName:
          "balanceOf",
        args: [account],
      }),
      expect.objectContaining({
        address: vault,
        functionName:
          "maxWithdraw",
        args: [account],
      }),
    ]);
  });

  it("falls back to direct reads on local Anvil", async () => {
    const multicall =
      vi.fn();

    const values =
      [
        12_000_000n,
        80_000_000n,
        100_000_000n,
        40_000_000n,
        105_000_000n,
      ];

    const readContract =
      vi.fn(
        async () =>
          values[
            readContract.mock.calls
              .length - 1
          ] ?? 0n,
      );

    await readVaultPosition({
      publicClient: {
        multicall,
        readContract,
      },
      account,
      usdc,
      vault,
      chainId:
        31_337,
    });

    expect(multicall)
      .not.toHaveBeenCalled();

    expect(readContract)
      .toHaveBeenCalledTimes(5);
  });
});
