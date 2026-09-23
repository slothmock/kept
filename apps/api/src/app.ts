import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";

import {
  IdempotencyConflictError,
  IncompleteIdempotencyRecordError,
  NotFoundError,
  PersistenceValidationError,
} from "./persistence/errors.js";
import type {
  KeptPersistenceService,
  UserDto,
} from "./persistence/index.js";
import type { JsonValue } from "./domain/commitments/index.js";
import {
  CommitmentSettlementMismatchError,
  CommitmentSettlementUnavailableError,
  type CommitmentSettlementVerifier,
} from "./commitment-settlement.js";

export interface AuthenticatedIdentity {
  readonly privyUserId: string;
}

export interface ApiDependencies {
  readonly authenticate: (
    authorization: string | undefined,
  ) => Promise<AuthenticatedIdentity | null>;
  readonly persistence: Pick<
    KeptPersistenceService,
    | "createUser"
    | "createGoal"
    | "getGoal"
    | "listGoals"
    | "createCommitmentDraft"
    | "getCommitment"
    | "listCommitments"
    | "activateCommitment"
    | "cancelCommitment"
  >;
  readonly commitmentSettlementVerifier?: CommitmentSettlementVerifier;
}

export interface BuildAppOptions {
  readonly enableLogging?: boolean;
  readonly webOrigin?: string;
}

function allowedWebOrigins(webOrigin: string): string[] {
  if (webOrigin === "http://localhost:5173") {
    return [webOrigin, "http://127.0.0.1:5173"];
  }
  return [webOrigin];
}

interface AuthenticatedRequest extends FastifyRequest {
  user: UserDto;
}

function asAuthenticatedRequest(request: FastifyRequest): AuthenticatedRequest {
  return request as AuthenticatedRequest;
}

function sendError(
  request: FastifyRequest,
  error: unknown,
): {
  readonly statusCode: number;
  readonly body: { readonly error: { readonly code: string } };
} {
  if (error instanceof NotFoundError) {
    request.log.warn({ err: error, errorCode: "NOT_FOUND" }, "API request rejected");
    return { statusCode: 404, body: { error: { code: "NOT_FOUND" } } };
  }
  if (error instanceof PersistenceValidationError) {
    request.log.warn({ err: error, errorCode: "VALIDATION_ERROR" }, "API request rejected");
    return { statusCode: 400, body: { error: { code: "VALIDATION_ERROR" } } };
  }
  if (error instanceof IdempotencyConflictError) {
    request.log.warn({ err: error, errorCode: "IDEMPOTENCY_CONFLICT" }, "API request rejected");
    return { statusCode: 409, body: { error: { code: "IDEMPOTENCY_CONFLICT" } } };
  }
  if (error instanceof IncompleteIdempotencyRecordError) {
    request.log.warn({ err: error, errorCode: "REQUEST_IN_PROGRESS" }, "API request rejected");
    return { statusCode: 409, body: { error: { code: "REQUEST_IN_PROGRESS" } } };
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

function requireIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];
  if (typeof value !== "string" || !value.trim()) {
    throw new PersistenceValidationError("idempotency-key header is required");
  }
  return value;
}

async function settlementRequest<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof CommitmentSettlementMismatchError
      || error instanceof CommitmentSettlementUnavailableError
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

export function buildApp(
  dependencies: ApiDependencies,
  options: BuildAppOptions = {},
): FastifyInstance {
  const app = Fastify({
    logger: options.enableLogging
      ? { redact: ["req.headers.authorization"] }
      : false,
  });

  const webOrigin = options.webOrigin ?? "http://localhost:5173";
  app.register(cors, {
    origin: allowedWebOrigins(webOrigin),
    methods: ["GET", "POST"],
    allowedHeaders: ["authorization", "content-type", "idempotency-key"],
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
      request.log.warn({ err: error, errorCode: "VALIDATION_ERROR" }, "API framework request rejected");
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR" } });
    }
    if (statusCode === 415) {
      request.log.warn({ err: error, errorCode: "UNSUPPORTED_MEDIA_TYPE" }, "API framework request rejected");
      return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE" } });
    }
    if (statusCode === 413) {
      request.log.warn({ err: error, errorCode: "PAYLOAD_TOO_LARGE" }, "API framework request rejected");
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
    if (request.routeOptions.url === "/health") return;

    const identity = await dependencies.authenticate(request.headers.authorization);
    if (!identity) {
      request.log.warn({ errorCode: "UNAUTHENTICATED" }, "API authentication failed");
      await reply.code(401).send({ error: { code: "UNAUTHENTICATED" } });
      return reply;
    }

    try {
      asAuthenticatedRequest(request).user = await dependencies.persistence.createUser({
        privyUserId: identity.privyUserId,
      });
    } catch (error) {
      const result = sendError(request, error);
      await reply.code(result.statusCode).send(result.body);
      return reply;
    }
  });

  app.get("/v1/me", async (request) => asAuthenticatedRequest(request).user);

  app.get("/v1/goals", async (request, reply) =>
    handle(request, reply, () =>
      dependencies.persistence.listGoals(asAuthenticatedRequest(request).user.id),
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

  app.post("/v1/goals", async (request, reply) =>
    handle(request, reply, async () => {
      const body = requireObject(request.body);
      const targetDateValue = body.targetDate;
      if (
        targetDateValue !== undefined &&
        targetDateValue !== null &&
        typeof targetDateValue !== "string"
      ) {
        throw new PersistenceValidationError("targetDate must be a string or null");
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

  app.get("/v1/commitments", async (request, reply) =>
    handle(request, reply, async () => {
      const commitments = await dependencies.persistence.listCommitments(
        asAuthenticatedRequest(request).user.id,
      );
      const reconciled = await Promise.all(commitments.map(async (commitment) => {
        if (commitment.state !== "ACTIVE" || !commitment.onchainCommitmentId) return commitment;
        if (!dependencies.commitmentSettlementVerifier) {
          throw new CommitmentSettlementUnavailableError();
        }
        const settlement = await settlementRequest(() => (
          dependencies.commitmentSettlementVerifier!.inspect({
            offchainCommitmentId: commitment.id,
            onchainCommitmentId: commitment.onchainCommitmentId!,
            startAt: new Date(commitment.epochStart),
            endAt: new Date(commitment.epochEnd),
          })
        ));
        const targetState = ({
          2: "COMPLETED",
          3: "FAILED",
          4: "CANCELLED",
        } as const)[settlement.status as 2 | 3 | 4];
        if (settlement.status === 1) return commitment;
        if (!targetState) {
          throw new CommitmentSettlementMismatchError(
            "Onchain commitment has an invalid active lifecycle status",
          );
        }
        return { ...commitment, state: targetState };
      }));
      return reconciled;
    }),
  );

  app.get<{ Params: { id: string } }>("/v1/commitments/:id", async (request, reply) =>
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
        const settlement = await settlementRequest(() => (
          dependencies.commitmentSettlementVerifier!.inspect({
            offchainCommitmentId: commitment.id,
            onchainCommitmentId: commitment.onchainCommitmentId!,
            startAt: new Date(commitment.epochStart),
            endAt: new Date(commitment.epochEnd),
          })
        ));
        const targetState = ({
          2: "COMPLETED",
          3: "FAILED",
          4: "CANCELLED",
        } as const)[settlement.status as 2 | 3 | 4];
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
      const parameters = requireObject(body.parameters) as Record<string, JsonValue>;
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

  app.post<{ Params: { id: string } }>("/v1/commitments/:id/activate", async (request, reply) =>
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

      const verifiedSettlement = await settlementRequest(() => (
        dependencies.commitmentSettlementVerifier!.verifyActive({
          offchainCommitmentId: commitment.id,
          onchainCommitmentId,
          transactionHash,
          startAt: new Date(commitment.epochStart),
          endAt: new Date(commitment.epochEnd),
        })
      ));

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
      const settledState = ({
        2: "COMPLETED",
        3: "FAILED",
        4: "CANCELLED",
      } as const)[verifiedSettlement.status as 2 | 3 | 4];
      return settledState ? { ...activated, state: settledState } : activated;
    }),
  );

  app.post<{ Params: { id: string } }>("/v1/commitments/:id/cancel", async (request, reply) =>
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
        commitment.state === "CANCELLED"
        && commitment.onchainCommitmentId === onchainCommitmentId
      ) {
        return dependencies.persistence.cancelCommitment(cancellationInput);
      }
      if (
        commitment.state !== "ACTIVE"
        || commitment.onchainCommitmentId !== onchainCommitmentId
      ) {
        throw new CommitmentSettlementMismatchError(
          "Only a matching onchain active commitment can be cancelled",
        );
      }

      await settlementRequest(() => dependencies.commitmentSettlementVerifier!.verifyCancelled({
        offchainCommitmentId: commitment.id,
        onchainCommitmentId,
        owner,
        startAt: new Date(commitment.epochStart),
        endAt: new Date(commitment.epochEnd),
      }));

      return dependencies.persistence.cancelCommitment(cancellationInput);
    }),
  );

  return app;
}
