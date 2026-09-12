import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

import {
  IdempotencyConflictError,
  IncompleteIdempotencyRecordError,
  NotFoundError,
  PersistenceValidationError,
} from "./persistence/errors.js";
import type {
  CommitmentDto,
  GoalDto,
  KeptPersistenceService,
  UserDto,
} from "./persistence/index.js";
import {
  CommitmentStateMismatchError,
  InvalidCommitmentTransitionError,
  StaleCommitmentVersionError,
  type JsonValue,
} from "./domain/commitments/index.js";

export interface AuthenticatedIdentity {
  readonly privyUserId: string;
}

export interface ApiDependencies {
  readonly authenticate: (authorization: string | undefined) => Promise<AuthenticatedIdentity | null>;
  readonly persistence: Pick<
    KeptPersistenceService,
    "createUser" | "createGoal" | "listGoals" | "getGoal" | "createCommitmentDraft" | "listCommitments" | "getCommitment" | "activateCommitment"
  >;
}

export interface BuildAppOptions {
  readonly enableLogging?: boolean;
}

interface AuthenticatedRequest extends FastifyRequest {
  user: UserDto;
}

interface CreateGoalBody {
  readonly name: unknown;
  readonly targetAmountAtomic: unknown;
  readonly targetDate: unknown;
}

interface CreateCommitmentBody {
  readonly goalId: unknown;
  readonly definition: unknown;
  readonly parameters: unknown;
  readonly epochStart: unknown;
  readonly epochEnd: unknown;
  readonly verificationDeadline: unknown;
}

interface ActivateCommitmentBody {
  readonly expectedVersion: unknown;
}

function asAuthenticatedRequest(request: FastifyRequest): AuthenticatedRequest {
  return request as AuthenticatedRequest;
}

function hasCreateGoalBody(value: unknown): value is CreateGoalBody {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasCreateCommitmentBody(value: unknown): value is CreateCommitmentBody {
  return isRecord(value);
}

function hasActivateCommitmentBody(value: unknown): value is ActivateCommitmentBody {
  return isRecord(value);
}

function parseCommitmentDefinition(value: unknown): { readonly code: string; readonly version: number } | null {
  if (
    !isRecord(value) ||
    typeof value.code !== "string" ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version)
  ) {
    return null;
  }
  return { code: value.code, version: value.version };
}

function sendError(
  request: FastifyRequest,
  error: unknown,
): { readonly statusCode: number; readonly body: { readonly error: { readonly code: string } } } {
  if (error instanceof NotFoundError) {
    return { statusCode: 404, body: { error: { code: "NOT_FOUND" } } };
  }
  if (error instanceof PersistenceValidationError) {
    return { statusCode: 400, body: { error: { code: "VALIDATION_ERROR" } } };
  }
  if (error instanceof IdempotencyConflictError) {
    return { statusCode: 409, body: { error: { code: "IDEMPOTENCY_CONFLICT" } } };
  }
  if (
    error instanceof StaleCommitmentVersionError ||
    error instanceof CommitmentStateMismatchError ||
    error instanceof InvalidCommitmentTransitionError
  ) {
    return { statusCode: 409, body: { error: { code: "COMMITMENT_CONFLICT" } } };
  }
  if (error instanceof IncompleteIdempotencyRecordError) {
    request.log.error(error, "idempotency record was incomplete");
    return { statusCode: 409, body: { error: { code: "REQUEST_IN_PROGRESS" } } };
  }

  request.log.error(error, "unhandled API error");
  return { statusCode: 500, body: { error: { code: "INTERNAL_ERROR" } } };
}

export function buildApp(dependencies: ApiDependencies, options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.enableLogging ? { redact: ["req.headers.authorization"] } : false,
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
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR" } });
    }
    if (statusCode === 415) {
      return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE" } });
    }
    if (statusCode === 413) {
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
    if (request.routeOptions.url === "/health") {
      return;
    }

    const identity = await dependencies.authenticate(request.headers.authorization);
    if (!identity) {
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

  app.get("/v1/goals", async (request) =>
    dependencies.persistence.listGoals(asAuthenticatedRequest(request).user.id),
  );

  app.post<{ Body: unknown }>("/v1/goals", async (request, reply) => {
    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || !hasCreateGoalBody(request.body)) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR" } });
    }
    const { name, targetAmountAtomic, targetDate } = request.body;
    if (
      typeof name !== "string" ||
      typeof targetAmountAtomic !== "string" ||
      (targetDate !== null && typeof targetDate !== "string")
    ) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR" } });
    }

    try {
      const goal = await dependencies.persistence.createGoal({
        userId: asAuthenticatedRequest(request).user.id,
        idempotencyKey,
        name,
        targetAmountAtomic,
        targetDate,
      });
      return reply.code(201).send(goal);
    } catch (error) {
      const result = sendError(request, error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get<{ Params: { id: string } }>("/v1/goals/:id", async (request, reply) => {
    try {
      const goal: GoalDto | null = await dependencies.persistence.getGoal(
        asAuthenticatedRequest(request).user.id,
        request.params.id,
      );
      if (!goal) {
        return reply.code(404).send({ error: { code: "NOT_FOUND" } });
      }
      return goal;
    } catch (error) {
      const result = sendError(request, error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post<{ Body: unknown }>("/v1/commitments", async (request, reply) => {
    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !idempotencyKey.trim() ||
      !hasCreateCommitmentBody(request.body) ||
      typeof request.body.goalId !== "string" ||
      typeof request.body.epochStart !== "string" ||
      typeof request.body.epochEnd !== "string" ||
      typeof request.body.verificationDeadline !== "string" ||
      !isRecord(request.body.parameters)
    ) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR" } });
    }
    const definition = parseCommitmentDefinition(request.body.definition);
    if (!definition) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR" } });
    }

    try {
      const commitment: CommitmentDto = await dependencies.persistence.createCommitmentDraft({
        userId: asAuthenticatedRequest(request).user.id,
        idempotencyKey,
        goalId: request.body.goalId,
        definition,
        parameters: request.body.parameters as Record<string, JsonValue>,
        epochStart: request.body.epochStart,
        epochEnd: request.body.epochEnd,
        verificationDeadline: request.body.verificationDeadline,
      });
      return reply.code(201).send(commitment);
    } catch (error) {
      const result = sendError(request, error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get("/v1/commitments", async (request) =>
    dependencies.persistence.listCommitments(asAuthenticatedRequest(request).user.id),
  );

  app.get<{ Params: { id: string } }>("/v1/commitments/:id", async (request, reply) => {
    try {
      const commitment: CommitmentDto | null = await dependencies.persistence.getCommitment(
        asAuthenticatedRequest(request).user.id,
        request.params.id,
      );
      if (!commitment) {
        return reply.code(404).send({ error: { code: "NOT_FOUND" } });
      }
      return commitment;
    } catch (error) {
      const result = sendError(request, error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/v1/commitments/:id/activate",
    async (request, reply) => {
      const idempotencyKey = request.headers["idempotency-key"];
      if (
        typeof idempotencyKey !== "string" ||
        !idempotencyKey.trim() ||
        !hasActivateCommitmentBody(request.body) ||
        typeof request.body.expectedVersion !== "number" ||
        !Number.isSafeInteger(request.body.expectedVersion)
      ) {
        return reply.code(400).send({ error: { code: "VALIDATION_ERROR" } });
      }

      try {
        const commitment: CommitmentDto = await dependencies.persistence.activateCommitment({
          userId: asAuthenticatedRequest(request).user.id,
          commitmentId: request.params.id,
          expectedVersion: request.body.expectedVersion,
          idempotencyKey,
        });
        return reply.code(200).send(commitment);
      } catch (error) {
        const result = sendError(request, error);
        return reply.code(result.statusCode).send(result.body);
      }
    },
  );

  return app;
}
