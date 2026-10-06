import type {
  EthereumProvider,
} from "@/chain/evm-wallet";

interface EvmFundingChain {
  readonly id:
    number;

  readonly name:
    string;

  readonly nativeCurrency: {
    readonly name:
      string;

    readonly symbol:
      string;

    readonly decimals:
      number;
  };

  readonly rpcUrls:
    readonly string[];

  readonly blockExplorerUrls:
    readonly string[];
}

const EVM_FUNDING_CHAINS:
  Readonly<
    Record<
      string,
      EvmFundingChain
    >
  > = {
  ethereum: {
    id: 1,
    name: "Ethereum",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: [
      "https://ethereum-rpc.publicnode.com",
    ],
    blockExplorerUrls: [
      "https://etherscan.io",
    ],
  },

  eth: {
    id: 1,
    name: "Ethereum",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: [
      "https://ethereum-rpc.publicnode.com",
    ],
    blockExplorerUrls: [
      "https://etherscan.io",
    ],
  },

  optimism: {
    id: 10,
    name: "Optimism",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: [
      "https://mainnet.optimism.io",
    ],
    blockExplorerUrls: [
      "https://optimistic.etherscan.io",
    ],
  },

  op: {
    id: 10,
    name: "Optimism",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: [
      "https://mainnet.optimism.io",
    ],
    blockExplorerUrls: [
      "https://optimistic.etherscan.io",
    ],
  },

  base: {
    id: 8453,
    name: "Base",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: [
      "https://mainnet.base.org",
    ],
    blockExplorerUrls: [
      "https://basescan.org",
    ],
  },

  arbitrum: {
    id: 42161,
    name: "Arbitrum",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: [
      "https://arb1.arbitrum.io/rpc",
    ],
    blockExplorerUrls: [
      "https://arbiscan.io",
    ],
  },

  arb: {
    id: 42161,
    name: "Arbitrum",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: [
      "https://arb1.arbitrum.io/rpc",
    ],
    blockExplorerUrls: [
      "https://arbiscan.io",
    ],
  },
};

export async function readChainId(
  provider: EthereumProvider,
): Promise<number> {
  const rawChainId =
    await provider.request({
      method:
        "eth_chainId",
    });

  if (
    typeof rawChainId
      !== "string"
  ) {
    throw new Error(
      "Unable to read wallet network.",
    );
  }

  const chainId =
    Number.parseInt(
      rawChainId,
      16,
    );

  if (
    !Number.isSafeInteger(
      chainId,
    )
  ) {
    throw new Error(
      "Unable to read wallet network.",
    );
  }

  return chainId;
}

export async function switchToFundingChain(
  provider: EthereumProvider,
  blockchain: string,
): Promise<void> {
  const chain =
    EVM_FUNDING_CHAINS[
      blockchain
    ];

  if (
    !chain
  ) {
    throw new Error(
      `${blockchain} isn't currently supported for wallet transfers.`,
    );
  }

  const currentChainId =
    await readChainId(
      provider,
    );

  if (
    currentChainId
      === chain.id
  ) {
    return;
  }

  const chainId =
    `0x${chain.id.toString(
      16,
    )}`;

  try {
    await provider.request({
      method:
        "wallet_switchEthereumChain",
      params: [
        {
          chainId,
        },
      ],
    });
  } catch (
    error
  ) {
    const code =
      typeof error
        === "object"
      && error
        !== null
      && "code" in error
        ? error.code
        : undefined;

    if (
      code
        !== 4902
    ) {
      throw error;
    }

    await provider.request({
      method:
        "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName:
            chain.name,
          nativeCurrency:
            chain.nativeCurrency,
          rpcUrls: [
            ...chain.rpcUrls,
          ],
          blockExplorerUrls: [
            ...chain.blockExplorerUrls,
          ],
        },
      ],
    });
  }
}

export async function restoreChain(
  provider: EthereumProvider,
  chainId: number,
): Promise<void> {
  const currentChainId =
    await readChainId(
      provider,
    );

  if (
    currentChainId
      === chainId
  ) {
    return;
  }

  await provider.request({
    method:
      "wallet_switchEthereumChain",
    params: [
      {
        chainId:
          `0x${chainId.toString(
            16,
          )}`,
      },
    ],
  });
}
