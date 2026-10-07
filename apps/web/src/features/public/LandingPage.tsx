import { useState, type ReactNode } from "react";
import { ArrowRight, Check, ShieldCheck, Sparkles, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Session } from "@/app/providers/session";
import { consumerErrorMessage } from "@/lib/consumer-error";
import { diagnostics } from "@/lib/diagnostics";
import { Link, useNavigate } from "react-router-dom";

import keptLogo from "@/assets/img/kept-logo-192x192.png";

export function LandingPage({ session }: { readonly session: Session }) {
  const navigate = useNavigate();
  const [signInPending, setSignInPending] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  async function start() {
    if (session.isAuthenticated) {
      navigate("/dashboard");
      return;
    }
    setSignInPending(true);
    setSignInError(null);
    try {
      await session.login();
    } catch (error) {
      diagnostics.error("auth.sign_in_failed", error);
      setSignInError(consumerErrorMessage(error, "We couldn't start sign-in. Try again."));
    } finally {
      setSignInPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
          aria-label="Kept home"
        >
          <img
            src={keptLogo}
            alt=""
            className="size-8 object-contain"
          />

          <span>Kept</span>
        </Link>

        <div className="flex items-center gap-2">
          <Button variant="ghost" render={<Link to="/verification" />}>
            How verification works
          </Button>

          <Button onClick={() => void start()} disabled={signInPending}>
            {session.isAuthenticated ? "Open dashboard" : signInPending ? "Opening sign-in…" : "Get started"}
          </Button>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:px-8 lg:py-28">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" />
              Goals with follow-through
            </div>
            <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Save toward what matters. Keep the promises you make to yourself.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Kept combines goals, simple weekly commitments, and productive savings without turning your finances into a crypto dashboard.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => void start()} disabled={signInPending}>
                {session.isAuthenticated ? "Open dashboard" : signInPending ? "Opening sign-in…" : "Create your first goal"}
                <ArrowRight className="size-4" />
              </Button>
              <Button size="lg" variant="outline" render={<Link to="/verification" />}>
                See how commitments work
              </Button>
            </div>
            {signInError ? <p className="mt-3 text-sm text-destructive" role="alert">{signInError}</p> : null}
          </div>

          <Card className="overflow-hidden border-primary/10 shadow-xl shadow-primary/5">
            <CardContent className="space-y-5 p-6 sm:p-8">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Emergency fund</p>
                <p className="mt-2 text-3xl font-semibold">640.00 <span className="text-lg text-muted-foreground">/ 1,000 USDC</span></p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-[64%] rounded-full bg-primary" />
                </div>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">This week</p>
                    <p className="mt-1 font-medium">Save 50 USDC</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">In progress</span>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {["Set a goal", "Choose a commitment", "Keep going"].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="size-4 text-primary" />
                    {item}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="border-y bg-card/50">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
            <Feature icon={<Target className="size-5" />} title="Start with a goal" copy="Define the outcome first. Kept keeps the interface focused on what you are working toward." />
            <Feature icon={<Check className="size-5" />} title="Make it weekly" copy="Pick a measurable savings commitment small enough to repeat." />
            <Feature icon={<ShieldCheck className="size-5" />} title="Your money stays yours" copy="Commitments do not lock your savings. Withdraw up to the amount currently available." />
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <span>Kept</span>
        <nav className="flex gap-4">
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/verification" className="hover:text-foreground">Verification</Link>
        </nav>
      </footer>
    </div>
  );
}

function Feature({ icon, title, copy }: { readonly icon: ReactNode; readonly title: string; readonly copy: string }) {
  return (
    <div>
      <div className="mb-4 grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">{icon}</div>
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
    </div>
  );
}
