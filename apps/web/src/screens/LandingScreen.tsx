import { LandingBenefitsSection } from "../features/landing/LandingBenefitsSection.js";
import { LandingFooter } from "../features/landing/LandingFooter.js";
import { LandingHeader } from "../features/landing/LandingHeader.js";
import { LandingHero } from "../features/landing/LandingHero.js";
import { HowItWorksSection } from "../features/landing/HowItWorksSection.js";
import type { Session } from "../session.js";

interface LandingScreenProps {
  readonly session: Session;
}

export function LandingScreen({
  session,
}: LandingScreenProps) {
  return (
    <>
      <main className="landing">
        <LandingHeader session={session} />
        <LandingHero session={session} />
        <HowItWorksSection />
        <LandingBenefitsSection />
      </main>
      <LandingFooter />
    </>
  );
}