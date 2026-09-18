import { Link } from "react-router-dom";

import type { Session } from "../../session.js";

export function LandingHeader({ session }: { readonly session: Session }) {
  return (
    <header className="landing-header">
      <div className="landing-header__inner">
        <Link className="brand" to="/">Kept</Link>
        {session.isAuthenticated ? (
          <Link className="button button--quiet" to="/dashboard">Dashboard</Link>
        ) : (
          <button className="button button--quiet" type="button" onClick={session.login}>Sign in</button>
        )}
      </div>
    </header>
  );
}
