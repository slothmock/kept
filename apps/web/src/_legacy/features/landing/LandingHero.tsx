import { Link } from "react-router-dom";

import type { Session } from "../../auth/session.js";

export function LandingHero({ session }: { readonly session: Session }) {
  return (
    <section className="landing-hero">
      <div className="landing-hero__content">
        <p className="eyebrow">Savings that support your commitments</p>
        <h1>Keep your commitments. Grow your savings.</h1>
        <p className="landing-hero__description">Kept helps you save toward something that matters and rewards you for keeping the commitments that help you get there.</p>
      </div>

      <aside className="landing-hero__visual" aria-label="Example Kept savings plan">
        <div className="landing-visual__topline">
          <span>My savings plan</span>
          <span className="landing-visual__status">In progress</span>
        </div>
        <div className="landing-visual__balance">
          <span>Goal</span>
          <strong>Laptop fund</strong>
        </div>
        <div className="landing-visual__vaults">
          <div className="landing-visual__vault landing-visual__vault--active">
            <span>A goal that matters</span>
            <strong>Save for something that matters</strong>
            <small>Set a target and see clear progress</small>
          </div>
          <div className="landing-visual__vault">
            <span>Choose a commitment</span>
            <strong>Save a set amount each week</strong>
            <small>Kept defines what counts as complete</small>
          </div>
          <div className="landing-visual__vault">
            <span>Earn additional rewards</span>
            <strong>Keep your commitments to earn more</strong>
            <small>Increased rewards for consistent commitment</small>
          </div>
        </div>
      </aside>
    </section>
  );
}
