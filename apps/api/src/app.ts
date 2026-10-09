import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import type { Hex } from "viem";

import { Transform } from "node:stream";

import cors from "@fastify/cors";

import {
  IdempotencyConflictError,
  IncompleteIdempotencyRecordError,
  NotFoundError,
  PersistenceValidationError,
} from "./persistence/errors.js";

import type { KeptPersistenceService, UserDto } from "./persistence/index.js";

import {
  parseMoonPaySellWebhook,
  parseUsdcAmountToAtomic,
  verifyMoonPayWebhookSignature,
} from "./moonpay-offramp.js";

import type { JsonValue } from "./domain/commitments/index.js";

import {
  CommitmentSettlementMismatchError,
  CommitmentSettlementUnavailableError,
  type CommitmentSettlementVerifier,
} from "./commitment-settlement.js";

import type {
  SavingsPerformanceDto,
  SavingsPerformanceReader,
} from "./savings-performance.js";

import type { SavingsMarketStatusReader } from "./savings-market-status.js";

import {
  createHmac,
} from "node:crypto";

import {
  isIP,
} from "node:net";

export interface AuthenticatedIdentity {
  readonly privyUserId: string;

  readonly wallet: string | null;
}

export interface ApiDependencies {
  readonly chainId: number;

  readonly resendWaitlist?: (email: string) => Promise<void>;

  readonly authenticate: (
    authorization: string | undefined,
  ) => Promise<AuthenticatedIdentity | null>;

  readonly persistence: Pick<
    KeptPersistenceService,
    | "joinWaitlist"
    | "createUser"
    | "ensureEmbeddedWallet"
    | "createGoal"
    | "getGoal"
    | "listGoals"
    | "archiveGoal"
    | "getGoalAllocation"
    | "listGoalActivity"
    | "allocateGoalShares"
    | "reallocateGoalShares"
    | "createCommitmentDraft"
    | "getCommitment"
    | "listCommitments"
    | "activateCommitment"
    | "cancelCommitment"
    | "listTransactions"
    | "recordTransaction"
    | "createMoonPayOfframpOrder"
    | "getMoonPayOfframpOrder"
    | "recordMoonPayOfframpWebhook"
    | "markMoonPayOfframpFundsSent"
  > & Partial<Pick<KeptPersistenceService, "getDashboardGoalAllocations">>;

  readonly commitmentSettlementVerifier?: CommitmentSettlementVerifier;

  readonly savingsPerformance: SavingsPerformanceReader;

  readonly savingsCurrentAssets?: {
    readonly read: (
      account: string,
      blockNumber?: bigint,
    ) => Promise<bigint>;
  };

  readonly savingsActivityIndex?: {
    readonly isReady: () => boolean;
    readonly status: () => {
      readonly ready: boolean;
      readonly startBlock: bigint | null;
      readonly currentBlock: bigint | null;
      readonly targetBlock: bigint | null;
      readonly progressPercent: number | null;
    };
    readonly readAccountActivity: (
      account: string,
      throughBlock?: bigint,
    ) => Promise<{
      readonly depositedAssets: bigint;
      readonly withdrawnAssets: bigint;
      readonly netAssets: bigint;
    }>;
  };

  readonly savingsMarketStatus: SavingsMarketStatusReader;

  readonly stagingFaucet?: {
    readonly claim: (
      wallet: string,
    ) => Promise<{
      readonly amountAtomic: string;
      readonly transactionHash: Hex;
    }>;
  };

  readonly moonPay?: {
    readonly baseUrl: string;
    readonly publishableKey: string;
    readonly secretKey: string;
    readonly webhookKey: string;
  };
}

export interface BuildAppOptions {
  readonly enableLogging?: boolean;
  readonly webOrigin?: string;
  readonly stagingAllowedPrivyUserIds?: readonly string[] | null;
  readonly intentsProxyRateLimit?: {
    readonly maxRequests: number;
    readonly windowMs: number;
  };
  readonly waitlistRateLimit?: {
    readonly maxRequests: number;
    readonly windowMs: number;
  };

  readonly auroraIntents?: {
    readonly baseUrl: string;
    readonly apiKey: string;
  };
  readonly solanaRpc?: {
    readonly url: string;
  };
}

function canonicalizeClientIp(
  rawIp: string,
): string {
  let ip =
    rawIp.trim();

  if (
    ip.startsWith("[")
  ) {
    const closingBracket =
      ip.indexOf("]");

    if (
      closingBracket > 0
    ) {
      ip =
        ip.slice(
          1,
          closingBracket,
        );
    }
  } else {
    const ipv4WithPort =
      ip.match(
        /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/,
      );

    if (
      ipv4WithPort?.[1]
    ) {
      ip =
        ipv4WithPort[1];
    }
  }

  if (
    ip.toLowerCase()
      .startsWith(
        "::ffff:",
      )
  ) {
    const mapped =
      ip.slice(7);

    if (
      isIP(mapped) === 4
    ) {
      return mapped;
    }
  }

  if (
    isIP(ip) === 0
  ) {
    throw new PersistenceValidationError(
      "Invalid client IP address",
    );
  }

  return ip.toLowerCase();
}

function getCustomerIp(
  request: FastifyRequest,
): string {
  const cloudflareClientIp =
    request.headers["cf-connecting-ip"];

  if (
    typeof cloudflareClientIp
    === "string"
  ) {
    return canonicalizeClientIp(
      cloudflareClientIp,
    );
  }

  const trueClientIp =
    request.headers["true-client-ip"];

  if (typeof trueClientIp === "string") {
    return canonicalizeClientIp(
      trueClientIp,
    );
  }

  const forwardedFor =
    request.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string") {
    const first =
      forwardedFor
        .split(",")[0]
        ?.trim();

    if (first) {
      return canonicalizeClientIp(
        first,
      );
    }
  }

  return canonicalizeClientIp(
    request.ip,
  );
}

function allowedWebOrigins(webOrigin: string): string[] {
  const origins = webOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.includes("http://localhost:5173")) {
    origins.push("http://127.0.0.1:5173");
  }

  return [...new Set(origins)];
}

interface AuthenticatedRequest extends FastifyRequest {
  user: UserDto;

  identity: AuthenticatedIdentity;
}

interface RawBodyRequest extends FastifyRequest {
  rawBody?: string;
}

function asAuthenticatedRequest(request: FastifyRequest): AuthenticatedRequest {
  return request as AuthenticatedRequest;
}

class SavingsHistorySynchronizingError extends Error {
  readonly progressPercent: number | null;
  readonly currentBlock: bigint | null;
  readonly targetBlock: bigint | null;

  constructor(input: {
    readonly progressPercent: number | null;
    readonly currentBlock: bigint | null;
    readonly targetBlock: bigint | null;
  }) {
    super("Savings activity history is still synchronizing");
    this.name = "SavingsHistorySynchronizingError";
    this.progressPercent = input.progressPercent;
    this.currentBlock = input.currentBlock;
    this.targetBlock = input.targetBlock;
  }
}

function isRpcRateLimitError(error: unknown): boolean {
  let current = error;

  for (
    let depth = 0;
    depth < 8
    && current !== null
    && typeof current === "object";
    depth += 1
  ) {
    const record =
      current as Record<string, unknown>;

    const message =
      typeof record.message === "string"
        ? record.message.toLowerCase()
        : "";

    const details =
      typeof record.details === "string"
        ? record.details.toLowerCase()
        : "";

    const code =
      record.code;

    if (
      code === 429
      || code === -32011
      || message.includes("rate limit")
      || message.includes("requests limited to")
      || details.includes("rate limit")
      || details.includes("requests limited to")
    ) {
      return true;
    }

    current =
      "cause" in record
        ? record.cause
        : null;
  }

  return false;
}

function sendError(
  request: FastifyRequest,

  error: unknown,
): {
  readonly statusCode: number;

  readonly body: {
    readonly error: {
      readonly code: string;
      readonly progressPercent?: number | null;
      readonly currentBlock?: string | null;
      readonly targetBlock?: string | null;
    };
  };
} {
  if (error instanceof NotFoundError) {
    request.log.warn(
      { err: error, errorCode: "NOT_FOUND" },
      "API request rejected",
    );

    return { statusCode: 404, body: { error: { code: "NOT_FOUND" } } };
  }

  if (error instanceof PersistenceValidationError) {
    request.log.warn(
      { err: error, errorCode: "VALIDATION_ERROR" },
      "API request rejected",
    );

    return { statusCode: 400, body: { error: { code: "VALIDATION_ERROR" } } };
  }

  if (error instanceof IdempotencyConflictError) {
    request.log.warn(
      { err: error, errorCode: "IDEMPOTENCY_CONFLICT" },
      "API request rejected",
    );

    return {
      statusCode: 409,
      body: { error: { code: "IDEMPOTENCY_CONFLICT" } },
    };
  }

  if (error instanceof IncompleteIdempotencyRecordError) {
    request.log.warn(
      { err: error, errorCode: "REQUEST_IN_PROGRESS" },
      "API request rejected",
    );

    return {
      statusCode: 409,
      body: { error: { code: "REQUEST_IN_PROGRESS" } },
    };
  }

  if (error instanceof CommitmentSettlementMismatchError) {
    request.log.warn(
      { err: error, errorCode: "COMMITMENT_SETTLEMENT_MISMATCH" },

      "API request rejected",
    );

    return {
      statusCode: 409,

      body: { error: { code: "COMMITMENT_SETTLEMENT_MISMATCH" } },
    };
  }

  if (error instanceof CommitmentSettlementUnavailableError) {
    request.log.error(error, "commitment settlement verification unavailable");

    return {
      statusCode: 503,

      body: { error: { code: "SERVICE_UNAVAILABLE" } },
    };
  }

  if (error instanceof SavingsHistorySynchronizingError) {
    request.log.info(
      {
        errorCode: "SAVINGS_HISTORY_SYNCHRONIZING",
        progressPercent: error.progressPercent,
        currentBlock: error.currentBlock?.toString() ?? null,
        targetBlock: error.targetBlock?.toString() ?? null,
      },
      "Savings activity history is synchronizing",
    );

    return {
      statusCode: 503,

      body: {
        error: {
          code: "SAVINGS_HISTORY_SYNCHRONIZING",
          progressPercent: error.progressPercent,
          currentBlock: error.currentBlock?.toString() ?? null,
          targetBlock: error.targetBlock?.toString() ?? null,
        },
      },
    };
  }

  if (isRpcRateLimitError(error)) {
    request.log.info(
      { errorCode: "RPC_RATE_LIMITED" },
      "Monad RPC rate limit reached",
    );

    return {
      statusCode: 503,
      body: {
        error: {
          code: "RPC_RATE_LIMITED",
        },
      },
    };
  }

  request.log.error(error, "unhandled API error");

  return { statusCode: 500, body: { error: { code: "INTERNAL_ERROR" } } };
}

function requireObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new PersistenceValidationError("request body must be an object");
  }

  return body as Record<string, unknown>;
}

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];

  if (typeof value !== "string") {
    throw new PersistenceValidationError(`${key} must be a string`);
  }

  return value;
}

function requireInteger(body: Record<string, unknown>, key: string): number {
  const value = body[key];

  if (!Number.isSafeInteger(value)) {
    throw new PersistenceValidationError(`${key} must be a safe integer`);
  }

  return value as number;
}

function requireSignedAtomicShareDelta(
  body: Record<string, unknown>,
  key: string,
): string {
  const value = requireString(body, key);

  if (!/^-?\d{1,78}$/.test(value) || BigInt(value) === 0n) {
    throw new PersistenceValidationError(
      `${key} must be a non-zero signed integer`,
    );
  }

  return value;
}

function requireIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];

  if (typeof value !== "string" || !value.trim()) {
    throw new PersistenceValidationError("idempotency-key header is required");
  }

  return value;
}

function optionalString(
  body: Record<string, unknown>,
  key: string,
): string | null {
  const value =
    body[key];

  if (
    value === undefined
    || value === null
  ) {
    return null;
  }

  if (
    typeof value !== "string"
  ) {
    throw new PersistenceValidationError(
      `${key} must be a string`,
    );
  }

  return value;
}

function requirePositiveAtomicAmount(
  body: Record<string, unknown>,
  key: string,
): string {
  const value =
    requireString(
      body,
      key,
    );

  if (
    !/^\d{1,78}$/.test(value)
    || BigInt(value) <= 0n
  ) {
    throw new PersistenceValidationError(
      `${key} must be a positive integer`,
    );
  }

  return value;
}

const CLIENT_TRANSACTION_TYPES = [
  "SAVINGS_DEPOSIT",
  "SAVINGS_WITHDRAWAL",
  "CRYPTO_WITHDRAWAL",
  "FIAT_WITHDRAWAL",
] as const;

type ClientTransactionType =
  typeof CLIENT_TRANSACTION_TYPES[number];

function requireClientTransactionType(
  body: Record<string, unknown>,
): ClientTransactionType {
  const value =
    requireString(
      body,
      "type",
    );

  if (
    !CLIENT_TRANSACTION_TYPES.includes(
      value as ClientTransactionType,
    )
  ) {
    throw new PersistenceValidationError(
      "transaction type is invalid",
    );
  }

  return value as ClientTransactionType;
}

async function settlementRequest<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof CommitmentSettlementMismatchError ||
      error instanceof CommitmentSettlementUnavailableError
    ) {
      throw error;
    }

    throw new CommitmentSettlementUnavailableError();
  }
}

async function handle<T>(
  request: FastifyRequest,

  reply: { code(statusCode: number): { send(body: unknown): unknown } },

  operation: () => Promise<T>,
): Promise<T | unknown> {
  try {
    return await operation();
  } catch (error) {
    const result = sendError(request, error);

    return reply.code(result.statusCode).send(result.body);
  }
}

const SAVINGS_PERFORMANCE_CACHE_TTL_MS = 5_000;

const SAVINGS_MARKET_STATUS_CACHE_TTL_MS = 15_000;

export function buildApp(
  dependencies: ApiDependencies,

  options: BuildAppOptions = {},
): FastifyInstance {
  const waitlistRequests =
    new Map<
      string,
      {
        count: number;
        resetAt: number;
      }
    >();

  const waitlistRateLimit =
    options.waitlistRateLimit
    ?? {
      maxRequests: 10,
      windowMs:
        60 * 60 * 1_000,
    };

  const savingsPerformanceCache =
    new Map<
      string,
      {
        readonly expiresAt: number;
        readonly promise: Promise<SavingsPerformanceDto>;
      }
    >();

  let savingsMarketStatusCache: {
    readonly expiresAt: number;
    readonly promise: ReturnType<
      SavingsMarketStatusReader["readStatus"]
    >;
  } | null = null;

  const readSavingsPerformanceFor =
    async (
      auth: AuthenticatedRequest,
    ): Promise<SavingsPerformanceDto> => {
      if (!auth.identity.wallet) {
        throw new NotFoundError(
          "Privy embedded wallet",
        );
      }

      const cacheKey =
        auth.identity.wallet
          .toLowerCase();

      const now =
        Date.now();

      const cached =
        savingsPerformanceCache
          .get(
            cacheKey,
          );

      if (
        cached
        && cached.expiresAt > now
      ) {
        return cached.promise;
      }

      const nowMilliseconds =
        Math.floor(
          now / 1_000,
        ) * 1_000;

      const promise =
        dependencies.chainId
          === 10_143
        && dependencies
          .savingsCurrentAssets
        && dependencies
          .savingsActivityIndex
          ? (async () => {
            if (
              !dependencies
                .savingsActivityIndex!
                .isReady()
            ) {
              const syncStatus =
                dependencies
                  .savingsActivityIndex!
                  .status();

              throw new SavingsHistorySynchronizingError({
                progressPercent:
                  syncStatus.progressPercent,
                currentBlock:
                  syncStatus.currentBlock,
                targetBlock:
                  syncStatus.targetBlock,
              });
            }

            const snapshotStatus =
              dependencies
                .savingsActivityIndex!
                .status();

            const snapshotBlock =
              snapshotStatus
                .currentBlock;

            if (
              snapshotBlock ===
              null
            ) {
              throw new SavingsHistorySynchronizingError({
                progressPercent:
                  snapshotStatus.progressPercent,
                currentBlock:
                  snapshotStatus.currentBlock,
                targetBlock:
                  snapshotStatus.targetBlock,
              });
            }

            const [
              activity,
              currentAssets,
            ] =
              await Promise.all([
                dependencies
                  .savingsActivityIndex!
                  .readAccountActivity(
                    auth.identity
                      .wallet!,
                    snapshotBlock,
                  ),

                dependencies
                  .savingsCurrentAssets!
                  .read(
                    auth.identity
                      .wallet!,
                    snapshotBlock,
                  ),
              ]);

            const earningsAssets =
              currentAssets
              + activity
                .withdrawnAssets
              - activity
                .depositedAssets;

            return {
              depositedAssetsAtomic:
                activity
                  .depositedAssets
                  .toString(),

              withdrawnAssetsAtomic:
                activity
                  .withdrawnAssets
                  .toString(),

              netContributionsAtomic:
                activity
                  .netAssets
                  .toString(),

              currentAssetsAtomic:
                currentAssets
                  .toString(),

              earningsAssetsAtomic:
                earningsAssets
                  .toString(),
            };
          })()
          : dependencies
            .savingsPerformance
            .readPerformance({
              account:
                auth.identity
                  .wallet,

              startAt:
                new Date(0),

              endAt:
                new Date(
                  nowMilliseconds,
                ),
            });

      savingsPerformanceCache
        .set(
          cacheKey,
          {
            expiresAt:
              now
              + SAVINGS_PERFORMANCE_CACHE_TTL_MS,

            promise,
          },
        );

      try {
        return await promise;
      } catch (error) {
        const current =
          savingsPerformanceCache
            .get(
              cacheKey,
            );

        if (
          current?.promise
            === promise
        ) {
          savingsPerformanceCache
            .delete(
              cacheKey,
            );
        }

        throw error;
      }
    };

  const readSavingsMarketStatus =
    async () => {
      const now =
        Date.now();

      if (
        savingsMarketStatusCache
        && savingsMarketStatusCache
          .expiresAt > now
      ) {
        return savingsMarketStatusCache
          .promise;
      }

      const promise =
        dependencies
          .savingsMarketStatus
          .readStatus();

      savingsMarketStatusCache = {
        expiresAt:
          now
          + SAVINGS_MARKET_STATUS_CACHE_TTL_MS,

        promise,
      };

      try {
        return await promise;
      } catch (error) {
        if (
          savingsMarketStatusCache
            ?.promise === promise
        ) {
          savingsMarketStatusCache =
            null;
        }

        throw error;
      }
    };

  const listReconciledCommitments =
    async (
      userId: string,
    ) => {
      const commitments =
        await dependencies
          .persistence
          .listCommitments(
            userId,
          );

      return Promise.all(
        commitments.map(
          async (
            commitment,
          ) => {
            if (
              commitment.state
                !== "ACTIVE"
              || !commitment
                .onchainCommitmentId
            ) {
              return commitment;
            }

            if (
              !dependencies
                .commitmentSettlementVerifier
            ) {
              throw new CommitmentSettlementUnavailableError();
            }

            const settlement =
              await settlementRequest(
                () =>
                  dependencies
                    .commitmentSettlementVerifier!
                    .inspect({
                      offchainCommitmentId:
                        commitment.id,

                      onchainCommitmentId:
                        commitment
                          .onchainCommitmentId!,

                      startAt:
                        new Date(
                          commitment
                            .epochStart,
                        ),

                      endAt:
                        new Date(
                          commitment
                            .epochEnd,
                        ),
                    }),
              );

            const targetState =
              (
                {
                  2: "COMPLETED",
                  3: "FAILED",
                  4: "CANCELLED",
                } as const
              )[settlement.status as 2 | 3 | 4];

            if (
              settlement.status
                === 1
            ) {
              return commitment;
            }

            if (
              !targetState
            ) {
              throw new CommitmentSettlementMismatchError(
                "Onchain commitment has an invalid active lifecycle status",
              );
            }

            return {
              ...commitment,
              state:
                targetState,
            };
          },
        ),
      );
    };

  const app = Fastify({
    logger: options.enableLogging
      ? { redact: ["req.headers.authorization"] }
      : false,
  });

  const webOrigin = options.webOrigin ?? "http://localhost:5173";

  const allowedOrigins =
    allowedWebOrigins(webOrigin);

  const intentsProxyRateLimit =
    options.intentsProxyRateLimit
    ?? {
      maxRequests: 120,
      windowMs: 60_000,
    };

  const intentsProxyRequests =
    new Map<
      string,
      {
        count: number;
        resetAt: number;
      }
    >();

  app.register(cors, {
    origin: allowedOrigins,

    methods: ["GET", "POST"],

    allowedHeaders: ["authorization", "content-type", "idempotency-key", "ngrok-skip-browser-warning"],
  });

  app.addHook("preParsing", async (request, _reply, payload) => {
    if (
      !dependencies.moonPay
      || !request.url.startsWith("/v1/moonpay/webhook")
    ) {
      return payload;
    }

    const chunks: Buffer[] = [];
    let receivedEncodedLength = 0;

    const transform = new Transform({
      transform(chunk, _encoding, callback) {
        const buffer = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk);

        chunks.push(buffer);
        receivedEncodedLength += buffer.length;
        callback(null, buffer);
      },
      flush(callback) {
        (request as RawBodyRequest).rawBody = Buffer.concat(chunks).toString("utf8");
        callback();
      },
    });

    Object.defineProperty(transform, "receivedEncodedLength", {
      get: () => receivedEncodedLength,
    });

    payload.pipe(transform);
    return transform;
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      error !== null &&
        typeof error === "object" &&
        "statusCode" in error &&
        typeof error.statusCode === "number"
        ? error.statusCode
        : 500;

    if (statusCode === 400) {
      request.log.warn(
        { err: error, errorCode: "VALIDATION_ERROR" },
        "API framework request rejected",
      );

      return reply.code(400).send({ error: { code: "VALIDATION_ERROR" } });
    }

    if (statusCode === 415) {
      request.log.warn(
        { err: error, errorCode: "UNSUPPORTED_MEDIA_TYPE" },
        "API framework request rejected",
      );

      return reply
        .code(415)
        .send({ error: { code: "UNSUPPORTED_MEDIA_TYPE" } });
    }

    if (statusCode === 413) {
      request.log.warn(
        { err: error, errorCode: "PAYLOAD_TOO_LARGE" },
        "API framework request rejected",
      );

      return reply.code(413).send({ error: { code: "PAYLOAD_TOO_LARGE" } });
    }

    request.log.error(error, "unhandled framework error");

    return reply.code(500).send({ error: { code: "INTERNAL_ERROR" } });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: { code: "NOT_FOUND" } }),
  );

  app.get("/health", async () => ({ status: "ok" }));

  app.addHook("onRequest", async (request, reply) => {
    if (
      request.url === "/health" ||
      request.url === "/v1/waitlist" ||
      (
        dependencies.moonPay
        && request.url.startsWith(
          "/v1/moonpay/webhook",
        )
      )
    ) {
      return;
    }

    const identity = await dependencies.authenticate(
      request.headers.authorization,
    );

    if (!identity) {
      request.log.warn(
        { errorCode: "UNAUTHENTICATED" },

        "API authentication failed",
      );

      await reply

        .code(401)

        .send({ error: { code: "UNAUTHENTICATED" } });

      return reply;
    }

    if (
      options.stagingAllowedPrivyUserIds
      && !options.stagingAllowedPrivyUserIds
        .includes(identity.privyUserId)
    ) {
      request.log.warn(
        {
          errorCode:
            "STAGING_ACCESS_DENIED",
          privyUserId:
            identity.privyUserId,
        },
        "Staging API access denied",
      );

      await reply
        .code(403)
        .send({
          error: {
            code:
              "STAGING_ACCESS_DENIED",
          },
        });

      return reply;
    }

    try {
      const authenticatedRequest = asAuthenticatedRequest(request);

      authenticatedRequest.user = await dependencies.persistence.createUser({
        privyUserId: identity.privyUserId,
      });

      if (identity.wallet) {
        await dependencies.persistence.ensureEmbeddedWallet({
          userId: authenticatedRequest.user.id,

          chainId: dependencies.chainId,

          address: identity.wallet,
        });
      }

      authenticatedRequest.identity = identity;
    } catch (error) {
      const result = sendError(request, error);

      await reply

        .code(result.statusCode)

        .send(result.body);

      return reply;
    }
  });

  app.post(
    "/v1/waitlist",
    async (
      request,
      reply,
    ) => {
      let clientIp: string;

      try {
        clientIp =
          getCustomerIp(
            request,
          );
      } catch {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",
            },
          });
      }

      const now =
        Date.now();

      if (
        waitlistRequests.size
        > 10_000
      ) {
        for (
          const [
            key,
            value,
          ]
          of waitlistRequests
        ) {
          if (
            value.resetAt
            <= now
          ) {
            waitlistRequests.delete(
              key,
            );
          }
        }
      }

      const existing =
        waitlistRequests.get(
          clientIp,
        );

      if (
        !existing
        || existing.resetAt
          <= now
      ) {
        waitlistRequests.set(
          clientIp,
          {
            count: 1,
            resetAt:
              now
              + waitlistRateLimit
                .windowMs,
          },
        );
      } else if (
        existing.count
        >= waitlistRateLimit
          .maxRequests
      ) {
        reply.header(
          "retry-after",
          Math.max(
            1,
            Math.ceil(
              (
                existing.resetAt
                - now
              ) / 1_000,
            ),
          ).toString(),
        );

        return reply
          .code(429)
          .send({
            error: {
              code:
                "RATE_LIMITED",
            },
          });
      } else {
        existing.count += 1;
      }

      return handle(
        request,
        reply,
        async () => {
          const body =
            requireObject(
              request.body,
            );

          const email = requireString(body, "email");
          if (dependencies.resendWaitlist) {
            await dependencies.resendWaitlist(email);
          } else {
            await dependencies.persistence.joinWaitlist({ email });
          }

          return reply
            .code(204)
            .send();
        },
      );
    },
  );

  app.all(
    "/api/intents-connect/*",
    async (request, reply) => {
      const config =
        options.auroraIntents;

      if (!config) {
        return reply
          .code(503)
          .send({
            error: {
              code:
                "SERVICE_UNAVAILABLE",
            },
          });
      }

      const origin =
        request.headers.origin;

      if (
        typeof origin !== "string"
        || !allowedOrigins.includes(origin)
      ) {
        request.log.warn(
          {
            errorCode:
              "INTENTS_PROXY_ORIGIN_DENIED",
          },
          "Aurora Intents proxy origin denied",
        );

        return reply
          .code(403)
          .send({
            error: {
              code:
                "FORBIDDEN",
            },
          });
      }

      let clientIp: string;

      try {
        clientIp =
          getCustomerIp(request);
      } catch {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",
            },
          });
      }

      const now = Date.now();
      const existing =
        intentsProxyRequests.get(clientIp);

      if (
        !existing
        || existing.resetAt <= now
      ) {
        intentsProxyRequests.set(
          clientIp,
          {
            count: 1,
            resetAt:
              now
              + intentsProxyRateLimit.windowMs,
          },
        );
      } else if (
        existing.count
        >= intentsProxyRateLimit.maxRequests
      ) {
        reply.header(
          "retry-after",
          Math.max(
            1,
            Math.ceil(
              (
                existing.resetAt
                - now
              ) / 1_000,
            ),
          ).toString(),
        );

        return reply
          .code(429)
          .send({
            error: {
              code:
                "RATE_LIMITED",
            },
          });
      } else {
        existing.count += 1;
      }

      const suffix =
        request.url.replace(
          /^\/api\/intents-connect/,
          "",
        );

      const upstreamUrl =
        new URL(
          suffix,
          config.baseUrl,
        );

      try {
        const headers =
          new Headers();

        headers.set(
          "x-api-key",
          config.apiKey,
        );

        const contentType =
          request.headers[
          "content-type"
          ];

        if (
          typeof contentType ===
          "string"
        ) {
          headers.set(
            "content-type",
            contentType,
          );
        }

        const init: RequestInit = {
          method:
            request.method,

          headers,
        };

        if (
          request.method !== "GET" &&
          request.method !== "HEAD" &&
          request.body !== undefined
        ) {
          init.body =
            JSON.stringify(
              request.body,
            );
        }

        const upstream =
          await fetch(
            upstreamUrl,
            init,
          );

        const responseBody =
          await upstream.text();

        const responseType =
          upstream.headers.get(
            "content-type",
          );

        if (responseType) {
          reply.header(
            "content-type",
            responseType,
          );
        }

        return reply
          .code(
            upstream.status,
          )
          .send(
            responseBody,
          );
      } catch (error) {
        request.log.error(
          error,
          "Aurora Intents proxy failed",
        );

        return reply
          .code(502)
          .send({
            error: {
              code:
                "UPSTREAM_ERROR",
            },
          });
      }
    },
  );

  app.post(
    "/v1/funding/solana/token-balances",
    async (
      request,
      reply,
    ) => {
      const config =
        options.solanaRpc;

      if (
        !config
      ) {
        return reply
          .code(503)
          .send({
            error: {
              code:
                "SERVICE_UNAVAILABLE",
            },
          });
      }

      const body =
        requireObject(
          request.body,
        );

      const owner =
        requireString(
          body,
          "owner",
        ).trim();

      if (
        owner.length ===
        0
      ) {
        throw new PersistenceValidationError(
          "owner must not be empty",
        );
      }

      try {
        const [
          nativeUpstream,
          tokensUpstream,
        ] =
          await Promise.all([
            fetch(
              config.url,
              {
                method:
                  "POST",

                headers: {
                  "content-type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    jsonrpc:
                      "2.0",

                    id:
                      1,

                    method:
                      "getBalance",

                    params: [
                      owner,

                      {
                        commitment:
                          "confirmed",
                      },
                    ],
                  }),
              },
            ),

            fetch(
              config.url,
              {
                method:
                  "POST",

                headers: {
                  "content-type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    jsonrpc:
                      "2.0",

                    id:
                      2,

                    method:
                      "getTokenAccountsByOwner",

                    params: [
                      owner,

                      {
                        programId:
                          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                      },

                      {
                        encoding:
                          "jsonParsed",

                        commitment:
                          "confirmed",
                      },
                    ],
                  }),
              },
            ),
          ]);

        if (
          !nativeUpstream.ok ||
          !tokensUpstream.ok
        ) {
          request.log.warn(
            {
              nativeStatus:
                nativeUpstream.status,

              tokenStatus:
                tokensUpstream.status,
            },
            "Helius RPC request failed",
          );

          return reply
            .code(502)
            .send({
              error: {
                code:
                  "UPSTREAM_ERROR",
              },
            });
        }

        const nativePayload =
          await nativeUpstream.json() as {
            readonly result?: {
              readonly value?:
              number;
            };

            readonly error?: {
              readonly code?:
              number;

              readonly message?:
              string;
            };
          };

        const tokenPayload =
          await tokensUpstream.json() as {
            readonly result?: {
              readonly value?:
              readonly {
                readonly account?: {
                  readonly data?: {
                    readonly parsed?: {
                      readonly info?: {
                        readonly mint?:
                        string;

                        readonly tokenAmount?: {
                          readonly amount?:
                          string;
                        };
                      };
                    };
                  };
                };
              }[];
            };

            readonly error?: {
              readonly code?:
              number;

              readonly message?:
              string;
            };
          };

        if (
          nativePayload.error ||
          tokenPayload.error
        ) {
          request.log.warn(
            {
              nativeRpcError:
                nativePayload.error,

              tokenRpcError:
                tokenPayload.error,
            },
            "Helius RPC returned an error",
          );

          return reply
            .code(502)
            .send({
              error: {
                code:
                  "UPSTREAM_ERROR",
              },
            });
        }

        const nativeBalance =
          nativePayload.result
            ?.value;

        if (
          typeof nativeBalance !==
          "number" ||
          !Number.isSafeInteger(
            nativeBalance,
          ) ||
          nativeBalance <
          0
        ) {
          request.log.warn(
            {
              nativeBalance,
            },
            "Helius returned an invalid SOL balance",
          );

          return reply
            .code(502)
            .send({
              error: {
                code:
                  "UPSTREAM_ERROR",
              },
            });
        }

        const balances =
          new Map<
            string,
            bigint
          >();

        for (
          const entry of
          tokenPayload.result
            ?.value ??
          []
        ) {
          const info =
            entry.account
              ?.data
              ?.parsed
              ?.info;

          const mint =
            info?.mint;

          const amount =
            info
              ?.tokenAmount
              ?.amount;

          if (
            typeof mint !==
            "string" ||
            typeof amount !==
            "string"
          ) {
            continue;
          }

          try {
            balances.set(
              mint,
              (
                balances.get(
                  mint,
                ) ??
                0n
              ) +
              BigInt(
                amount,
              ),
            );
          } catch {
            continue;
          }
        }

        return {
          nativeBalance:
            nativeBalance.toString(),

          balances:
            Object.fromEntries(
              Array.from(
                balances.entries(),
              ).map(
                ([
                  mint,
                  balance,
                ]) => [
                    mint,
                    balance.toString(),
                  ],
              ),
            ),
        };
      } catch (
      error
      ) {
        request.log.error(
          error,
          "Helius RPC proxy failed",
        );

        return reply
          .code(502)
          .send({
            error: {
              code:
                "UPSTREAM_ERROR",
            },
          });
      }
    },
  );

  const moonPay =
    dependencies.moonPay;

  if (moonPay) {
    app.get(
      "/v1/moonpay/allowed-ip",
      async (
        request,
        reply,
      ) =>
        handle(
          request,
          reply,
          async () => {
            const clientIp =
              getCustomerIp(request);
  
            return {
              allowedIpAddress:
                clientIp,
            };
          },
        ),
    );
  
    app.post(
      "/v1/moonpay/offramp-url",
      async (request, reply) =>
        handle(
          request,
          reply,
          async () => {
            const body = requireObject(request.body);
            const amount = requireString(body, "amount");
            const auth = asAuthenticatedRequest(request);
  
            const order = await dependencies.persistence.createMoonPayOfframpOrder({
              userId: auth.user.id,
              amountAtomic: parseUsdcAmountToAtomic(amount),
            });
  
            const customerIp = getCustomerIp(request);
  
            const url = new URL(moonPay.baseUrl);
            url.searchParams.set("apiKey", moonPay.publishableKey);
            url.searchParams.set("baseCurrencyCode", "usdc_base");
            url.searchParams.set("baseCurrencyAmount", amount);
            url.searchParams.set("lockAmount", "true");
            url.searchParams.set("allowedIpAddress", customerIp);
            url.searchParams.set("externalTransactionId", order.id);
  
            const primaryOrigin = allowedWebOrigins(webOrigin)[0];
            if (primaryOrigin) {
              const redirectUrl = new URL("/dashboard", primaryOrigin);
              redirectUrl.searchParams.set("moonpayOrderId", order.id);
              url.searchParams.set("redirectURL", redirectUrl.toString());
            }
  
            const signature = createHmac("sha256", moonPay.secretKey)
              .update(url.search)
              .digest("base64");
  
            url.searchParams.set("signature", signature);
  
            return {
              url: url.toString(),
              orderId: order.id,
            };
          },
        ),
    );
  
    app.get(
      "/v1/moonpay/offramp-orders/:id",
      async (request, reply) =>
        handle(
          request,
          reply,
          async () => {
            const params = requireObject(request.params);
            const id = requireString(params, "id");
            const auth = asAuthenticatedRequest(request);
            const order = await dependencies.persistence.getMoonPayOfframpOrder(
              auth.user.id,
              id,
            );
  
            if (!order) {
              throw new NotFoundError("MoonPay off-ramp order");
            }
  
            return order;
          },
        ),
    );
  
    app.post(
      "/v1/moonpay/offramp-orders/:id/submitted",
      async (request, reply) =>
        handle(
          request,
          reply,
          async () => {
            const params = requireObject(request.params);
            const body = requireObject(request.body);
            const auth = asAuthenticatedRequest(request);
  
            return dependencies.persistence.markMoonPayOfframpFundsSent({
              userId: auth.user.id,
              orderId: requireString(params, "id"),
              transferReference: requireString(body, "transferReference"),
            });
          },
        ),
    );
  
    app.post(
      "/v1/moonpay/webhook",
      async (request, reply) => {
        const rawBody = (request as RawBodyRequest).rawBody;
        const signatureHeader = request.headers["moonpay-signature-v2"];
        const signature = Array.isArray(signatureHeader)
          ? signatureHeader[0]
          : signatureHeader;
  
        if (
          !rawBody
          || !verifyMoonPayWebhookSignature({
            rawBody,
            signatureHeader: signature,
            webhookKey: moonPay.webhookKey,
          })
        ) {
          return reply.code(401).send({
            error: { code: "INVALID_WEBHOOK_SIGNATURE" },
          });
        }
  
        const event = parseMoonPaySellWebhook(request.body);
  
        if (!event) {
          return reply.code(204).send();
        }
  
        try {
          await dependencies.persistence.recordMoonPayOfframpWebhook(event);
        } catch (error) {
          if (error instanceof NotFoundError) {
            request.log.warn(
              { moonPayTransactionId: event.moonPayTransactionId },
              "MoonPay webhook did not match a Kept off-ramp order",
            );
  
            return reply.code(204).send();
          }
  
          throw error;
        }
  
        return reply.code(204).send();
      },
    );
  
    app.post(
      "/v1/moonpay/sign",
      async (
        request,
        reply,
      ) =>
        handle(
          request,
          reply,
          async () => {
            const body =
              requireObject(
                request.body,
              );
  
            const url =
              requireString(
                body,
                "url",
              );
  
            const parsed =
              new URL(
                url,
              );
  
            const signature =
              createHmac(
                "sha256",
                moonPay.secretKey,
              )
                .update(
                  parsed.search,
                )
                .digest(
                  "base64",
                );
  
            return {
              signature,
            };
          },
        ),
    );
  
  }

  app.get("/v1/me", async (request) => asAuthenticatedRequest(request).user);

  app.get(
    "/v1/dashboard",
    async (
      request,
      reply,
    ) =>
      handle(
        request,
        reply,
        async () => {
          const auth =
            asAuthenticatedRequest(
              request,
            );

          if (
            !auth.identity.wallet
          ) {
            throw new NotFoundError(
              "Privy embedded wallet",
            );
          }

          const performancePromise =
            readSavingsPerformanceFor(
              auth,
            )
              .then(
                (
                  performance,
                ) => ({
                  kind:
                    "ready" as const,
                  data:
                    performance,
                }),
              )
              .catch(
                (
                  error,
                ) => {
                  if (
                    error
                    instanceof SavingsHistorySynchronizingError
                  ) {
                    return {
                      kind:
                        "synchronizing" as const,
                      progressPercent:
                        error
                          .progressPercent,
                    };
                  }

                  request.log.warn(
                    {
                      err:
                        error,
                    },
                    "dashboard savings performance unavailable",
                  );

                  return {
                    kind:
                      "error" as const,
                  };
                },
              );

          const marketStatusPromise =
            readSavingsMarketStatus()
              .then(
                (
                  marketStatus,
                ) => ({
                  kind:
                    "ready" as const,
                  data:
                    marketStatus,
                }),
              )
              .catch(
                (
                  error,
                ) => {
                  request.log.warn(
                    {
                      err:
                        error,
                    },
                    "dashboard savings market status unavailable",
                  );

                  return {
                    kind:
                      "error" as const,
                  };
                },
              );

          const [
            goals,
            commitments,
            savingsPerformance,
            savingsMarketStatus,
          ] =
            await Promise.all([
              dependencies
                .persistence
                .listGoals(
                  auth.user.id,
                ),

              listReconciledCommitments(
                auth.user.id,
              ),

              performancePromise,

              marketStatusPromise,
            ]);

          const allocations = dependencies.persistence.getDashboardGoalAllocations
            ? await dependencies.persistence.getDashboardGoalAllocations(
                auth.user.id,
                auth.identity.wallet!,
                goals.map(goal => goal.id),
              )
            : Object.fromEntries(await Promise.all(goals.map(async goal => {
                const allocation = await dependencies.persistence.getGoalAllocation(
                  auth.user.id, goal.id, auth.identity.wallet!,
                );
                if (!allocation) throw new NotFoundError("Savings goal");
                return [goal.id, allocation] as const;
              })));

          return {
            goals,
            commitments,
            allocations,
            savings: {
              performance:
                savingsPerformance,
              marketStatus:
                savingsMarketStatus,
            },
          };
        },
      ),
  );

  app.post(
    "/v1/staging/faucet",
    async (request, reply) =>
      handle(
        request,
        reply,
        async () => {
          if (
            dependencies.chainId !== 10_143
            || !dependencies.stagingFaucet
          ) {
            throw new NotFoundError("Staging faucet");
          }

          const auth =
            asAuthenticatedRequest(request);

          if (!auth.identity.wallet) {
            throw new NotFoundError("Privy embedded wallet");
          }

          const claim = await dependencies.stagingFaucet.claim(
            auth.identity.wallet,
          );

          // Only a confirmed server-signed faucet mint can create this entry.
          // Never trust a browser-supplied funding transaction as evidence.
          try {
            await dependencies.persistence.recordTransaction({
              userId: auth.user.id,
              idempotencyKey: `staging-faucet:${claim.transactionHash.toLowerCase()}`,
              type: "CRYPTO_FUNDING",
              amountAtomic: claim.amountAtomic,
              asset: "USDC",
              description: "Test funds added (faucet)",
              chainId: BigInt(dependencies.chainId),
              transactionHash: claim.transactionHash,
              externalReference: claim.transactionHash,
            });
          } catch (error) {
            // Minting is irreversible. A history write failure must not make
            // the caller retry a successful faucet mint as though it failed.
            request.log.error({ error, transactionHash: claim.transactionHash },
              "Confirmed staging faucet mint could not be recorded in activity");
          }

          return claim;
        },
      ),
  );

  app.get(
    "/v1/savings/performance",

    async (request, reply) =>
      handle(
        request,

        reply,

        async () => {
          const auth = asAuthenticatedRequest(request);

          if (!auth.identity.wallet) {
            throw new NotFoundError("Privy embedded wallet");
          }

          const cacheKey =
            auth.identity.wallet.toLowerCase();

          const now =
            Date.now();

          const cached =
            savingsPerformanceCache.get(cacheKey);

          if (
            cached
            && cached.expiresAt > now
          ) {
            return cached.promise;
          }

          const nowMilliseconds =
            Math.floor(now / 1_000) * 1_000;

          const promise =
            dependencies.chainId === 10_143
            && dependencies.savingsCurrentAssets
            && dependencies.savingsActivityIndex
              ? (async () => {
                if (
                  !dependencies
                    .savingsActivityIndex!
                    .isReady()
                ) {
                  const syncStatus =
                    dependencies
                      .savingsActivityIndex!
                      .status();

                  throw new SavingsHistorySynchronizingError({
                    progressPercent:
                      syncStatus.progressPercent,
                    currentBlock:
                      syncStatus.currentBlock,
                    targetBlock:
                      syncStatus.targetBlock,
                  });
                }

                const snapshotStatus =
                  dependencies
                    .savingsActivityIndex!
                    .status();

                const snapshotBlock =
                  snapshotStatus.currentBlock;

                if (snapshotBlock === null) {
                  throw new SavingsHistorySynchronizingError({
                    progressPercent:
                      snapshotStatus.progressPercent,
                    currentBlock:
                      snapshotStatus.currentBlock,
                    targetBlock:
                      snapshotStatus.targetBlock,
                  });
                }

                const [
                  activity,
                  currentAssets,
                ] = await Promise.all([
                  dependencies
                    .savingsActivityIndex!
                    .readAccountActivity(
                      auth.identity.wallet!,
                      snapshotBlock,
                    ),

                  dependencies
                    .savingsCurrentAssets!
                    .read(
                      auth.identity.wallet!,
                      snapshotBlock,
                    ),
                ]);

                const earningsAssets =
                  currentAssets
                  + activity.withdrawnAssets
                  - activity.depositedAssets;

                return {
                  depositedAssetsAtomic:
                    activity.depositedAssets
                      .toString(),

                  withdrawnAssetsAtomic:
                    activity.withdrawnAssets
                      .toString(),

                  netContributionsAtomic:
                    activity.netAssets
                      .toString(),

                  currentAssetsAtomic:
                    currentAssets.toString(),

                  earningsAssetsAtomic:
                    earningsAssets.toString(),
                };
              })()
              : dependencies.savingsPerformance
                .readPerformance({
                  account:
                    auth.identity.wallet,

                  startAt:
                    new Date(0),

                  endAt:
                    new Date(
                      nowMilliseconds,
                    ),
                });

          savingsPerformanceCache.set(
            cacheKey,
            {
              expiresAt:
                now + SAVINGS_PERFORMANCE_CACHE_TTL_MS,

              promise,
            },
          );

          try {
            return await promise;
          } catch (error) {
            const current =
              savingsPerformanceCache.get(cacheKey);

            if (
              current?.promise === promise
            ) {
              savingsPerformanceCache.delete(cacheKey);
            }

            throw error;
          }
        },
      ),
  );

  app.get(
    "/v1/savings/market-status",
    async (
      request,
      reply,
    ) =>
      handle(
        request,
        reply,
        async () => {
          const now =
            Date.now();

          if (
            savingsMarketStatusCache
            && savingsMarketStatusCache.expiresAt >
            now
          ) {
            return savingsMarketStatusCache.promise;
          }

          const promise =
            dependencies
              .savingsMarketStatus
              .readStatus();

          savingsMarketStatusCache = {
            expiresAt:
              now +
              SAVINGS_MARKET_STATUS_CACHE_TTL_MS,

            promise,
          };

          try {
            return await promise;
          } catch (error) {
            if (
              savingsMarketStatusCache
                ?.promise ===
              promise
            ) {
              savingsMarketStatusCache =
                null;
            }

            throw error;
          }
        },
      ),
  );

  app.get(
    "/v1/account/transactions",
    async (
      request,
      reply,
    ) =>
      handle(
        request,
        reply,
        () =>
          dependencies.persistence
            .listTransactions(
              asAuthenticatedRequest(
                request,
              ).user.id,
            ),
      ),
  );

  app.post(
    "/v1/account/transactions",
    async (
      request,
      reply,
    ) =>
      handle(
        request,
        reply,
        async () => {
          const auth =
            asAuthenticatedRequest(
              request,
            );

          const body =
            requireObject(
              request.body,
            );

          const chainIdValue =
            optionalString(
              body,
              "chainId",
            );

          let chainId:
            bigint | null =
            null;

          if (chainIdValue) {
            try {
              chainId =
                BigInt(
                  chainIdValue,
                );
            } catch {
              throw new PersistenceValidationError(
                "chainId must be an integer",
              );
            }
          }

          return dependencies.persistence
            .recordTransaction({
              userId:
                auth.user.id,

              idempotencyKey:
                requireIdempotencyKey(
                  request,
                ),

              type:
                requireClientTransactionType(
                  body,
                ),

              amountAtomic:
                requirePositiveAtomicAmount(
                  body,
                  "amountAtomic",
                ),

              asset:
                requireString(
                  body,
                  "asset",
                ),

              description:
                requireString(
                  body,
                  "description",
                ),

              goalId:
                optionalString(
                  body,
                  "goalId",
                ),

              chainId,

              transactionHash:
                optionalString(
                  body,
                  "transactionHash",
                ),

              externalReference:
                optionalString(
                  body,
                  "externalReference",
                ),
            });
        },
      ),
  );


  app.get("/v1/goals", async (request, reply) =>
    handle(request, reply, () =>
      dependencies.persistence.listGoals(
        asAuthenticatedRequest(request).user.id,
      ),
    ),
  );

  app.get<{ Params: { id: string } }>("/v1/goals/:id", async (request, reply) =>
    handle(request, reply, async () => {
      const goal = await dependencies.persistence.getGoal(
        asAuthenticatedRequest(request).user.id,

        request.params.id,
      );

      if (!goal) throw new NotFoundError("Savings goal");

      return goal;
    }),
  );

  app.get<{ Params: { id: string } }>(
    "/v1/goals/:id/activity",
    async (request, reply) =>
      handle(request, reply, async () =>
        dependencies.persistence.listGoalActivity(
          asAuthenticatedRequest(request).user.id,
          request.params.id,
        ),
      ),
  );

  app.get<{ Params: { id: string } }>(
    "/v1/goals/:id/allocation",

    async (request, reply) =>
      handle(request, reply, async () => {
        const auth = asAuthenticatedRequest(request);

        if (!auth.identity.wallet) {
          throw new NotFoundError("Privy embedded wallet");
        }

        const allocation = await dependencies.persistence.getGoalAllocation(
          auth.user.id,

          request.params.id,

          auth.identity.wallet,
        );

        if (!allocation) {
          throw new NotFoundError("Savings goal");
        }

        return allocation;
      }),
  );

  app.post("/v1/goals", async (request, reply) =>
    handle(request, reply, async () => {
      const body = requireObject(request.body);

      const targetDateValue = body.targetDate;

      if (
        targetDateValue !== undefined &&
        targetDateValue !== null &&
        typeof targetDateValue !== "string"
      ) {
        throw new PersistenceValidationError(
          "targetDate must be a string or null",
        );
      }

      const targetDate: string | null =
        typeof targetDateValue === "string" ? targetDateValue : null;

      return dependencies.persistence.createGoal({
        userId: asAuthenticatedRequest(request).user.id,

        idempotencyKey: requireIdempotencyKey(request),

        name: requireString(body, "name"),

        targetAmountAtomic: requireString(body, "targetAmountAtomic"),

        targetDate,
      });
    }),
  );

  app.post<{ Params: { id: string } }>(
    "/v1/goals/:id/archive",

    async (request, reply) =>
      handle(request, reply, () => {
        return dependencies.persistence.archiveGoal({
          userId: asAuthenticatedRequest(request).user.id,

          goalId: request.params.id,

          idempotencyKey: requireIdempotencyKey(request),
        });
      }),
  );

  app.post<{ Params: { id: string } }>(
    "/v1/goals/:id/allocations",

    async (request, reply) =>
      handle(request, reply, async () => {
        const auth = asAuthenticatedRequest(request);

        if (!auth.identity.wallet) {
          throw new NotFoundError("Privy embedded wallet");
        }

        const body = requireObject(request.body);

        return dependencies.persistence.allocateGoalShares({
          userId: auth.user.id,

          goalId: request.params.id,

          walletAddress: auth.identity.wallet,

          shareDeltaAtomic: requireSignedAtomicShareDelta(
            body,

            "shareDeltaAtomic",
          ),

          reason: requireString(body, "reason"),

          idempotencyKey: requireIdempotencyKey(request),
        });
      }),
  );

  app.post(
    "/v1/goals/reallocate",

    async (request, reply) =>
      handle(request, reply, async () => {
        const auth = asAuthenticatedRequest(request);

        if (!auth.identity.wallet) {
          throw new NotFoundError("Privy embedded wallet");
        }

        const body = requireObject(request.body);

        const fromGoalId = requireString(
          body,

          "fromGoalId",
        );

        const toGoalId = requireString(
          body,

          "toGoalId",
        );

        const shareAmountAtomic = requireString(
          body,

          "shareAmountAtomic",
        );

        if (
          !/^\d{1,78}$/.test(shareAmountAtomic) ||
          BigInt(shareAmountAtomic) <= 0n
        ) {
          throw new PersistenceValidationError(
            "shareAmountAtomic must be a positive integer",
          );
        }

        return dependencies.persistence.reallocateGoalShares({
          userId: auth.user.id,

          walletAddress: auth.identity.wallet,

          fromGoalId,

          toGoalId,

          shareAmountAtomic,

          idempotencyKey: requireIdempotencyKey(request),
        });
      }),
  );

  app.get("/v1/commitments", async (request, reply) =>
    handle(request, reply, async () => {
      const commitments = await dependencies.persistence.listCommitments(
        asAuthenticatedRequest(request).user.id,
      );

      const reconciled = await Promise.all(
        commitments.map(async (commitment) => {
          if (commitment.state !== "ACTIVE" || !commitment.onchainCommitmentId)
            return commitment;

          if (!dependencies.commitmentSettlementVerifier) {
            throw new CommitmentSettlementUnavailableError();
          }

          const settlement = await settlementRequest(() =>
            dependencies.commitmentSettlementVerifier!.inspect({
              offchainCommitmentId: commitment.id,

              onchainCommitmentId: commitment.onchainCommitmentId!,

              startAt: new Date(commitment.epochStart),

              endAt: new Date(commitment.epochEnd),
            }),
          );

          const targetState = (
            {
              2: "COMPLETED",

              3: "FAILED",

              4: "CANCELLED",
            } as const
          )[settlement.status as 2 | 3 | 4];

          if (settlement.status === 1) return commitment;

          if (!targetState) {
            throw new CommitmentSettlementMismatchError(
              "Onchain commitment has an invalid active lifecycle status",
            );
          }

          return { ...commitment, state: targetState };
        }),
      );

      return reconciled;
    }),
  );

  app.get<{ Params: { id: string } }>(
    "/v1/commitments/:id",
    async (request, reply) =>
      handle(request, reply, async () => {
        const commitment = await dependencies.persistence.getCommitment(
          asAuthenticatedRequest(request).user.id,

          request.params.id,
        );

        if (!commitment) throw new NotFoundError("Commitment");

        if (commitment.state === "ACTIVE" && commitment.onchainCommitmentId) {
          if (!dependencies.commitmentSettlementVerifier) {
            throw new CommitmentSettlementUnavailableError();
          }

          const settlement = await settlementRequest(() =>
            dependencies.commitmentSettlementVerifier!.inspect({
              offchainCommitmentId: commitment.id,

              onchainCommitmentId: commitment.onchainCommitmentId!,

              startAt: new Date(commitment.epochStart),

              endAt: new Date(commitment.epochEnd),
            }),
          );

          const targetState = (
            {
              2: "COMPLETED",

              3: "FAILED",

              4: "CANCELLED",
            } as const
          )[settlement.status as 2 | 3 | 4];

          if (settlement.status === 1) return commitment;

          if (!targetState) {
            throw new CommitmentSettlementMismatchError(
              "Onchain commitment has an invalid active lifecycle status",
            );
          }

          return { ...commitment, state: targetState };
        }

        return commitment;
      }),
  );

  app.post("/v1/commitments", async (request, reply) =>
    handle(request, reply, async () => {
      const body = requireObject(request.body);

      const definition = requireObject(body.definition);

      const parameters = requireObject(body.parameters) as Record<
        string,
        JsonValue
      >;

      return dependencies.persistence.createCommitmentDraft({
        userId: asAuthenticatedRequest(request).user.id,

        idempotencyKey: requireIdempotencyKey(request),

        goalId: requireString(body, "goalId"),

        definition: {
          code: requireString(definition, "code"),

          version: requireInteger(definition, "version"),
        },

        parameters,

        epochStart: requireString(body, "epochStart"),

        epochEnd: requireString(body, "epochEnd"),

        verificationDeadline: requireString(body, "verificationDeadline"),
      });
    }),
  );

  app.post<{ Params: { id: string } }>(
    "/v1/commitments/:id/activate",
    async (request, reply) =>
      handle(request, reply, async () => {
        if (!dependencies.commitmentSettlementVerifier) {
          throw new CommitmentSettlementUnavailableError();
        }

        const body = requireObject(request.body);

        const onchainCommitmentId = requireString(body, "onchainCommitmentId");

        const transactionHash = requireString(body, "transactionHash") as Hex;

        const userId = asAuthenticatedRequest(request).user.id;

        const commitment = await dependencies.persistence.getCommitment(
          userId,

          request.params.id,
        );

        if (!commitment) throw new NotFoundError("Commitment");

        const verifiedSettlement = await settlementRequest(() =>
          dependencies.commitmentSettlementVerifier!.verifyActive({
            offchainCommitmentId: commitment.id,

            onchainCommitmentId,

            transactionHash,

            startAt: new Date(commitment.epochStart),

            endAt: new Date(commitment.epochEnd),
          }),
        );

        const activated = await dependencies.persistence.activateCommitment({
          userId,

          commitmentId: request.params.id,

          expectedVersion: requireInteger(body, "expectedVersion"),

          onchainCommitmentId,

          settlementOwner: verifiedSettlement.owner,

          settlementChainId: verifiedSettlement.chainId,

          settlementStatus: verifiedSettlement.status as 1 | 2 | 3 | 4,

          idempotencyKey: requireIdempotencyKey(request),
        });

        const settledState = (
          {
            2: "COMPLETED",

            3: "FAILED",

            4: "CANCELLED",
          } as const
        )[verifiedSettlement.status as 2 | 3 | 4];

        return settledState ? { ...activated, state: settledState } : activated;
      }),
  );

  app.post<{ Params: { id: string } }>(
    "/v1/commitments/:id/cancel",
    async (request, reply) =>
      handle(request, reply, async () => {
        if (!dependencies.commitmentSettlementVerifier) {
          throw new CommitmentSettlementUnavailableError();
        }

        const body = requireObject(request.body);

        const onchainCommitmentId = requireString(body, "onchainCommitmentId");

        const owner = requireString(body, "owner");

        const userId = asAuthenticatedRequest(request).user.id;

        const commitment = await dependencies.persistence.getCommitment(
          userId,

          request.params.id,
        );

        if (!commitment) throw new NotFoundError("Commitment");

        const cancellationInput = {
          userId,

          commitmentId: request.params.id,

          expectedVersion: requireInteger(body, "expectedVersion"),

          onchainCommitmentId,

          settlementOwner: owner,

          idempotencyKey: requireIdempotencyKey(request),
        };

        if (
          commitment.state === "CANCELLED" &&
          commitment.onchainCommitmentId === onchainCommitmentId
        ) {
          return dependencies.persistence.cancelCommitment(cancellationInput);
        }

        if (
          commitment.state !== "ACTIVE" ||
          commitment.onchainCommitmentId !== onchainCommitmentId
        ) {
          throw new CommitmentSettlementMismatchError(
            "Only a matching onchain active commitment can be cancelled",
          );
        }

        await settlementRequest(() =>
          dependencies.commitmentSettlementVerifier!.verifyCancelled({
            offchainCommitmentId: commitment.id,

            onchainCommitmentId,

            owner,

            startAt: new Date(commitment.epochStart),

            endAt: new Date(commitment.epochEnd),
          }),
        );

        return dependencies.persistence.cancelCommitment(cancellationInput);
      }),
  );

  return app;
}
function formatUsdcForMoonPay(
  atomic: bigint,
): string {
  const whole =
    atomic / 1_000_000n;

  const fractional =
    (
      atomic % 1_000_000n
    )
      .toString()
      .padStart(
        6,
        "0",
      )
      .replace(
        /0+$/,
        "",
      );

  return fractional
    ? `${whole}.${fractional}`
    : whole.toString();
}

