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

export interface AuthenticatedIdentity {
  readonly privyUserId: string;
}

export interface ApiDependencies {
  readonly authenticate: (
    authorization: string | undefined,
  ) => Promise<AuthenticatedIdentity | null>;
  readonly persistence: Pick<
    KeptPersistenceService,
    "createUser"
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
    methods: ["GET"],
    allowedHeaders: ["authorization"],
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

    const identity = await dependencies.authenticate(
      request.headers.authorization,
    );
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

  app.get("/v1/me", async (request) =>
    asAuthenticatedRequest(request).user,
  );

  return app;
}
