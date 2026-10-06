import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  EthereumProvider,
} from "../src/chain/evm-wallet.js";
import {
  readChainId,
  restoreChain,
  switchToFundingChain,
} from "../src/features/funding/evm-funding-network.js";

function providerWith(
  handler: (
    request: {
      readonly method: string;
      readonly params?: readonly unknown[];
    },
  ) => Promise<unknown>,
): EthereumProvider {
  return {
    request: vi.fn(handler),
  } as unknown as EthereumProvider;
}

describe("AddFundsDialog EVM network helpers", () => {
  it("reads the wallet chain id from hex", async () => {
    const provider = providerWith(
      async ({ method }) => {
        expect(method).toBe("eth_chainId");
        return "0x2105";
      },
    );

    await expect(
      readChainId(provider),
    ).resolves.toBe(8453);
  });

  it("does not switch when the wallet is already on the requested funding chain", async () => {
    const provider = providerWith(
      async ({ method }) => {
        if (method === "eth_chainId") {
          return "0x1";
        }

        throw new Error(
          `Unexpected method: ${method}`,
        );
      },
    );

    await switchToFundingChain(
      provider,
      "eth",
    );

    expect(
      provider.request,
    ).toHaveBeenCalledTimes(1);
  });

  it("switches to a known funding chain", async () => {
    const provider = providerWith(
      async ({ method }) => {
        if (method === "eth_chainId") {
          return "0x1";
        }

        if (
          method
          === "wallet_switchEthereumChain"
        ) {
          return null;
        }

        throw new Error(
          `Unexpected method: ${method}`,
        );
      },
    );

    await switchToFundingChain(
      provider,
      "base",
    );

    expect(
      provider.request,
    ).toHaveBeenLastCalledWith({
      method:
        "wallet_switchEthereumChain",
      params: [
        {
          chainId:
            "0x2105",
        },
      ],
    });
  });

  it("adds a known chain when the wallet reports it as missing", async () => {
    let switchAttempts = 0;

    const provider = providerWith(
      async ({ method }) => {
        if (method === "eth_chainId") {
          return "0x1";
        }

        if (
          method
          === "wallet_switchEthereumChain"
        ) {
          switchAttempts += 1;

          throw {
            code: 4902,
          };
        }

        if (
          method
          === "wallet_addEthereumChain"
        ) {
          return null;
        }

        throw new Error(
          `Unexpected method: ${method}`,
        );
      },
    );

    await switchToFundingChain(
      provider,
      "base",
    );

    expect(
      switchAttempts,
    ).toBe(1);

    expect(
      provider.request,
    ).toHaveBeenLastCalledWith({
      method:
        "wallet_addEthereumChain",
      params: [
        expect.objectContaining({
          chainId:
            "0x2105",
          chainName:
            "Base",
        }),
      ],
    });
  });

  it("rejects unsupported funding chains", async () => {
    const provider =
      providerWith(
        async () =>
          "0x1",
      );

    await expect(
      switchToFundingChain(
        provider,
        "unknown",
      ),
    ).rejects.toThrow(
      "unknown isn't currently supported for wallet transfers.",
    );
  });

  it("restores the previous EVM chain when needed", async () => {
    const provider = providerWith(
      async ({ method }) => {
        if (method === "eth_chainId") {
          return "0x2105";
        }

        if (
          method
          === "wallet_switchEthereumChain"
        ) {
          return null;
        }

        throw new Error(
          `Unexpected method: ${method}`,
        );
      },
    );

    await restoreChain(
      provider,
      1,
    );

    expect(
      provider.request,
    ).toHaveBeenLastCalledWith({
      method:
        "wallet_switchEthereumChain",
      params: [
        {
          chainId:
            "0x1",
        },
      ],
    });
  });
});
