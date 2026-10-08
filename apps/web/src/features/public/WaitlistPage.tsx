import {
  useState,
  type FormEvent,
} from "react";
import {
  CheckCircle2,
  Mail,
} from "lucide-react";
import {
  Link,
} from "react-router-dom";

import keptLogo from "@/assets/img/kept-logo-192x192.png";
import {
  Button,
} from "@/components/ui/button";
import {
  Input,
} from "@/components/ui/input";
import {
  readApiBaseUrl,
} from "@/api/kept-api";
import {
  joinWaitlist,
} from "@/features/public/waitlist-api";
import type {
  Session,
} from "@/app/providers/session";

export function WaitlistPage({
  session,
}: {
  readonly session: Session;
}) {
  const [
    emailOverride,
    setEmailOverride,
  ] =
    useState<
      string | null
    >(null);

  const email =
    emailOverride
    ?? session.email
    ?? "";

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    complete,
    setComplete,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  async function submit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const normalizedEmail =
      email.trim();

    if (
      !normalizedEmail
      || !normalizedEmail
        .includes("@")
    ) {
      setError(
        "Enter a valid email address.",
      );

      return;
    }

    const apiBaseUrl =
      readApiBaseUrl(
        import.meta.env,
      );

    if (!apiBaseUrl) {
      setError(
        "Waitlist signup is temporarily unavailable.",
      );

      return;
    }

    setSubmitting(
      true,
    );
    setError(
      null,
    );

    try {
      await joinWaitlist({
        apiBaseUrl,
        email:
          normalizedEmail,
      });

      setComplete(
        true,
      );
    } catch (
      submitError
    ) {
      setError(
        submitError
          instanceof Error
          ? submitError.message
          : "We couldn't add you to the waitlist. Try again.",
      );
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          to="/waitlist"
          className="flex items-center gap-2 font-semibold tracking-tight"
          aria-label="Kept waitlist"
        >
          <img
            src={keptLogo}
            alt=""
            className="size-8 object-contain"
          />

          <span>
            Kept
          </span>
        </Link>

        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link
            to="/privacy"
            className="hover:text-foreground"
          >
            Privacy
          </Link>

          <Link
            to="/terms"
            className="hover:text-foreground"
          >
            Terms
          </Link>
        </nav>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-8rem)] max-w-6xl place-items-center px-4 py-16 sm:px-6 lg:px-8">
        <section className="w-full max-w-2xl text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Mail className="size-6" />
          </div>

          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            Kept is coming soon
          </p>

          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Save toward what matters.
            <br />
            Keep the promises you make to yourself.
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
            Join the waitlist and we’ll let you know when Kept is ready to use.
          </p>

          {complete ? (
            <div
              className="mx-auto mt-8 flex max-w-lg items-start gap-3 rounded-xl border bg-card p-5 text-left"
              role="status"
            >
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />

              <div>
                <p className="font-medium">
                  You’re on the list.
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  We’ll email you when Kept opens.
                </p>
              </div>
            </div>
          ) : (
            <form
              className="mx-auto mt-8 max-w-lg"
              onSubmit={(event) => {
                void submit(
                  event,
                );
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-label="Email address"
                  aria-invalid={
                    error
                      ? true
                      : undefined
                  }
                  value={email}
                  disabled={
                    submitting
                  }
                  onChange={(event) => {
                    setEmailOverride(
                      event.target.value,
                    );
                    setError(
                      null,
                    );
                  }}
                />

                <Button
                  type="submit"
                  className="sm:min-w-36"
                  disabled={
                    submitting
                  }
                >
                  {submitting
                    ? "Joining…"
                    : "Join waitlist"}
                </Button>
              </div>

              {error ? (
                <p
                  className="mt-3 text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                We’ll use your email to send Kept launch and product availability updates. You can ask us to remove it at any time.
              </p>
            </form>
          )}
        </section>
      </main>

    </div>
  );
}
