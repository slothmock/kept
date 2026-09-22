export type DiagnosticLevel = "info" | "warn" | "error";

export interface DiagnosticError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly code?: string;
  readonly cause?: DiagnosticError;
}

export interface DiagnosticEntry {
  readonly timestamp: string;
  readonly level: DiagnosticLevel;
  readonly event: string;
  readonly error?: DiagnosticError;
  readonly context?: Readonly<Record<string, unknown>>;
}

interface CreateDiagnosticsInput {
  readonly sink?: (entry: DiagnosticEntry) => void;
  readonly now?: () => string;
}

export interface Diagnostics {
  info(event: string, context?: Readonly<Record<string, unknown>>): void;
  warn(event: string, error: unknown, context?: Readonly<Record<string, unknown>>): void;
  error(event: string, error: unknown, context?: Readonly<Record<string, unknown>>): void;
}

const SECRET_PATTERNS = [
  /(authorization\s*[:=]\s*Bearer\s+)[^\s,;]+/gi,
  /(Bearer\s+)[^\s,;]+/gi,
  /((?:token|api[_-]?key|secret|password)\s*[:=]\s*)[^\s,;]+/gi,
  /(\b)eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /(https?:\/\/[^\s?]+)\?[^\s]+/gi,
  /(\b)0x[A-Fa-f0-9]{40,}\b/g,
] as const;
const SENSITIVE_CONTEXT_KEY = /authorization|token|secret|password|address|amount|balance|calldata|payload|signature|hash/i;

function redact(text: string): string {
  return SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, "$1[REDACTED]"),
    text,
  );
}

function safeContext(context: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(context).map(([key, value]) => {
    if (SENSITIVE_CONTEXT_KEY.test(key)) return [key, "[REDACTED]"];
    if (typeof value === "string") return [key, redact(value)];
    if (typeof value === "number" || typeof value === "boolean" || value === null) return [key, value];
    return [key, `[${Array.isArray(value) ? "array" : typeof value}]`];
  }));
}

function safeError(error: unknown, depth = 0): DiagnosticError {
  if (typeof error === "string") {
    return { name: "UnknownError", message: redact(error) };
  }
  if (!(error instanceof Error)) {
    return { name: "UnknownError", message: "Non-Error value thrown" };
  }

  const diagnostic = error as Error & {
    readonly diagnosticCause?: unknown;
    readonly diagnosticCode?: unknown;
  };
  return {
    name: redact(error.name || "Error"),
    message: redact(error.message || "Unknown error"),
    ...(error.stack ? { stack: redact(error.stack) } : {}),
    ...(typeof diagnostic.diagnosticCode === "string"
      ? { code: redact(diagnostic.diagnosticCode) }
      : {}),
    ...(depth < 2 && diagnostic.diagnosticCause !== undefined
      ? { cause: safeError(diagnostic.diagnosticCause, depth + 1) }
      : {}),
  };
}

function defaultSink(entry: DiagnosticEntry): void {
  const consoleApi = globalThis.console;
  if (!consoleApi) return;
  if (entry.level === "error") consoleApi.error("[Kept]", entry);
  else if (entry.level === "warn") consoleApi.warn("[Kept]", entry);
  else consoleApi.info("[Kept]", entry);
}

export function createDiagnostics(input: CreateDiagnosticsInput = {}): Diagnostics {
  const sink = input.sink ?? defaultSink;
  const now = input.now ?? (() => new Date().toISOString());

  function emit(
    level: DiagnosticLevel,
    event: string,
    error?: unknown,
    context?: Readonly<Record<string, unknown>>,
  ): void {
    sink({
      timestamp: now(),
      level,
      event,
      ...(error === undefined ? {} : { error: safeError(error) }),
      ...(context === undefined ? {} : { context: safeContext(context) }),
    });
  }

  return {
    info: (event, context) => emit("info", event, undefined, context),
    warn: (event, error, context) => emit("warn", event, error, context),
    error: (event, error, context) => emit("error", event, error, context),
  };
}

export const diagnostics = createDiagnostics();
