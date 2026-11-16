import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CountUp } from '../components/reactbits/CountUp';
import { FadeContent } from '../components/reactbits/FadeContent';
import { LogoLoop } from '../components/reactbits/LogoLoop';
import { MagicBento, type BentoItem } from '../components/reactbits/MagicBento';
import { useRipple } from '../components/reactbits/Ripple';
import { SplitText } from '../components/reactbits/SplitText';
import { SpotlightCard } from '../components/reactbits/SpotlightCard';
import './LandingPage.css';

interface PreviewStep {
  key: string;
  label: string;
  badge: string;
  renderDetail: () => ReactNode;
}

const PREVIEW_STEPS: PreviewStep[] = [
  {
    key: 'plan',
    label: 'Plan',
    badge: '01',
    renderDetail: () => (
      <>
        Inspected <code className="preview-inline-code">Cart.tsx</code> and{' '}
        <code className="preview-inline-code">cart.test.ts</code> to locate the
        subtotal calculation.
      </>
    ),
  },
  {
    key: 'edit',
    label: 'edit file',
    badge: '02',
    renderDetail: () => (
      <>
        <code className="preview-inline-code">write_file()</code> updated{' '}
        <code className="preview-inline-code">src/utils/cart.ts</code> to
        multiply <code className="preview-inline-code">item.price</code> by{' '}
        <code className="preview-inline-code">item.quantity</code>.
      </>
    ),
  },
  {
    key: 'test',
    label: 'run tests',
    badge: '03',
    renderDetail: () => (
      <>
        <code className="preview-inline-code">run_tests()</code> returned
        Vitest: 12 passed, 0 failed in 0.41 s.
      </>
    ),
  },
  {
    key: 'diff',
    label: 'diff',
    badge: '04',
    renderDetail: () => (
      <>
        Generated diff replacing{' '}
        <code className="preview-inline-code">sum + item.price</code> with{' '}
        <code className="preview-inline-code">
          sum + item.price * item.quantity
        </code>
        .
      </>
    ),
  },
  {
    key: 'approve',
    label: 'Approve',
    badge: '05',
    renderDetail: () => (
      <>Awaiting human approval before creating a dry-run PR.</>
    ),
  },
];

const HOW_IT_WORKS_ITEMS: BentoItem[] = [
  {
    id: 'step-1',
    step: 'Step 01',
    title: 'Read the ticket',
    description:
      'Pulls the bug report, reproduction steps, and expected behavior directly from the backlog.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
      </svg>
    ),
  },
  {
    id: 'step-2',
    step: 'Step 02',
    title: 'Plan and edit via MCP tools',
    description:
      'Inspects source files and writes targeted patches inside an isolated workspace via scoped MCP tools.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    id: 'step-3',
    step: 'Step 03',
    title: 'Verify with Vitest and retry',
    description:
      'Runs the Vitest suite after edits and iterates automatically if assertions fail, within token and tool budgets.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  {
    id: 'step-4',
    step: 'Step 04',
    title: 'Human approval, then PR',
    description:
      'Pauses with a full diff and test summary. Nothing commits or opens a PR until you explicitly approve.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="18" r="3" />
        <circle cx="6" cy="6" r="3" />
        <path d="M13 6h3a2 2 0 0 1 2 2v7" />
        <line x1="6" y1="9" x2="6" y2="21" />
      </svg>
    ),
  },
];

const TECH_STACK = [
  'React',
  'TypeScript',
  'FastAPI',
  'Python',
  'MCP',
  'Claude API',
  'Vitest',
  'Docker',
  'GitHub Actions',
];

export function LandingPage() {
  const [activePreviewIdx, setActivePreviewIdx] = useState(0);
  const primaryRipple = useRipple();
  const secondaryRipple = useRipple();
  const finalRipple = useRipple();

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setActivePreviewIdx(PREVIEW_STEPS.length - 1);
      return;
    }

    const timer = window.setInterval(() => {
      setActivePreviewIdx((prev) => (prev + 1) % PREVIEW_STEPS.length);
    }, 1800);
    return () => window.clearInterval(timer);
  }, []);

  const handleScrollToHowItWorks = () => {
    const el = document.getElementById('how-it-works');
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <div className="landing-shell">
      {/* a) Hero */}
      <section className="landing-hero">
        <FadeContent>
          <h1 className="landing-title">
            <SplitText text="SDLC Agent Orchestrator" />
          </h1>
          <p className="landing-pitch">
            An AI agent that reads a ticket, fixes the code, runs the tests, and
            waits for your approval.
          </p>
          <div className="landing-cta-row">
            <Link
              to="/fix"
              className="primary-btn landing-btn rb-ripple-host"
              onPointerDown={primaryRipple.trigger}
              data-testid="hero-fix-btn"
            >
              Fix a bug
              {primaryRipple.rippleLayer}
            </Link>
            <button
              type="button"
              className="secondary-btn landing-btn rb-ripple-host"
              onPointerDown={secondaryRipple.trigger}
              onClick={handleScrollToHowItWorks}
            >
              See how it works
              {secondaryRipple.rippleLayer}
            </button>
          </div>
        </FadeContent>
      </section>

      {/* b) Live preview strip */}
      <FadeContent onScroll delayMs={40}>
        <section className="landing-section" aria-label="Live preview">
          <SpotlightCard className="preview-strip">
            <div className="preview-strip-header">
              <span className="preview-strip-label">Simulated Agent Run</span>
            </div>
            <div className="preview-steps-row" role="list">
              {PREVIEW_STEPS.map((step, idx) => {
                const isActive = idx === activePreviewIdx;
                const isDone = idx < activePreviewIdx;
                return (
                  <div
                    key={step.key}
                    role="listitem"
                    className={`preview-step-pill ${
                      isActive ? 'active' : isDone ? 'done' : ''
                    }`.trim()}
                  >
                    <span className="preview-step-num">{step.badge}</span>
                    <span>{step.label}</span>
                  </div>
                );
              })}
            </div>
            <p className="preview-result" aria-live="off">
              {PREVIEW_STEPS[activePreviewIdx].renderDetail()}
            </p>
          </SpotlightCard>
        </section>
      </FadeContent>

      {/* c) How it works */}
      <FadeContent onScroll>
        <section id="how-it-works" className="landing-section">
          <div className="landing-section-head">
            <h2>How it works</h2>
            <p>Four deterministic stages from ticket to human-reviewed PR.</p>
          </div>
          <MagicBento items={HOW_IT_WORKS_ITEMS} />
        </section>
      </FadeContent>

      {/* d) Stats (build-time from evals/results/latest.md; hidden if missing) */}
      {__EVAL_STATS__ && (
        <FadeContent onScroll>
          <section className="landing-section" data-testid="eval-stats-section">
            <div className="landing-section-head">
              <h2>Measured evaluation results</h2>
              <p>Read directly from evals/results/latest.md at build time.</p>
            </div>
            <div className="stats-grid">
              <SpotlightCard className="stat-card">
                <span className="stat-label">Success rate</span>
                <strong className="stat-value">
                  <CountUp to={Math.round(__EVAL_STATS__.successRate)} />%
                </strong>
              </SpotlightCard>
              <SpotlightCard className="stat-card">
                <span className="stat-label">Avg tool calls</span>
                <strong className="stat-value">
                  <CountUp to={Math.round(__EVAL_STATS__.avgToolCalls)} />
                </strong>
              </SpotlightCard>
              <SpotlightCard className="stat-card">
                <span className="stat-label">Avg time</span>
                <strong className="stat-value">
                  <CountUp to={Math.round(__EVAL_STATS__.avgTimeSec)} />s
                </strong>
              </SpotlightCard>
              <SpotlightCard className="stat-card">
                <span className="stat-label">Eval cases</span>
                <strong className="stat-value">
                  <CountUp to={__EVAL_STATS__.totalCases} />
                </strong>
              </SpotlightCard>
            </div>
          </section>
        </FadeContent>
      )}

      {/* e) Tech stack */}
      <FadeContent onScroll>
        <section className="landing-section">
          <div className="landing-section-head">
            <h2>Tech stack</h2>
          </div>
          <LogoLoop items={TECH_STACK} />
        </section>
      </FadeContent>

      {/* f) Safety section */}
      <FadeContent onScroll>
        <section className="landing-section">
          <SpotlightCard className="safety-panel">
            <div className="landing-section-head">
              <h2>Human in the loop</h2>
              <p>Built-in guardrails keep every change inspectable and reversible.</p>
            </div>
            <div className="safety-grid">
              <div className="safety-point">
                <h3>Explicit approval gate</h3>
                <p>
                  The agent pauses after tests pass and waits for you to slide to
                  approve or hold to reject with a reason.
                </p>
              </div>
              <div className="safety-point">
                <h3>Dry-run PRs by default</h3>
                <p>
                  Demo runs simulate branch and PR output without pushing code or
                  opening external pull requests.
                </p>
              </div>
              <div className="safety-point">
                <h3>Scoped file access</h3>
                <p>
                  MCP file tools reject path traversal, symlinks outside the
                  sandbox, and protected directories like .git or node_modules.
                </p>
              </div>
            </div>
          </SpotlightCard>
        </section>
      </FadeContent>

      {/* g) Final CTA */}
      <FadeContent onScroll>
        <section className="landing-section landing-final-cta">
          <SpotlightCard className="final-cta-card">
            <h2>Pick a bug and watch it get fixed</h2>
            <p>
              Choose one of the 6 mock storefront bugs, inspect the ticket, and
              stream the agent live.
            </p>
            <Link
              to="/fix"
              className="primary-btn landing-btn rb-ripple-host"
              onPointerDown={finalRipple.trigger}
            >
              Fix a bug
              {finalRipple.rippleLayer}
            </Link>
          </SpotlightCard>
        </section>
      </FadeContent>
    </div>
  );
}

export default LandingPage;
