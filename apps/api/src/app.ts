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
    return { statusCode: 404, body: { error: { code: "NOT_FOUND" } } };
  }
  if (error instanceof PersistenceValidationError) {
    return { statusCode: 400, body: { error: { code: "VALIDATION_ERROR" } } };
  }
  if (error instanceof IdempotencyConflictError) {
    return { statusCode: 409, body: { error: { code: "IDEMPOTENCY_CONFLICT" } } };
  }
  if (error instanceof IncompleteIdempotencyRecordError) {
    request.log.error(error, "idempotency record was incomplete");
    return { statusCode: 409, body: { error: { code: "REQUEST_IN_PROGRESS" } } };
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
    if (request.routeOptions.url === "/health") return;

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
    handle(request, reply, () =>
      dependencies.persistence.listCommitments(asAuthenticatedRequest(request).user.id),
    ),
  );

  app.get<{ Params: { id: string } }>("/v1/commitments/:id", async (request, reply) =>
    handle(request, reply, async () => {
      const commitment = await dependencies.persistence.getCommitment(
        asAuthenticatedRequest(request).user.id,
        request.params.id,
      );
      if (!commitment) throw new NotFoundError("Commitment");
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
      const body = requireObject(request.body);
      return dependencies.persistence.activateCommitment({
        userId: asAuthenticatedRequest(request).user.id,
        commitmentId: request.params.id,
        expectedVersion: requireInteger(body, "expectedVersion"),
        idempotencyKey: requireIdempotencyKey(request),
      });
    }),
  );

  app.post<{ Params: { id: string } }>("/v1/commitments/:id/cancel", async (request, reply) =>
    handle(request, reply, async () => {
      const body = requireObject(request.body);
      return dependencies.persistence.cancelCommitment({
        userId: asAuthenticatedRequest(request).user.id,
        commitmentId: request.params.id,
        expectedVersion: requireInteger(body, "expectedVersion"),
        idempotencyKey: requireIdempotencyKey(request),
      });
    }),
  );

  return app;
}
