const steps = [
  {
    eyebrow: "Start here",
    title: "Pick a goal",
    description: "Save for an emergency fund, a holiday, a course, a project, or anything else that is important to you.",
  },
  {
    eyebrow: "Make it yours",
    title: "Make a simple plan",
    description: "Choose a clear commitment, such as saving a set amount each week, Kept verifies upon completion.",
  },
  {
    eyebrow: "Keep going",
    title: "Follow through",
    description: "When you complete and verify a commitment, you may qualify for an additional reward.",
  },
  {
    eyebrow: "Grow your savings",
    title: "Earn more for keeping your commitments",
    description: "Kept rewards you for keeping your commitments, helping you grow your savings faster.",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section className="landing-vaults" aria-labelledby="landing-vaults-heading">
      <div className="landing-section-heading">
        <p className="eyebrow">How Kept works</p>
        <h2 id="landing-vaults-heading">
          Build a savings habit around what matters to you
        </h2>
        <p>
          Start with something you want to save for, make a plan you can stick to,
          and get recognition for following through.
        </p>
      </div>

      <div className="landing-vault-grid">
        {steps.map((step, index) => (
          <article
            className={`landing-vault-card${index === 0 || index === 3 ? " landing-vault-card--low" : ""
              }`}
            key={step.title}
          >
            <span className="landing-vault-card__number">
              {String(index + 1).padStart(2, "0")}
            </span>

            <p className="eyebrow">{step.eyebrow}</p>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
