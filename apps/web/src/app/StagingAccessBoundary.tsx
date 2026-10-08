import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  createAuthenticatedJsonClient,
} from "@/api/http-client";
import {
  readApiBaseUrl,
} from "@/api/kept-api";
import type {
  Session,
} from "@/app/providers/session";
import {
  Button,
} from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Skeleton,
} from "@/components/ui/skeleton";
import {
  PrivateStagingAccessPage,
} from "@/features/public/PrivateStagingAccessPage";
import {
  ConsumerError,
} from "@/lib/consumer-error";

type AccessState =
  | {
      readonly kind:
        "checking";
    }
  | {
      readonly kind:
        "allowed";
    }
  | {
      readonly kind:
        "denied";
    }
  | {
      readonly kind:
        "error";
    };

export function StagingAccessBoundary({
  session,
  children,
}: {
  readonly session:
    Session;
  readonly children:
    ReactNode;
}) {
  const apiBaseUrl =
    useMemo(
      () =>
        readApiBaseUrl(
          import.meta.env,
        ),
      [],
    );

  const [
    accessState,
    setAccessState,
  ] =
    useState<AccessState>({
      kind:
        "checking",
    });

  const verifyAccess =
    useCallback(
      async () => {
        if (!apiBaseUrl) {
          setAccessState({
            kind:
              "error",
          });

          return;
        }

        try {
          const client =
            createAuthenticatedJsonClient({
              baseUrl:
                apiBaseUrl,
              getAccessToken:
                session.getAccessToken,
            });

          await client.request(
            "/v1/me",
          );

          setAccessState({
            kind:
              "allowed",
          });
        } catch (error) {
          if (
            error
              instanceof ConsumerError
            && error
              .diagnosticCode
              ===
              "STAGING_ACCESS_DENIED"
          ) {
            setAccessState({
              kind:
                "denied",
            });

            return;
          }

          setAccessState({
            kind:
              "error",
          });
        }
      },
      [
        apiBaseUrl,
        session.getAccessToken,
      ],
    );

  useEffect(
    () => {
      void verifyAccess();
    },
    [
      verifyAccess,
    ],
  );

  if (
    accessState.kind
    === "checking"
  ) {
    return (
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-3">
          <Skeleton className="h-10 w-48 rounded-md" />
          <Skeleton className="h-5 w-80 max-w-full rounded-md" />
        </div>

        <Skeleton className="h-56 w-full rounded-xl" />

        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </div>
      </div>
    );
  }

  if (
    accessState.kind
    === "denied"
  ) {
    return (
      <PrivateStagingAccessPage
        session={
          session
        }
      />
    );
  }

  if (
    accessState.kind
    === "error"
  ) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4 py-12">
        <Card className="w-full max-w-lg shadow-none">
          <CardContent className="p-6 sm:p-8">
            <h1 className="text-h2 font-semibold tracking-tight">
              We couldn't verify staging access
            </h1>

            <p className="mt-3 text-body text-muted-foreground">
              Kept couldn't confirm whether this account can use the staging environment.
            </p>

            <Button
              type="button"
              className="mt-6"
              onClick={() => {
                setAccessState({
                  kind:
                    "checking",
                });
                void verifyAccess();
              }}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return children;
}
