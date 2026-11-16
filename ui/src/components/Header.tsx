import { Link, NavLink, useLocation } from 'react-router-dom';
import type { DemoStatus } from '../types';
import './Header.css';

interface HeaderProps {
  demoStatus: DemoStatus | null;
}

export function Header({ demoStatus }: HeaderProps) {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="site-header-left">
          <Link to="/" className="site-brand" data-testid="nav-home">
            <span className="site-brand-dot" aria-hidden="true" />
            <span>SDLC Agent Orchestrator</span>
          </Link>

          {demoStatus && (
            <span
              className="demo-badge"
              data-testid="demo-mode-badge"
              title="Public demo rate limit per IP per day"
            >
              Demo mode &middot; {demoStatus.ip_remaining}/{demoStatus.ip_limit} left
            </span>
          )}
        </div>

        <nav className="site-nav" aria-label="Primary navigation">
          {isHome ? (
            <a href="#how-it-works" className="site-nav-link">
              How it works
            </a>
          ) : (
            <Link to="/#how-it-works" className="site-nav-link">
              How it works
            </Link>
          )}
          <NavLink
            to="/fix"
            className={({ isActive }) =>
              `site-nav-link ${isActive ? 'active' : ''}`.trim()
            }
            data-testid="nav-fix"
          >
            Fix a bug
          </NavLink>
          <NavLink
            to="/backlog"
            className={({ isActive }) =>
              `site-nav-link ${isActive ? 'active' : ''}`.trim()
            }
            data-testid="nav-backlog"
          >
            Full backlog
          </NavLink>
          <a
            href="https://github.com/varuunnn216/sdlc-agent-orchestrator"
            target="_blank"
            rel="noreferrer"
            className="site-nav-link site-nav-github"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
