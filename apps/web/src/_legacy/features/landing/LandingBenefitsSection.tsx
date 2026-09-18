const benefits = [
  {
    title: "Your savings come first",
    description: "Your savings position is separate from any additional reward for completing a commitment.",
  },
  {
    title: "Encouragement, not punishment",
    description: "Missing a commitment does not punish you. Kept is designed to encourage progress towards consistent commitment.",
  },
  {
    title: "Privacy by default",
    description: "Kept is designed to confirm progress with minimal information.",
  },
] as const;

export function LandingBenefitsSection() {
  return (
    <section className="landing-benefits" aria-label="Why Kept is different">
      <div className="landing-benefits__heading">
        <p className="eyebrow">Why Kept is different</p>
        <h2>Savings that back your progress</h2>
      </div>
      <div className="landing-benefits__grid">
        {benefits.map((benefit, index) => (
          <article key={benefit.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{benefit.title}</h3>
            <p>{benefit.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
