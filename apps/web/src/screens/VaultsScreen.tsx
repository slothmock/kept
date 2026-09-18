import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell.js";

export function VaultsScreen() {
  return (
    <AppShell>
      <div className="vaults-page">
        <section className="vaults-hero">
          <p className="eyebrow">Savings vaults</p>
          <h1>Choose a savings vault</h1>
          <p>
            Each vault has a distinct risk profile and strategy. Returns are variable and are not guaranteed.
          </p>
        </section>

        <section className="vault-grid" aria-label="Available savings vaults">
          <article className="vault-card vault-card--available">
            <div className="vault-card__header">
              <div>
                <p className="eyebrow">Available locally</p>
                <h2>Low risk</h2>
              </div>
              <span className="status-pill">Available</span>
            </div>
            <p>
              A USDC savings vault using Aave for the underlying variable yield strategy.
            </p>
            <dl className="vault-card__details">
              <div><dt>Asset</dt><dd>USDC</dd></div>
              <div><dt>Strategy</dt><dd>Aave supply</dd></div>
              <div><dt>Risk profile</dt><dd>Lower risk</dd></div>
            </dl>
            <Link className="button button--primary" to="/dashboard">
              View low-risk vault
            </Link>
          </article>

          <article className="vault-card vault-card--planned">
            <div className="vault-card__header">
              <div>
                <p className="eyebrow">Planned</p>
                <h2>High risk</h2>
              </div>
              <span className="status-pill status-pill--neutral">Not available</span>
            </div>
            <p>
              A future stablecoin liquidity-provider vault intended to seek higher variable yield with higher risk.
            </p>
            <dl className="vault-card__details">
              <div><dt>Asset</dt><dd>USDC</dd></div>
              <div><dt>Strategy</dt><dd>Stablecoin LP — to be selected</dd></div>
              <div><dt>Risk profile</dt><dd>Higher risk</dd></div>
            </dl>
            <p className="vault-card__notice">
              The LP protocol, liquidity conditions, and withdrawal mechanics have not been selected. Deposits are unavailable.
            </p>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
