import { Link } from "react-router-dom";

type PublicInformationPage = "privacy" | "terms" | "verification";

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

const pageContent: Record<PublicInformationPage, PublicInformationContent> = {
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
        title: "Before launch",
        body: [
          "This page explains the intended privacy approach for the local demo. A full privacy notice will be published before launch, including confirmed providers, purposes, retention periods and deletion choices.",
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

export function PublicInformationScreen({ page }: { readonly page: PublicInformationPage }) {
  const content = pageContent[page];

  return (
    <main className="public-information">
      <header className="public-information__header">
        <Link className="brand" to="/">Kept</Link>
        <Link className="button button--quiet" to="/">Back to home</Link>
      </header>
      <section className="public-information__content">
        <div className="public-information__intro">
          <p className="eyebrow">{content.eyebrow}</p>
          <h1>{content.title}</h1>
          <p>{content.summary}</p>
        </div>
        <div className="public-information__sections">
          {content.sections.map((section, index) => (
            <article className="public-information__section" key={section.title}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{section.title}</h2>
                {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
