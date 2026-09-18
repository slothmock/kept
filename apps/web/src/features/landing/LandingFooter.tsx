import { Link } from "react-router-dom";

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer__inner">
        <Link className="brand" to="/">Kept</Link>
        <nav aria-label="Footer">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/verification">Verification</Link>
          <Link to="/sponsors">Sponsors</Link>
        </nav>
      </div>
    </footer>
  );
}
