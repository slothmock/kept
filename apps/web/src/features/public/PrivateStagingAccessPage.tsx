import {
  LockKeyhole,
  LogOut,
} from "lucide-react";

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

export function PrivateStagingAccessPage({
  session,
}: {
  readonly session:
    Session;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-12">
      <Card className="w-full max-w-lg shadow-none">
        <CardContent className="p-6 sm:p-8">
          <div className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
            <LockKeyhole className="size-5" />
          </div>

          <h1 className="mt-6 text-h2 font-semibold tracking-tight">
            Private staging environment
          </h1>

          <p className="mt-3 text-body text-muted-foreground">
            This Kept environment is restricted to approved staging accounts.
          </p>

          {session.email ? (
            <p className="mt-4 rounded-lg border border-border bg-surface px-4 py-3 text-caption text-muted-foreground">
              Signed in as{" "}
              <span className="font-medium text-foreground">
                {session.email}
              </span>
            </p>
          ) : null}

          <Button
            type="button"
            variant="outline"
            className="mt-6"
            onClick={() => {
              void session.logout();
            }}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
