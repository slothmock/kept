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
    summary: "Kept is built to keep the product simple for you while limiting the information we collect and expose.",
    sections: [
      {
        title: "Information Kept uses",
        body: [
          "Kept uses the account information needed to run the product, including your sign-in identity, embedded wallet, savings activity, goals and commitments.",
          "We aim to use only the information needed for a feature to work and avoid collecting unrelated personal information.",
        ],
      },
      {
        title: "Savings and blockchain activity",
        body: [
          "Kept uses blockchain infrastructure to hold and move supported assets and to interact with the savings vault. Blockchain transactions are public by design and may include wallet addresses, transaction amounts and contract interactions.",
          "Kept presents this infrastructure as ordinary savings activity in the app, but we cannot make public blockchain records private or delete them.",
        ],
      },
      {
        title: "Commitment verification",
        body: [
          "For savings commitments, Kept can verify progress from the savings and goal-allocation activity already associated with your account.",
          "Where future commitment types need outside evidence, Kept is intended to use the minimum result needed to decide whether the commitment was satisfied rather than retain unnecessary underlying data.",
        ],
      },
      {
        title: "Waitlist emails",
        body: [
          "If you join the Kept waitlist, we store your email address so we can contact you about launch and product availability. Joining the waitlist does not create a Kept account, wallet or savings position.",
          "You can ask us to remove your waitlist email. Waitlist signup is not treated as consent for unrelated marketing.",
        ],
      },
      {
        title: "Pre-launch service",
        body: [
          "Kept is still in pre-launch testing. The product, providers and data flows may change before general availability. A complete privacy notice covering the live service, confirmed providers, retention and deletion choices will be published before launch.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms",
    eyebrow: "Pre-launch test environment",
    summary: "Kept is currently being tested before public launch. Access to the working app is restricted and the service should not be treated as a live consumer savings product.",
    sections: [
      {
        title: "Testing, not a live savings service",
        body: [
          "The current Kept environment is for development, staging and product testing. Features may change, fail or be unavailable while the product is being built.",
          "Do not rely on the current environment to hold real-world savings or to provide a production financial service.",
        ],
      },
      {
        title: "Test assets and networks",
        body: [
          "Where Kept uses test networks or test assets, those assets are for testing only and have no intended monetary value. Do not send real assets to addresses or networks unless Kept clearly identifies a flow as live and supported.",
        ],
      },
      {
        title: "Yield, limits and availability",
        body: [
          "Any yield, available-to-deposit amount, available-to-withdraw amount or other market figure shown in testing can change as the underlying protocol state changes.",
          "Yield is variable and is not guaranteed. Deposit and withdrawal availability can also be limited by the underlying savings market and its available liquidity.",
        ],
      },
      {
        title: "Commitments and rewards",
        body: [
          "Commitments are optional and do not lock your savings. A commitment may qualify for a bounded bonus only when its stated rules are satisfied and verified.",
          "Missing a commitment does not create a penalty against your deposited savings or remove yield already earned.",
        ],
      },
      {
        title: "Before public launch",
        body: [
          "Production terms, risk disclosures, fee information, supported providers and any eligibility restrictions will be published before Kept is made generally available.",
        ],
      },
    ],
  },
  verification: {
    title: "How verification works",
    eyebrow: "Clear commitments, clear evidence",
    summary: "Kept commitments have explicit rules. The app checks the evidence relevant to those rules and determines whether the commitment qualifies.",
    sections: [
      {
        title: "Weekly savings commitments",
        body: [
          "A weekly savings commitment is tied to a specific goal and period. Kept checks the goal-allocation activity associated with your account to determine how much qualifying savings were added during that period.",
          "Savings already held in Kept can count when they are genuinely moved from unassigned savings into the committed goal. Moving money between goals does not count as new qualifying savings.",
        ],
      },
      {
        title: "No manual proof for savings",
        body: [
          "Because Kept already records the relevant savings and goal-allocation activity, you do not need to upload screenshots or manually prove a weekly savings commitment.",
          "The verification logic is designed to use the actual movement of savings rather than rely on a self-reported result.",
        ],
      },
      {
        title: "Preventing double counting",
        body: [
          "Kept is designed so the same savings cannot be moved around repeatedly to manufacture commitment progress. Transfers between goals, withdrawals and reallocations are treated according to their actual source and destination.",
        ],
      },
      {
        title: "Rewards",
        body: [
          "When a commitment qualifies, it may be eligible for the bounded bonus shown for that commitment. The applicable amount and rules are part of the commitment itself.",
          "Commitments remain optional. Failing one does not reduce your savings or remove yield already earned.",
        ],
      },
      {
        title: "Future commitment types",
        body: [
          "Kept may support additional predefined commitments in the future. Where outside verification is required, the goal is to use the minimum information needed to confirm the agreed result and keep unrelated personal data out of the verification process.",
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
