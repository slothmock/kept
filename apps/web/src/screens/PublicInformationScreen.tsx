import { Link } from "react-router-dom";

type PublicInformationPage = "privacy" | "terms" | "verification" | "sponsors";

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
        title: "Private study verification",
        body: [
          "A chosen verifier privately confirms the study session. Their relationship and identity are not intended to be published onchain, and uncertain cases can be sent for additional verification.",
        ],
      },
      {
        title: "How rewards fit",
        body: [
          "A verified result may qualify for a bounded reward from a separately funded reward pool. The additional reward is separate from the return on your savings, and missing a commitment does not take savings or base yield away.",
        ],
      },
    ],
  },
  sponsors: {
    title: "Sponsors",
    eyebrow: "Verifiable bonuses, paid into savings",
    summary: "An employer, university or programme provider could sponsor individual Kept accounts and attach a funded contribution to a clear task or milestone. Complete it, verify it and the contribution unlocks.",
    sections: [
      {
        title: "Sponsor an individual account",
        body: [
          "The institution identifies the employees, students or members it wants to support. Each person is invited to activate their own Kept account and accept the programme rules.",
          "The participant owns and controls the account. The sponsor provides the opportunity and the contribution, the participant keeps their commitment.",
        ],
      },
      {
        title: "Fund each contribution up front",
        body: [
          "The sponsor commits a defined amount for each invited participant before the programme starts. Each participant knows what they can earn and is not obligated to complete the commitment.",
          "Programme limits, deadlines and the treatment of contributions that are not earned must be disclosed in advance.",
        ],
      },
      {
        title: "Verify a clear milestone",
        body: [
          "The sponsor chooses an approved commitment with an objective rule—for example, reaching an attendance threshold, completing accredited training or building an agreed emergency-savings balance.",
          "The relevant system confirms only whether the rule was satisfied or not, without revealing private user data.",
        ],
      },
      {
        title: "Unlock the contribution",
        body: [
          "A successful verification turns the participant's conditional contribution into an individual entitlement. They can claim it into their own Kept savings and withdraw it, or use it in another Kept vault.",
        ],
      },
      {
        title: "Participant savings stay theirs",
        body: [
          "The sponsor never receives custody or withdrawal authority over participant savings. Missing a milestone does not affect the participant's own savings—it only means the conditional sponsor contribution is not earned.",
        ],
      },
      {
        title: "Private by default",
        body: [
          "The sponsor sees only what it needs to administer the programme and confirm the agreed result—not unrelated activity, complete savings balances or private evidence. Public settlement uses a minimal qualification record rather than the underlying performance data.",
        ],
      },
      {
        title: "Current status",
        body: [
          "Sponsored accounts are a planned concept and are not available in the current local demo. Account invitations, reserved funding, expiry, reporting, disputes and legal terms must be defined before implementation.",
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
