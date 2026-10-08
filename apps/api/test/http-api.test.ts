import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { buildApp, type ApiDependencies } from "../src/app.js";
import { CommitmentSettlementMismatchError } from "../src/commitment-settlement.js";
import type { CommitmentDto } from "../src/persistence/index.js";
import {
  NotFoundError,
  PersistenceValidationError,
} from "../src/persistence/index.js";

const user = {
  id: "user-1",
  privyUserId: "did:privy:user-1",
  displayName: null,
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
} as const;

const goal = {
  id: "goal-1",
  userId: user.id,
  name: "Laptop",
  targetAmountAtomic: "1000000000",
  targetAsset: "USDC",
  targetDate: null,
  status: "ACTIVE" as const,
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
};

const commitment = {
  id: "commitment-1",
  userId: user.id,
  savingsGoalId: goal.id,
  definition: { code: "WEEKLY_SAVINGS_V1", version: 1 },
  parameters: { targetAmountAtomic: "25000000", periodDays: 7 },
  epochStart: "2026-09-20T00:00:00.000Z",
  epochEnd: "2026-09-27T00:00:00.000Z",
  verificationDeadline: "2026-09-28T00:00:00.000Z",
  state: "DRAFT" as const,
  stateVersion: 1,
  activatedAt: null,
  finalizedAt: null,
  onchainCommitmentId: null,
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
};

function buildDependencies(
  overrides: Partial<ApiDependencies> = {},
): ApiDependencies {
  let currentCommitment: CommitmentDto = commitment;

  let currentMoonPayOrder = {
    id: "moonpay-order-1",
    amountAtomic: "20000000",
    baseCurrencyCode: "usdc_base",
    moonPayTransactionId: null as string | null,
    depositWalletAddress: null as string | null,
    depositWalletTag: null as string | null,
    transferReference: null as string | null,
    fundsSentAt: null as string | null,
    status: "pending_widget" as
      | "pending_widget"
      | "ready"
      | "funds_sent"
      | "completed"
      | "failed"
      | "cancelled",
    createdAt: "2026-10-03T00:00:00.000Z",
    updatedAt: "2026-10-03T00:00:00.000Z",
  };

  return {
    chainId: 143,

    authenticate: async (authorization) =>
      authorization === "Bearer valid-token"
        ? {
          privyUserId: user.privyUserId,
          wallet:
            "0x0000000000000000000000000000000000000001",
        }
        : null,

    persistence: {
      joinWaitlist: vi.fn(async () => undefined),
      createUser: async () => user,

      ensureEmbeddedWallet: vi.fn(async () => ({
        id: "wallet-1",
        userId: user.id,
        privyWalletId: null,
        walletKind: "PRIVY_EMBEDDED_MONAD",
        chainId: "143",
        address:
          "0x0000000000000000000000000000000000000001",
        isPrimary: true,
        createdAt: "2026-09-27T00:00:00.000Z",
        updatedAt: "2026-09-27T00:00:00.000Z",
      })),
      createGoal: async () => goal,
      getGoal: async (_userId, id) => (id === goal.id ? goal : null),
      listGoals: async () => [goal],
      listTransactions: async () => [],
      createMoonPayOfframpOrder: vi.fn(async (input) => {
        currentMoonPayOrder = {
          ...currentMoonPayOrder,
          amountAtomic: input.amountAtomic,
          moonPayTransactionId: null,
          depositWalletAddress: null,
          depositWalletTag: null,
          status: "pending_widget",
        };
        return currentMoonPayOrder;
      }),
      getMoonPayOfframpOrder: vi.fn(async (_userId, id) =>
        id === currentMoonPayOrder.id ? currentMoonPayOrder : null
      ),
      recordMoonPayOfframpWebhook: vi.fn(async (input) => {
        currentMoonPayOrder = {
          ...currentMoonPayOrder,
          moonPayTransactionId: input.moonPayTransactionId,
          baseCurrencyCode: input.baseCurrencyCode,
          depositWalletAddress: input.depositWalletAddress,
          depositWalletTag: input.depositWalletTag ?? null,
          status: input.status ?? "ready",
          updatedAt: "2026-10-03T00:01:00.000Z",
        };
        return currentMoonPayOrder;
      }),
      markMoonPayOfframpFundsSent: vi.fn(async (input) => {
        if (input.orderId !== currentMoonPayOrder.id) {
          throw new Error("unknown MoonPay order");
        }
        currentMoonPayOrder = {
          ...currentMoonPayOrder,
          transferReference: input.transferReference,
          fundsSentAt: "2026-10-03T00:02:00.000Z",
          status: "funds_sent",
          updatedAt: "2026-10-03T00:02:00.000Z",
        };
        return currentMoonPayOrder;
      }),
      recordTransaction: async (input) => ({
        id: "transaction-1",
        type: "savings_deposit" as const,
        status: "completed" as const,
        amountAtomic: input.amountAtomic,
        asset: input.asset,
        description: input.description,
        goalId: input.goalId ?? null,
        chainId: input.chainId?.toString() ?? null,
        transactionHash: input.transactionHash ?? null,
        externalReference: input.externalReference ?? null,
        createdAt: "2026-09-30T00:00:00.000Z",
      }),
      archiveGoal: async () => ({
        ...goal,
        status: "ARCHIVED" as const,
      }),
      getGoalAllocation: async (_userId, id) => (id === goal.id ? {
        goalId: goal.id,
        allocatedSharesAtomic: "0",
        totalVaultSharesAtomic: "0",
        totalAllocatedSharesAtomic: "0",
        unallocatedSharesAtomic: "0",
      } : null),
      allocateGoalShares: async () => ({
        goalId: goal.id,
        allocatedSharesAtomic: "0",
        totalVaultSharesAtomic: "0",
        totalAllocatedSharesAtomic: "0",
        unallocatedSharesAtomic: "0",
      }),
      reallocateGoalShares: async () => ({
        from: {
          goalId: goal.id,
          allocatedSharesAtomic: "0",
          totalVaultSharesAtomic: "0",
          totalAllocatedSharesAtomic: "0",
          unallocatedSharesAtomic: "0",
        },
        to: {
          goalId: goal.id,
          allocatedSharesAtomic: "0",
          totalVaultSharesAtomic: "0",
          totalAllocatedSharesAtomic: "0",
          unallocatedSharesAtomic: "0",
        },
      }),
      createCommitmentDraft: async () => commitment,
      getCommitment: async (_userId, id) => (id === commitment.id ? currentCommitment : null),
      listCommitments: async () => [currentCommitment],
      activateCommitment: async () => {
        currentCommitment = {
          ...commitment,
          state: "ACTIVE" as const,
          stateVersion: 2,
          onchainCommitmentId: "7",
          activatedAt: "2026-09-18T01:00:00.000Z",
        };
        return currentCommitment;
      },
      cancelCommitment: async () => {
        currentCommitment = {
          ...currentCommitment,
          state: "CANCELLED" as const,
          stateVersion: 3,
          finalizedAt: "2026-09-18T01:00:00.000Z",
        };
        return currentCommitment;
      },

    },
    commitmentSettlementVerifier: {
      inspect: async () => ({
        settlementRef: new Uint8Array(32),
        owner: "0x2222222222222222222222222222222222222222",
        chainId: 143,
        status: 1,
      }),
      verifyActive: async () => ({
        settlementRef: new Uint8Array(32),
        owner: "0x2222222222222222222222222222222222222222",
        chainId: 143,
        status: 1,
      }),
      verifyCancelled: async () => ({
        settlementRef: new Uint8Array(32),
        owner: "0x2222222222222222222222222222222222222222",
        chainId: 143,
        status: 4,
      }),
    },
    savingsMarketStatus: {
      readStatus:
        async () => ({
          tvlAssetsAtomic:
            "0",

          suppliedAssetsAtomic:
            "0",

          supplyCapAssetsAtomic:
            null,

          availableToDepositAtomic:
            null,

          availableToWithdrawAtomic:
            "0",

          grossApyBps:
            "0",

          netApyBps:
            "0",
        }),
    },

    moonPay: {
      baseUrl: "https://api.moonpay.example",
      publishableKey: "moonpay-publishable-key",
      secretKey: "moonpay-secret-key",
      webhookKey: "moonpay-webhook-key",
    },

    savingsPerformance: {
      readPerformance:
        async () => ({
          depositedAssetsAtomic:
            "0",

          withdrawnAssetsAtomic:
            "0",

          netContributionsAtomic:
            "0",

          currentAssetsAtomic:
            "0",

          earningsAssetsAtomic:
            "0",
        }),
    },

    ...overrides,
  };
}

const auth = { authorization: "Bearer valid-token" };

describe("Kept HTTP API", () => {
  it("reports health without authentication", async () => {
    const app = buildApp(buildDependencies());
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("accepts public waitlist signups without authentication", async () => {
    const joinWaitlist =
      vi.fn(
        async () => undefined,
      );

    const app =
      buildApp(
        buildDependencies({
          persistence: {
            ...buildDependencies()
              .persistence,
            joinWaitlist,
          },
        }),
      );

    const response =
      await app.inject({
        method: "POST",
        url: "/v1/waitlist",
        payload: {
          email:
            "person@example.com",
        },
      });

    expect(
      response.statusCode,
    ).toBe(204);

    expect(
      joinWaitlist,
    ).toHaveBeenCalledWith({
      email:
        "person@example.com",
    });

    await app.close();
  });

  it("rate limits public waitlist signups by client IP", async () => {
    const app =
      buildApp(
        buildDependencies(),
        {
          waitlistRateLimit: {
            maxRequests: 1,
            windowMs:
              60_000,
          },
        },
      );

    const first =
      await app.inject({
        method: "POST",
        url: "/v1/waitlist",
        headers: {
          "x-forwarded-for":
            "203.0.113.10",
        },
        payload: {
          email:
            "one@example.com",
        },
      });

    const second =
      await app.inject({
        method: "POST",
        url: "/v1/waitlist",
        headers: {
          "x-forwarded-for":
            "203.0.113.10",
        },
        payload: {
          email:
            "two@example.com",
        },
      });

    expect(
      first.statusCode,
    ).toBe(204);

    expect(
      second.statusCode,
    ).toBe(429);

    expect(
      second.json(),
    ).toEqual({
      error: {
        code:
          "RATE_LIMITED",
      },
    });

    await app.close();
  });

  it("bootstraps the authenticated Privy user", async () => {
    const app = buildApp(buildDependencies());
    const response = await app.inject({ method: "GET", url: "/v1/me", headers: auth });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: user.id, privyUserId: user.privyUserId });
    await app.close();
  });

  it("rejects private requests without authentication", async () => {
    const app = buildApp(buildDependencies());
    const response = await app.inject({ method: "GET", url: "/v1/goals" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: { code: "UNAUTHENTICATED" } });
    await app.close();
  });

  it("rejects authenticated users outside the staging allowlist", async () => {
    const app = buildApp(
      buildDependencies(),
      {
        stagingAllowedPrivyUserIds: [
          "did:privy:allowed-user",
        ],
      },
    );

    const response = await app.inject({
      method: "GET",
      url: "/v1/goals",
      headers: auth,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "STAGING_ACCESS_DENIED",
      },
    });

    await app.close();
  });

  it("allows authenticated users on the staging allowlist", async () => {
    const app = buildApp(
      buildDependencies(),
      {
        stagingAllowedPrivyUserIds: [
          user.privyUserId,
        ],
      },
    );

    const response = await app.inject({
      method: "GET",
      url: "/v1/goals",
      headers: auth,
    });

    expect(response.statusCode).toBe(200);

    await app.close();
  });

  it("rejects unauthenticated intents proxy requests", async () => {
    const app = buildApp(
      buildDependencies(),
      {
        webOrigin:
          "https://staging.keptfinance.app",
        auroraIntents: {
          baseUrl:
            "https://intents.example/",
          apiKey:
            "test-key",
        },
      },
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/intents-connect/quote",
      headers: {
        origin:
          "https://staging.keptfinance.app",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "UNAUTHENTICATED",
      },
    });

    await app.close();
  });

  it("rejects intents proxy requests from untrusted origins", async () => {
    const app = buildApp(
      buildDependencies(),
      {
        webOrigin:
          "https://staging.keptfinance.app",
        auroraIntents: {
          baseUrl:
            "https://intents.example/",
          apiKey:
            "test-key",
        },
      },
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/intents-connect/quote",
      headers: {
        ...auth,
        origin:
          "https://attacker.example",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
      },
    });

    await app.close();
  });

  it("rate limits intents proxy requests per client", async () => {
    const originalFetch =
      globalThis.fetch;

    globalThis.fetch =
      vi.fn(async () =>
        new Response("{}", {
          status: 200,
          headers: {
            "content-type":
              "application/json",
          },
        }),
      ) as typeof fetch;

    try {
      const app = buildApp(
        buildDependencies(),
        {
          webOrigin:
            "https://staging.keptfinance.app",
          intentsProxyRateLimit: {
            maxRequests: 1,
            windowMs: 60_000,
          },
          auroraIntents: {
            baseUrl:
              "https://intents.example/",
            apiKey:
              "test-key",
          },
        },
      );

      const first = await app.inject({
        method: "GET",
        url: "/api/intents-connect/quote",
        headers: {
          ...auth,
          origin:
            "https://staging.keptfinance.app",
          "x-forwarded-for":
            "203.0.113.10",
        },
      });

      expect(first.statusCode).toBe(200);

      const second = await app.inject({
        method: "GET",
        url: "/api/intents-connect/quote",
        headers: {
          ...auth,
          origin:
            "https://staging.keptfinance.app",
          "x-forwarded-for":
            "203.0.113.10",
        },
      });

      expect(second.statusCode).toBe(429);
      expect(second.headers["retry-after"])
        .toBeDefined();
      expect(second.json()).toEqual({
        error: {
          code: "RATE_LIMITED",
        },
      });

      await app.close();
    } finally {
      globalThis.fetch =
        originalFetch;
    }
  });

  it("returns the aggregated dashboard read model in one authenticated request", async () => {
    const dependencies = buildDependencies();

    const listGoals = vi.spyOn(
      dependencies.persistence,
      "listGoals",
    );

    const listCommitments = vi.spyOn(
      dependencies.persistence,
      "listCommitments",
    );

    const getGoalAllocation = vi.spyOn(
      dependencies.persistence,
      "getGoalAllocation",
    );

    const readPerformance = vi.spyOn(
      dependencies.savingsPerformance,
      "readPerformance",
    );

    const readStatus = vi.spyOn(
      dependencies.savingsMarketStatus,
      "readStatus",
    );

    const app = buildApp(
      dependencies,
    );

    const response = await app.inject({
      method: "GET",
      url: "/v1/dashboard",
      headers: auth,
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      goals: [goal],
      commitments: [commitment],
      allocations: {
        [goal.id]: {
          goalId: goal.id,
          allocatedSharesAtomic: "0",
          totalVaultSharesAtomic: "0",
          totalAllocatedSharesAtomic: "0",
          unallocatedSharesAtomic: "0",
        },
      },
      savings: {
        performance: {
          kind: "ready",
          data: {
            depositedAssetsAtomic: "0",
            withdrawnAssetsAtomic: "0",
            netContributionsAtomic: "0",
            currentAssetsAtomic: "0",
            earningsAssetsAtomic: "0",
          },
        },
        marketStatus: {
          kind: "ready",
          data: {
            tvlAssetsAtomic: "0",
            suppliedAssetsAtomic: "0",
            supplyCapAssetsAtomic: null,
            availableToDepositAtomic: null,
            availableToWithdrawAtomic: "0",
            grossApyBps: "0",
            netApyBps: "0",
          },
        },
      },
    });

    expect(listGoals).toHaveBeenCalledTimes(1);
    expect(listCommitments).toHaveBeenCalledTimes(1);
    expect(getGoalAllocation).toHaveBeenCalledTimes(1);
    expect(readPerformance).toHaveBeenCalledTimes(1);
    expect(readStatus).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("returns authenticated MoonPay client parameters", async () => {
    const app = buildApp(buildDependencies());
    const allowedIp = await app.inject({
      method: "GET",
      url: "/v1/moonpay/allowed-ip",
      headers: {
        ...auth,
        "cf-connecting-ip": "198.51.100.4",
        "x-forwarded-for": "10.0.0.8, 10.0.0.1",
      },
    });
    expect(allowedIp.statusCode).toBe(200);
    expect(allowedIp.json()).toEqual({
      allowedIpAddress: "198.51.100.4",
    });

    const url = "https://widget.moonpay.example/?apiKey=key&currencyCode=usd";
    const signature = await app.inject({
      method: "POST",
      url: "/v1/moonpay/sign",
      headers: auth,
      payload: { url },
    });
    expect(signature.statusCode).toBe(200);
    expect(signature.json()).toEqual({
      signature: createHmac("sha256", "moonpay-secret-key")
        .update(new URL(url).search)
        .digest("base64"),
    });
    await app.close();
  });

  it("creates a persistent MoonPay off-ramp order and correlates the widget URL", async () => {
    const dependencies = buildDependencies();
    const app = buildApp(dependencies, { webOrigin: "https://kept.example" });
    const response = await app.inject({
      method: "POST",
      url: "/v1/moonpay/offramp-url",
      headers: {
        ...auth,
        "cf-connecting-ip": "198.51.100.4",
        "x-forwarded-for": "10.0.0.8",
      },
      payload: { amount: "20.00" },
    });

    expect(response.statusCode).toBe(200);

    const result = response.json<{ url: string; orderId: string }>();
    const parsed = new URL(result.url);

    expect(result.orderId).toBe("moonpay-order-1");
    expect(dependencies.persistence.createMoonPayOfframpOrder).toHaveBeenCalledWith({
      userId: user.id,
      amountAtomic: "20000000",
    });
    expect(parsed.searchParams.get("baseCurrencyCode")).toBe("usdc_base");
    expect(parsed.searchParams.get("baseCurrencyAmount")).toBe("20.00");
    expect(parsed.searchParams.get("lockAmount")).toBe("true");
    expect(parsed.searchParams.get("apiKey")).toBe("moonpay-publishable-key");
    expect(parsed.searchParams.get("externalTransactionId")).toBe("moonpay-order-1");
    expect(parsed.searchParams.get("redirectURL")).toBe(
      "https://kept.example/dashboard?moonpayOrderId=moonpay-order-1",
    );
    expect(parsed.searchParams.get("allowedIpAddress")).toBe(
      "198.51.100.4",
    );

    const unsignedUrl = new URL(parsed);
    unsignedUrl.searchParams.delete("signature");

    expect(parsed.searchParams.get("signature")).toBe(
      createHmac("sha256", "moonpay-secret-key")
        .update(unsignedUrl.search)
        .digest("base64"),
    );

    await app.close();
  });

  it("returns MoonPay off-ramp order state only through authenticated ownership", async () => {
    const dependencies = buildDependencies();
    const app = buildApp(dependencies);
    const response = await app.inject({
      method: "GET",
      url: "/v1/moonpay/offramp-orders/moonpay-order-1",
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "moonpay-order-1",
      status: "pending_widget",
      baseCurrencyCode: "usdc_base",
      depositWalletAddress: null,
    });
    expect(dependencies.persistence.getMoonPayOfframpOrder).toHaveBeenCalledWith(
      user.id,
      "moonpay-order-1",
    );

    await app.close();
  });

  it("stores the Base deposit address only from a valid signed MoonPay webhook", async () => {
    const dependencies = buildDependencies();
    const app = buildApp(dependencies);
    const body = JSON.stringify({
      type: "sell_transaction_created",
      data: {
        id: "moonpay-transaction-1",
        externalTransactionId: "moonpay-order-1",
        baseCurrency: { code: "usdc_base" },
        depositWallet: {
          walletAddress: "0x00000000000000000000000000000000000000A1",
        },
      },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", "moonpay-webhook-key")
      .update(`${timestamp}.${body}`)
      .digest("hex");

    const response = await app.inject({
      method: "POST",
      url: "/v1/moonpay/webhook",
      headers: {
        "content-type": "application/json",
        "moonpay-signature-v2": `t=${timestamp},s=${signature}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(204);
    expect(dependencies.persistence.recordMoonPayOfframpWebhook).toHaveBeenCalledWith({
      orderId: "moonpay-order-1",
      moonPayTransactionId: "moonpay-transaction-1",
      baseCurrencyCode: "usdc_base",
      depositWalletAddress: "0x00000000000000000000000000000000000000A1",
      depositWalletTag: null,
      status: "ready",
    });

    await app.close();
  });

  it("marks a verified owned MoonPay order as funds sent", async () => {
    const dependencies = buildDependencies();
    await dependencies.persistence.recordMoonPayOfframpWebhook({
      orderId: "moonpay-order-1",
      moonPayTransactionId: "moonpay-transaction-1",
      baseCurrencyCode: "usdc_base",
      depositWalletAddress: "0x00000000000000000000000000000000000000A1",
      status: "ready",
    });

    const app = buildApp(dependencies);
    const response = await app.inject({
      method: "POST",
      url: "/v1/moonpay/offramp-orders/moonpay-order-1/submitted",
      headers: auth,
      payload: { transferReference: "aurora-execution-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "moonpay-order-1",
      status: "funds_sent",
      transferReference: "aurora-execution-1",
    });
    expect(dependencies.persistence.markMoonPayOfframpFundsSent).toHaveBeenCalledWith({
      userId: user.id,
      orderId: "moonpay-order-1",
      transferReference: "aurora-execution-1",
    });

    await app.close();
  });

  it("does not expose MoonPay routes when fiat is disabled", async () => {
    const {
      moonPay: _moonPay,
      ...dependencies
    } = buildDependencies();

    const app =
      buildApp(dependencies);

    const response =
      await app.inject({
        method: "GET",
        url: "/v1/moonpay/allowed-ip",
        headers: auth,
      });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it("rejects MoonPay webhooks with an invalid signature", async () => {
    const dependencies = buildDependencies();
    const app = buildApp(dependencies);
    const response = await app.inject({
      method: "POST",
      url: "/v1/moonpay/webhook",
      headers: {
        "content-type": "application/json",
        "moonpay-signature-v2": "t=1,s=deadbeef",
      },
      payload: JSON.stringify({ type: "sell_transaction_created", data: {} }),
    });

    expect(response.statusCode).toBe(401);
    expect(dependencies.persistence.recordMoonPayOfframpWebhook).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects unauthenticated Solana balance requests", async () => {
    const app = buildApp(
      buildDependencies(),
      { solanaRpc: { url: "https://helius.example" } },
    );
    const response = await app.inject({
      method: "POST",
      url: "/v1/funding/solana/token-balances",
      payload: { owner: "6NZH4e4r9dVGtp22mWmF7uMbdt6h9f9gCw6U5jrw6EFg" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: { code: "UNAUTHENTICATED" } });
    await app.close();
  });

  it("returns normalized Solana balances for an authenticated funding request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { value: 123456789 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        result: {
          value: [{
            account: {
              data: {
                parsed: {
                  info: {
                    mint: "Es9vMFrzaCERmJfrF4H2FYD2CuPCdTu29PP4nXGkQQX",
                    tokenAmount: { amount: "2500000" },
                  },
                },
              },
            },
          }],
        },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const app = buildApp(
      buildDependencies(),
      { solanaRpc: { url: "https://helius.example" } },
    );
    const response = await app.inject({
      method: "POST",
      url: "/v1/funding/solana/token-balances",
      headers: auth,
      payload: { owner: "6NZH4e4r9dVGtp22mWmF7uMbdt6h9f9gCw6U5jrw6EFg" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      nativeBalance: "123456789",
      balances: { Es9vMFrzaCERmJfrF4H2FYD2CuPCdTu29PP4nXGkQQX: "2500000" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await app.close();
    vi.unstubAllGlobals();
  });

  it("lists and reads goals", async () => {
    const app = buildApp(buildDependencies());
    const list = await app.inject({ method: "GET", url: "/v1/goals", headers: auth });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([goal]);

    const one = await app.inject({ method: "GET", url: `/v1/goals/${goal.id}`, headers: auth });
    expect(one.statusCode).toBe(200);
    expect(one.json()).toEqual(goal);
    await app.close();
  });

  it("lists and records account transactions for the authenticated user", async () => {
    const transaction = {
      id: "transaction-1",
      type: "savings_deposit" as const,
      status: "completed" as const,
      amountAtomic: "25000000",
      asset: "USDC",
      description: "Added to savings",
      goalId: goal.id,
      chainId: "143",
      transactionHash: "0xdeposit",
      externalReference: "0xdeposit",
      createdAt: "2026-09-30T00:00:00.000Z",
    };
    const dependencies = buildDependencies();
    const listTransactions = vi.spyOn(dependencies.persistence, "listTransactions")
      .mockResolvedValueOnce([transaction]);
    const recordTransaction = vi.spyOn(dependencies.persistence, "recordTransaction");
    const app = buildApp(dependencies);

    const list = await app.inject({
      method: "GET",
      url: "/v1/account/transactions",
      headers: auth,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([transaction]);
    expect(listTransactions).toHaveBeenCalledWith(user.id);

    const created = await app.inject({
      method: "POST",
      url: "/v1/account/transactions",
      headers: { ...auth, "idempotency-key": "transaction-key" },
      payload: {
        type: "SAVINGS_DEPOSIT",
        amountAtomic: "25000000",
        asset: "USDC",
        description: "Added to savings",
        goalId: goal.id,
        chainId: "143",
        transactionHash: "0xdeposit",
        externalReference: "0xdeposit",
      },
    });

    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      amountAtomic: "25000000",
      type: "savings_deposit",
    });
    expect(recordTransaction).toHaveBeenCalledWith({
      userId: user.id,
      idempotencyKey: "transaction-key",
      type: "SAVINGS_DEPOSIT",
      amountAtomic: "25000000",
      asset: "USDC",
      description: "Added to savings",
      goalId: goal.id,
      chainId: 143n,
      transactionHash: "0xdeposit",
      externalReference: "0xdeposit",
    });

    await app.close();
  });

  it("creates a goal with an idempotency key", async () => {
    const app = buildApp(buildDependencies());
    const response = await app.inject({
      method: "POST",
      url: "/v1/goals",
      headers: { ...auth, "idempotency-key": "goal-key" },
      payload: { name: "Laptop", targetAmountAtomic: "1000000000", targetDate: null },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(goal);
    await app.close();
  });

  it("archives a goal with the authenticated user and idempotency key", async () => {
    const dependencies = buildDependencies();

    const archiveGoal = vi.spyOn(
      dependencies.persistence,
      "archiveGoal",
    );

    const app = buildApp(dependencies);

    const response = await app.inject({
      method: "POST",
      url: `/v1/goals/${goal.id}/archive`,
      headers: {
        ...auth,
        "idempotency-key": "archive-goal-key",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      ...goal,
      status: "ARCHIVED",
    });

    expect(archiveGoal).toHaveBeenCalledOnce();

    expect(archiveGoal).toHaveBeenCalledWith({
      userId: user.id,
      goalId: goal.id,
      idempotencyKey: "archive-goal-key",
    });

    await app.close();
  });

  it("does not allow the request body to override goal archive ownership", async () => {
    const dependencies = buildDependencies();

    const archiveGoal = vi.spyOn(
      dependencies.persistence,
      "archiveGoal",
    );

    const app = buildApp(dependencies);

    const response = await app.inject({
      method: "POST",
      url: `/v1/goals/${goal.id}/archive`,
      headers: {
        ...auth,
        "idempotency-key": "archive-owner-key",
      },
      payload: {
        userId: "attacker-user",
        walletAddress:
          "0x9999999999999999999999999999999999999999",
      },
    });

    expect(response.statusCode).toBe(200);

    expect(archiveGoal).toHaveBeenCalledWith({
      userId: user.id,
      goalId: goal.id,
      idempotencyKey: "archive-owner-key",
    });

    await app.close();
  });

  it("lists, creates, activates, and cancels commitments", async () => {
    const app = buildApp(buildDependencies());

    const list = await app.inject({ method: "GET", url: "/v1/commitments", headers: auth });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([commitment]);

    const created = await app.inject({
      method: "POST",
      url: "/v1/commitments",
      headers: { ...auth, "idempotency-key": "commitment-key" },
      payload: {
        goalId: goal.id,
        definition: commitment.definition,
        parameters: commitment.parameters,
        epochStart: commitment.epochStart,
        epochEnd: commitment.epochEnd,
        verificationDeadline: commitment.verificationDeadline,
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toEqual(commitment);

    const activated = await app.inject({
      method: "POST",
      url: `/v1/commitments/${commitment.id}/activate`,
      headers: { ...auth, "idempotency-key": "activate-key" },
      payload: {
        expectedVersion: 1,
        onchainCommitmentId: "7",
        transactionHash: `0x${"a".repeat(64)}`,
      },
    });
    expect(activated.statusCode).toBe(200);
    expect(activated.json()).toMatchObject({ state: "ACTIVE", stateVersion: 2 });

    const cancelled = await app.inject({
      method: "POST",
      url: `/v1/commitments/${commitment.id}/cancel`,
      headers: { ...auth, "idempotency-key": "cancel-key" },
      payload: {
        expectedVersion: 2,
        onchainCommitmentId: "7",
        owner: "0x0000000000000000000000000000000000000002",
      },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({ state: "CANCELLED", stateVersion: 3 });

    const retriedCancellation = await app.inject({
      method: "POST",
      url: `/v1/commitments/${commitment.id}/cancel`,
      headers: { ...auth, "idempotency-key": "cancel-key" },
      payload: {
        expectedVersion: 2,
        onchainCommitmentId: "7",
        owner: "0x0000000000000000000000000000000000000002",
      },
    });
    expect(retriedCancellation.statusCode).toBe(200);
    expect(retriedCancellation.json()).toEqual(cancelled.json());
    await app.close();
  });

  it("requires idempotency keys for writes", async () => {
    const app = buildApp(buildDependencies());
    const response = await app.inject({
      method: "POST",
      url: "/v1/goals",
      headers: auth,
      payload: { name: "Laptop", targetAmountAtomic: "1000000000", targetDate: null },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });

  it("requires an idempotency key when archiving a goal", async () => {
    const dependencies = buildDependencies();

    const archiveGoal = vi.spyOn(
      dependencies.persistence,
      "archiveGoal",
    );

    const app = buildApp(dependencies);

    const response = await app.inject({
      method: "POST",
      url: `/v1/goals/${goal.id}/archive`,
      headers: auth,
      payload: {},
    });

    expect(response.statusCode).toBe(400);

    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
      },
    });

    expect(archiveGoal).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns not found when the goal cannot be archived for the authenticated user", async () => {
    const dependencies = buildDependencies();

    vi.spyOn(
      dependencies.persistence,
      "archiveGoal",
    ).mockRejectedValue(
      new NotFoundError("Savings goal"),
    );

    const app = buildApp(dependencies);

    const response = await app.inject({
      method: "POST",
      url: "/v1/goals/missing-goal/archive",
      headers: {
        ...auth,
        "idempotency-key": "archive-missing-key",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(404);

    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
      },
    });

    await app.close();
  });

  it("returns validation error when an active commitment still blocks goal archival", async () => {
    const dependencies = buildDependencies();

    vi.spyOn(
      dependencies.persistence,
      "archiveGoal",
    ).mockRejectedValue(
      new PersistenceValidationError(
        "Active commitment must be cancelled before the goal can be archived",
      ),
    );

    const app = buildApp(dependencies);

    const response = await app.inject({
      method: "POST",
      url: `/v1/goals/${goal.id}/archive`,
      headers: {
        ...auth,
        "idempotency-key":
          "archive-active-commitment",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(400);

    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
      },
    });

    await app.close();
  });

  it("allows browser reads and writes from the configured Kept web origin", async () => {
    const app = buildApp(buildDependencies(), { webOrigin: "http://localhost:5173" });
    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/goals",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type,idempotency-key",
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    await app.close();
  });

  it("does not activate API state when confirmed chain state does not match", async () => {
    const app = buildApp(buildDependencies({
      commitmentSettlementVerifier: {
        inspect: async () => ({
          settlementRef: new Uint8Array(32),
          owner: "0x2222222222222222222222222222222222222222",
          chainId: 143,
          status: 1,
        }),
        verifyActive: async () => {
          throw new CommitmentSettlementMismatchError("reference mismatch");
        },
        verifyCancelled: async () => ({
          settlementRef: new Uint8Array(32),
          owner: "0x2222222222222222222222222222222222222222",
          chainId: 143,
          status: 4,
        }),
      },
    }));
    const response = await app.inject({
      method: "POST",
      url: `/v1/commitments/${commitment.id}/activate`,
      headers: { ...auth, "idempotency-key": "activate-mismatch" },
      payload: {
        expectedVersion: 1,
        onchainCommitmentId: "7",
        transactionHash: `0x${"a".repeat(64)}`,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: { code: "COMMITMENT_SETTLEMENT_MISMATCH" },
    });
    await app.close();
  });

  it("does not cancel API state until the contract is cancelled", async () => {
    const app = buildApp(buildDependencies({
      commitmentSettlementVerifier: {
        inspect: async () => ({
          settlementRef: new Uint8Array(32),
          owner: "0x2222222222222222222222222222222222222222",
          chainId: 143,
          status: 1,
        }),
        verifyActive: async () => ({
          settlementRef: new Uint8Array(32),
          owner: "0x2222222222222222222222222222222222222222",
          chainId: 143,
          status: 1,
        }),
        verifyCancelled: async () => {
          throw new CommitmentSettlementMismatchError("contract is still active");
        },
      },
    }));
    await app.inject({
      method: "POST",
      url: `/v1/commitments/${commitment.id}/activate`,
      headers: { ...auth, "idempotency-key": "activate-before-cancel" },
      payload: {
        expectedVersion: 1,
        onchainCommitmentId: "7",
        transactionHash: `0x${"a".repeat(64)}`,
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/commitments/${commitment.id}/cancel`,
      headers: { ...auth, "idempotency-key": "cancel-still-active" },
      payload: {
        expectedVersion: 2,
        onchainCommitmentId: "7",
        owner: "0x0000000000000000000000000000000000000002",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: { code: "COMMITMENT_SETTLEMENT_MISMATCH" },
    });
    await app.close();
  });

  it("reconciles a terminal onchain status before returning commitments", async () => {
    const dependencies = buildDependencies();
    const inspect = vi.fn()
      .mockResolvedValueOnce({
        settlementRef: new Uint8Array(32),
        owner: "0x2222222222222222222222222222222222222222",
        chainId: 143,
        status: 4,
      })
      .mockResolvedValue({
        settlementRef: new Uint8Array(32),
        owner: "0x2222222222222222222222222222222222222222",
        chainId: 143,
        status: 1,
      });
    const app = buildApp({
      ...dependencies,
      commitmentSettlementVerifier: {
        ...dependencies.commitmentSettlementVerifier!,
        inspect,
      },
    });
    await app.inject({
      method: "POST",
      url: `/v1/commitments/${commitment.id}/activate`,
      headers: { ...auth, "idempotency-key": "activate-before-reconcile" },
      payload: {
        expectedVersion: 1,
        onchainCommitmentId: "7",
        transactionHash: `0x${"a".repeat(64)}`,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/commitments",
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({ state: "CANCELLED", stateVersion: 2 }),
    ]);
    const afterReorg = await app.inject({
      method: "GET",
      url: "/v1/commitments",
      headers: auth,
    });
    expect(afterReorg.json()).toEqual([
      expect.objectContaining({ state: "ACTIVE", stateVersion: 2 }),
    ]);
    await app.close();
  });
  it("calculates indexed savings earnings from one confirmed block snapshot", async () => {
    const wallet =
      "0x0000000000000000000000000000000000000001";

    const snapshotBlock = 120n;

    const readAccountActivity = vi.fn(
      async (
        _account: string,
        throughBlock?: bigint,
      ) =>
        throughBlock === snapshotBlock
          ? {
            depositedAssets: 100_000_000n,
            withdrawnAssets: 50_000_000n,
            netAssets: 50_000_000n,
          }
          : {
            depositedAssets: 100_000_000n,
            withdrawnAssets: 0n,
            netAssets: 100_000_000n,
          },
    );

    const readCurrentAssets = vi.fn(
      async (
        _account: string,
        atBlock?: bigint,
      ) =>
        atBlock === snapshotBlock
          ? 60_000_000n
          : 10_000_000n,
    );

    const app = buildApp(
      buildDependencies({
        chainId: 10_143,
        savingsCurrentAssets: {
          read: readCurrentAssets,
        },
        savingsActivityIndex: {
          isReady: () => true,
          status: () => ({
            ready: true,
            startBlock: 1n,
            currentBlock: snapshotBlock,
            targetBlock: 122n,
            progressPercent: 100,
          }),
          readAccountActivity,
        },
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/v1/savings/performance",
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      depositedAssetsAtomic: "100000000",
      withdrawnAssetsAtomic: "50000000",
      netContributionsAtomic: "50000000",
      currentAssetsAtomic: "60000000",
      earningsAssetsAtomic: "10000000",
    });

    expect(readAccountActivity)
      .toHaveBeenCalledWith(
        wallet,
        snapshotBlock,
      );

    expect(readCurrentAssets)
      .toHaveBeenCalledWith(
        wallet,
        snapshotBlock,
      );

    await app.close();
  });

});
