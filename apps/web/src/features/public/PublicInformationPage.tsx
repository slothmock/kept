import {
  ArrowLeft,
} from "lucide-react";
import {
  Link,
} from "react-router-dom";

import keptLogo from "@/assets/img/kept-logo-192x192.png";
import {
  Button,
} from "@/components/ui/button";

type PublicInformationPageKind =
  | "privacy"
  | "terms"
  | "verification";

interface InformationSection {
  readonly title: string;
  readonly body: readonly string[];
}

interface PublicInformationContent {
  readonly title: string;
  readonly eyebrow: string;
  readonly summary: string;
  readonly sections: readonly InformationSection[];
}

const pageContent: Record<
  PublicInformationPageKind,
  PublicInformationContent
> = {
  privacy: {
    title: "Privacy",
    eyebrow: "How Kept handles information",
    summary: "Kept is designed to confirm progress without collecting or revealing more information than the commitment requires.",
    sections: [
      {
        title: "Information Kept needs",
        body: [
          "The demo uses account details, savings activity, goal information and the status of commitments to provide the product experience.",
          "When outside information is needed for verification, Kept is designed to request only the fields and permissions needed to confirm the agreed result.",
        ],
      },
      {
        title: "What stays private",
        body: [
          "Raw activity evidence, exact locations, route history, unrelated account information and private verifier relationships are not intended to be stored or published by default.",
          "Kept prefers a minimal result—such as confirmation that a commitment was satisfied—over a copy of the underlying evidence.",
        ],
      },
      {
        title: "What is publicly visible",
        body: [
          "A public blockchain records financial transactions such as deposits, withdrawals and reward claims. Kept is designed to keep behavioural labels, raw evidence and verifier identities out of those public records.",
        ],
      },
      {
        title: "Waitlist emails",
        body: [
          "If you join the Kept waitlist, we store your email address so we can send launch and product availability updates. Waitlist signup does not create a Kept financial account or wallet.",
          "You can ask us to remove your waitlist email at any time. We do not use waitlist signup as consent for unrelated marketing.",
        ],
      },
      {
        title: "Before launch",
        body: [
          "A full privacy notice will be published before the live product launches, including confirmed providers, purposes, retention periods and deletion choices.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms",
    eyebrow: "Local test demo",
    summary: "Kept is currently a local demonstration used to test the product experience. It is not a live financial product.",
    sections: [
      {
        title: "A demonstration, not a financial service",
        body: [
          "The current app runs with local test infrastructure. It does not accept deposits for a live Kept savings product, and test assets have no monetary value.",
        ],
      },
      {
        title: "No promised return",
        body: [
          "Any yield shown in the demo is illustrative and variable. There is no guarantee of returns or rewards, and completing a commitment does not create an unlimited or automatic reward entitlement.",
        ],
      },
      {
        title: "Use the demo safely",
        body: [
          "Do not send real assets to local test addresses or use the displayed development keys outside the local environment. Demo behaviour may change as the product is built and reviewed.",
        ],
      },
      {
        title: "Before launch",
        body: [
          "Full product terms, risk disclosures, fees and provider details will be published and made available for review before any live service is offered.",
        ],
      },
    ],
  },
  verification: {
    title: "How verification works",
    eyebrow: "Clear commitments, clear proof",
    summary: "You choose a predefined commitment. Kept defines what counts as completion, then uses the minimum information needed to confirm it.",
    sections: [
      {
        title: "Weekly saving",
        body: [
          "Kept checks the relevant savings activity for the agreed period. The financial transaction already provides the evidence, so no separate personal proof is needed.",
        ],
      },
      {
        title: "Verified activity count",
        body: [
          "An approved provider confirms whether the required activity count was reached. Kept is designed to use the normalized result rather than retain detailed routes, locations or unrelated activity data.",
        ],
      },
      {
        title: "How rewards fit",
        body: [
          "A verified commitment may qualify for a bounded reward funded from Kept’s own earned revenue. Missing a commitment never reduces your savings or the yield already earned on them.",
        ],
      },
    ],
  },
};

export function PublicInformationPage({
  page,
}: {
  readonly page:
    PublicInformationPageKind;
}) {
  const content =
    pageContent[page];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/70 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
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

            <span>
              Kept
            </span>
          </Link>

          <Button
            variant="ghost"
            render={
              <Link to="/" />
            }
          >
            <ArrowLeft className="size-4" />
            Back to home
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <section className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            {content.eyebrow}
          </p>

          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {content.title}
          </h1>

          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            {content.summary}
          </p>
        </section>

        <div className="mt-12 space-y-4 sm:mt-16">
          {content.sections.map(
            (
              section,
              index,
            ) => (
              <article
                key={section.title}
                className="grid gap-5 rounded-xl border bg-card p-5 shadow-sm sm:grid-cols-[3rem_minmax(0,1fr)] sm:p-6"
              >
                <div
                  className="grid size-10 place-items-center rounded-lg bg-primary/10 text-sm font-semibold tabular-nums text-primary"
                  aria-hidden="true"
                >
                  {String(
                    index + 1,
                  ).padStart(
                    2,
                    "0",
                  )}
                </div>

                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">
                    {section.title}
                  </h2>

                  <div className="mt-3 space-y-3 text-base leading-7 text-muted-foreground">
                    {section.body.map(
                      (
                        paragraph,
                      ) => (
                        <p
                          key={
                            paragraph
                          }
                        >
                          {
                            paragraph
                          }
                        </p>
                      ),
                    )}
                  </div>
                </div>
              </article>
            ),
          )}
        </div>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>
            Kept
          </span>

          <nav
            className="flex flex-wrap gap-x-4 gap-y-2"
            aria-label="Public information"
          >
            <Link
              to="/privacy"
              className="transition-colors hover:text-foreground"
            >
              Privacy
            </Link>

            <Link
              to="/terms"
              className="transition-colors hover:text-foreground"
            >
              Terms
            </Link>

            <Link
              to="/verification"
              className="transition-colors hover:text-foreground"
            >
              Verification
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
