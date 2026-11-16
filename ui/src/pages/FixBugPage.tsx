import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CallChip } from '../components/reactbits/CallChip';
import { Counter } from '../components/reactbits/Counter';
import { FadeContent } from '../components/reactbits/FadeContent';
import { HoldButton } from '../components/reactbits/HoldButton';
import { LatticeLoader } from '../components/reactbits/LatticeLoader';
import { useRipple } from '../components/reactbits/Ripple';
import { SlideCommit } from '../components/reactbits/SlideCommit';
import { SpotlightCard } from '../components/reactbits/SpotlightCard';
import { SquishSwitch } from '../components/reactbits/SquishSwitch';
import { StarBorder } from '../components/reactbits/StarBorder';
import { StatusMark } from '../components/reactbits/StatusMark';
import { Stepper, type StepperStep } from '../components/reactbits/Stepper';
import { ThoughtLine } from '../components/reactbits/ThoughtLine';
import type { DemoStatus, PrResult, StepEvent, WorkItem } from '../types';
import './FixBugPage.css';

const STEPS: StepperStep[] = [
  { number: 1, label: 'Choose a bug' },
  { number: 2, label: 'Review ticket' },
  { number: 3, label: 'Run agent' },
  { number: 4, label: 'Approve' },
];

type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';

interface FixBugPageProps {
  demoStatus: DemoStatus | null;
  onStatusChange?: (status: string) => void;
  onRunStarted?: () => void;
}

function countDiffFiles(diffText: string): number {
  if (!diffText) return 0;
  const matches = diffText.match(/^(?:diff --git |\+\+\+ b\/)/gm);
  if (!matches) return 1;
  const gitHeaders = diffText.match(/^diff --git /gm);
  return gitHeaders ? gitHeaders.length : matches.length;
}

function BugCard({
  item,
  selected,
  onSelect,
  onKeyDown,
}: {
  item: WorkItem;
  selected: boolean;
  onSelect: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const { trigger, rippleLayer } = useRipple();
  const symptom = item.actual || item.description;

  return (
    <button
      type="button"
      className={`fix-bug-card rb-ripple-host ${selected ? 'selected' : ''}`.trim()}
      onPointerDown={trigger}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      data-testid={`fix-item-${item.id}`}
    >
      <div className="fix-bug-card-top">
        <span className={`tag tag-${item.type}`}>{item.id}</span>
        <span className={`tag tag-${item.difficulty}`}>{item.difficulty}</span>
      </div>
      <h3 className="fix-bug-card-title">{item.title}</h3>
      <p className="fix-bug-card-symptom">{symptom}</p>
      {rippleLayer}
    </button>
  );
}

export function FixBugPage({
  demoStatus,
  onStatusChange,
  onRunStarted,
}: FixBugPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlItemId = searchParams.get('item') ?? '';

  const [items, setItems] = useState<WorkItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [showStories, setShowStories] = useState(false);
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('all');

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<number>(1);

  const [dryRun, setDryRun] = useState<boolean>(true);
  const [runId, setRunId] = useState<string>('');
  const [runStatus, setRunStatus] = useState<string>('idle');
  const [plan, setPlan] = useState<string>('');
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [diff, setDiff] = useState<string>('');
  const [testsPassed, setTestsPassed] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [rejectReason, setRejectReason] = useState<string>('');
  const [submittedRejectReason, setSubmittedRejectReason] = useState<string>('');
  const [prResult, setPrResult] = useState<PrResult | null>(null);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const runStartMsRef = useRef<number | null>(null);
  const traceEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onStatusChange?.(runStatus);
  }, [runStatus, onStatusChange]);

  useEffect(() => {
    fetch('/api/work-items')
      .then((res) => res.json())
      .then((data: WorkItem[]) => {
        setItems(data);
        setLoadingItems(false);
      })
      .catch((err) => {
        setErrorMsg(`Failed to load work items: ${String(err)}`);
        setLoadingItems(false);
      });

    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === urlItemId) ?? null,
    [items, urlItemId]
  );

  // Restore step 2 if URL has ?item=BUG-X on load/refresh
  useEffect(() => {
    if (loadingItems || !urlItemId) return;
    if (selectedItem) {
      if (selectedItem.type === 'story') {
        setShowStories(true);
      }
      setCurrentStep((prev) => (prev === 1 ? 2 : prev));
      setMaxReachedStep((prev) => Math.max(prev, 2));
    }
  }, [loadingItems, urlItemId, selectedItem]);

  useEffect(() => {
    if (runStatus !== 'running') return;
    const timer = window.setInterval(() => {
      if (runStartMsRef.current !== null) {
        setElapsedSec(
          Math.max(0, Math.floor((Date.now() - runStartMsRef.current) / 1000))
        );
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [runStatus]);

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [steps.length, plan]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!showStories && item.type !== 'bug') return false;
      if (difficulty !== 'all' && item.difficulty !== difficulty) return false;
      return true;
    });
  }, [items, showStories, difficulty]);

  const isDemoCapReached =
    demoStatus !== null &&
    (demoStatus.ip_remaining <= 0 || demoStatus.global_remaining <= 0);

  const selectItem = (item: WorkItem) => {
    setSearchParams({ item: item.id });
    setErrorMsg('');
    setRunStatus('idle');
    setPlan('');
    setSteps([]);
    setDiff('');
    setTestsPassed(null);
    setPrResult(null);
    setSubmittedRejectReason('');
    setCurrentStep(2);
    setMaxReachedStep(2);
  };

  const handleCardKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    idx: number
  ) => {
    const cols = window.innerWidth <= 640 ? 1 : 2;
    let nextIdx = -1;
    if (e.key === 'ArrowRight') nextIdx = idx + 1;
    else if (e.key === 'ArrowLeft') nextIdx = idx - 1;
    else if (e.key === 'ArrowDown') nextIdx = idx + cols;
    else if (e.key === 'ArrowUp') nextIdx = idx - cols;
    if (nextIdx < 0 || nextIdx >= filteredItems.length) return;
    e.preventDefault();
    const nextItem = filteredItems[nextIdx];
    const el = document.querySelector<HTMLButtonElement>(
      `[data-testid="fix-item-${nextItem.id}"]`
    );
    el?.focus();
  };

  const handleStartRun = async () => {
    if (!selectedItem || isDemoCapReached) return;
    eventSourceRef.current?.close();

    setCurrentStep(3);
    setMaxReachedStep(3);
    setRunStatus('running');
    setPlan('');
    setSteps([]);
    setDiff('');
    setTestsPassed(null);
    setErrorMsg('');
    setPrResult(null);
    setSubmittedRejectReason('');
    setElapsedSec(0);
    runStartMsRef.current = Date.now();

    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: selectedItem.id, dry_run: dryRun }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail ?? 'Failed to start run');
      }
      onRunStarted?.();
      setRunId(data.run_id);

      const es = new EventSource(`/api/runs/${data.run_id}/stream`);
      eventSourceRef.current = es;

      es.onmessage = (msg) => {
        const ev = JSON.parse(msg.data);
        if (ev.type === 'plan') {
          setPlan(ev.plan ?? '');
        } else if (ev.type === 'step') {
          setSteps((prev) => [...prev, ev.step]);
        } else if (ev.type === 'done') {
          if (runStartMsRef.current !== null) {
            setElapsedSec(
              Math.max(1, Math.round((Date.now() - runStartMsRef.current) / 1000))
            );
          }
          setRunStatus(ev.status);
          setDiff(ev.diff ?? '');
          if (typeof ev.tests_passed === 'boolean') {
            setTestsPassed(ev.tests_passed);
          }
          if (ev.error) setErrorMsg(ev.error);
          if (ev.status === 'awaiting_approval') {
            setCurrentStep(4);
            setMaxReachedStep(4);
          }
          es.close();
        }
      };

      es.onerror = () => {
        es.close();
      };
    } catch (err) {
      setRunStatus('failed');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCancelRun = async () => {
    eventSourceRef.current?.close();
    if (runId) {
      try {
        await fetch(`/api/runs/${runId}/cancel`, { method: 'POST' });
      } catch {
        // Ignore network errors on cancel cleanup
      }
    }
    setRunStatus('idle');
    setCurrentStep(2);
  };

  const handleApprove = async () => {
    if (!runId) return;
    const res = await fetch(`/api/runs/${runId}/approve`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.detail ?? 'Approve failed');
      return;
    }
    setRunStatus(data.status);
    setPrResult(data.pr_result ?? null);
  };

  const handleReject = async () => {
    if (!runId) return;
    const reason = rejectReason.trim() || 'Rejected by reviewer';
    const res = await fetch(`/api/runs/${runId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.detail ?? 'Reject failed');
      return;
    }
    setRunStatus(data.status);
    setSubmittedRejectReason(data.reject_reason ?? reason);
    setRejectReason('');
  };

  const handleResetToPickBug = () => {
    eventSourceRef.current?.close();
    setSearchParams({});
    setRunId('');
    setRunStatus('idle');
    setPlan('');
    setSteps([]);
    setDiff('');
    setTestsPassed(null);
    setErrorMsg('');
    setPrResult(null);
    setSubmittedRejectReason('');
    setCurrentStep(1);
    setMaxReachedStep(1);
  };

  const runRipple = useRipple(runStatus === 'running');
  const backRipple = useRipple();
  const cancelRipple = useRipple();
  const resetRipple = useRipple();

  const filesChanged = countDiffFiles(diff);

  return (
    <div className="fix-shell">
      <div className="fix-top-bar">
        <div>
          <h1 className="fix-page-title">Guided Bug Fix</h1>
          <p className="fix-page-sub">
            Pick a ticket, inspect the reproduction steps, watch the agent work,
            and review the diff.
          </p>
        </div>
        <StatusMark status={runStatus} />
      </div>

      <Stepper
        steps={STEPS}
        currentStep={currentStep}
        maxReachedStep={maxReachedStep}
        locked={runStatus === 'running'}
        onStepClick={(step) => setCurrentStep(step)}
      />

      {/* Step 1: Choose a bug */}
      {currentStep === 1 && (
        <FadeContent>
          <SpotlightCard as="section" className="fix-panel">
            <div className="fix-step1-head">
              <div className="fix-step1-title">
                <h2>Choose a bug</h2>
                <Counter value={filteredItems.length} />
              </div>

              <div className="fix-step1-controls">
                <SquishSwitch
                  label="Show stories too"
                  checked={showStories}
                  onChange={setShowStories}
                />

                <div
                  className="segmented-filter fix-diff-filter"
                  role="tablist"
                  aria-label="Filter by difficulty"
                >
                  <span
                    className="segmented-filter-indicator fix-diff-indicator"
                    aria-hidden="true"
                    style={{
                      transform: `translateX(${
                        (difficulty === 'all'
                          ? 0
                          : difficulty === 'easy'
                            ? 1
                            : difficulty === 'medium'
                              ? 2
                              : 3) * 100
                      }%)`,
                    }}
                  />
                  {(['all', 'easy', 'medium', 'hard'] as const).map((val) => {
                    const label =
                      val === 'all'
                        ? 'All'
                        : val.charAt(0).toUpperCase() + val.slice(1);
                    const active = difficulty === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`segmented-filter-btn ${active ? 'active' : ''}`.trim()}
                        onClick={() => setDifficulty(val)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {loadingItems ? (
              <div className="empty-state">Loading work items...</div>
            ) : (
              <div className="fix-bug-grid" role="list" aria-label="Bug picker">
                {filteredItems.map((item, idx) => (
                  <div key={item.id} role="listitem">
                    <BugCard
                      item={item}
                      selected={selectedItem?.id === item.id}
                      onSelect={() => selectItem(item)}
                      onKeyDown={(e) => handleCardKeyDown(e, idx)}
                    />
                  </div>
                ))}
              </div>
            )}
          </SpotlightCard>
        </FadeContent>
      )}

      {/* Step 2: Review ticket */}
      {currentStep === 2 && selectedItem && (
        <FadeContent>
          <SpotlightCard as="section" className="fix-panel">
            <div className="fix-review-header">
              <div className="item-meta">
                <span className={`tag tag-${selectedItem.type}`}>
                  {selectedItem.id}
                </span>
                <span className={`tag tag-${selectedItem.difficulty}`}>
                  {selectedItem.difficulty}
                </span>
              </div>
              <h2 data-testid="review-ticket-title">
                {selectedItem.id}: {selectedItem.title}
              </h2>
              <p className="fix-review-desc">{selectedItem.description}</p>
            </div>

            <div className="fix-review-details">
              {selectedItem.actual && (
                <div className="fix-detail-block">
                  <h3>Symptom</h3>
                  <p>{selectedItem.actual}</p>
                </div>
              )}

              {selectedItem.steps_to_reproduce &&
                selectedItem.steps_to_reproduce.length > 0 && (
                  <div className="fix-detail-block">
                    <h3>Steps to reproduce</h3>
                    <ol>
                      {selectedItem.steps_to_reproduce.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  </div>
                )}

              {selectedItem.acceptance_criteria &&
                selectedItem.acceptance_criteria.length > 0 && (
                  <div className="fix-detail-block">
                    <h3>Acceptance criteria</h3>
                    <ol>
                      {selectedItem.acceptance_criteria.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  </div>
                )}

              {selectedItem.expected && (
                <div className="fix-detail-block">
                  <h3>Expected behavior</h3>
                  <p>{selectedItem.expected}</p>
                </div>
              )}
            </div>

            <div className="fix-dryrun-box">
              <SquishSwitch
                label="Dry-run PR"
                checked={dryRun}
                onChange={setDryRun}
              />
              <p className="fix-dryrun-note">
                Dry-run simulates branch creation and PR metadata locally without
                pushing or opening a real GitHub PR.
              </p>
            </div>

            {isDemoCapReached && (
              <div className="error-banner" data-testid="demo-cap-banner">
                Daily demo run limit reached ({demoStatus?.ip_limit} per IP /{' '}
                {demoStatus?.global_limit} global). Please try again tomorrow or
                run locally with your own API key.
              </div>
            )}

            {errorMsg && <div className="error-banner">{errorMsg}</div>}

            <div className="fix-actions-row">
              <button
                type="button"
                className="secondary-btn rb-ripple-host"
                onPointerDown={backRipple.trigger}
                onClick={() => setCurrentStep(1)}
              >
                Back
                {backRipple.rippleLayer}
              </button>

              <StarBorder active={false}>
                <button
                  type="button"
                  className="primary-btn rb-ripple-host"
                  onPointerDown={runRipple.trigger}
                  onClick={handleStartRun}
                  disabled={isDemoCapReached}
                  data-testid="fix-run-agent-btn"
                >
                  Run agent
                  {runRipple.rippleLayer}
                </button>
              </StarBorder>
            </div>
          </SpotlightCard>
        </FadeContent>
      )}

      {/* Step 3: Run agent */}
      {currentStep === 3 && (
        <FadeContent>
          <SpotlightCard as="section" className="fix-panel">
            <div className="panel-header fix-trace-header">
              <div className="fix-trace-title-group">
                <h2>Live Step Trace (SSE)</h2>
                {runStatus === 'running' && <LatticeLoader />}
              </div>
              <div className="fix-live-metrics">
                <span className="fix-metric-pill" data-testid="live-tool-count">
                  Tool calls: {steps.length}
                </span>
                <span className="fix-metric-pill" data-testid="live-elapsed-time">
                  Elapsed: {elapsedSec}s
                </span>
                <button
                  type="button"
                  className="secondary-btn fix-cancel-btn rb-ripple-host"
                  onPointerDown={cancelRipple.trigger}
                  onClick={handleCancelRun}
                  data-testid="fix-cancel-btn"
                >
                  Cancel
                  {cancelRipple.rippleLayer}
                </button>
              </div>
            </div>

            {plan && <ThoughtLine label="Plan" content={plan} />}

            {errorMsg && <div className="error-banner">{errorMsg}</div>}

            <div className="trace-scroll">
              {steps.length === 0 ? (
                <div className="empty-state">
                  <span>Starting agent in isolated workspace...</span>
                </div>
              ) : (
                <ol className="trace-list">
                  {steps.map((s) => (
                    <CallChip
                      key={s.step_index}
                      phase={s.phase}
                      tool={s.tool}
                      args={s.args}
                      result={s.result}
                      durationMs={s.duration_ms}
                      tokens={s.tokens_in + s.tokens_out}
                    />
                  ))}
                </ol>
              )}
              <div ref={traceEndRef} />
            </div>

            {runStatus === 'failed' && (
              <div className="fix-actions-row">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setCurrentStep(2)}
                >
                  Back to ticket
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleStartRun}
                  disabled={isDemoCapReached}
                >
                  Try again
                </button>
              </div>
            )}
          </SpotlightCard>
        </FadeContent>
      )}

      {/* Step 4: Approve */}
      {currentStep === 4 && (
        <FadeContent>
          <div className="fix-step4-stack">
            <SpotlightCard as="section" className="fix-summary-card">
              <div className="fix-summary-item">
                <span className="fix-summary-label">Tests</span>
                <strong
                  className={`fix-summary-value ${
                    testsPassed === true
                      ? 'is-pass'
                      : testsPassed === false
                        ? 'is-fail'
                        : ''
                  }`.trim()}
                >
                  {testsPassed === true
                    ? 'Passed'
                    : testsPassed === false
                      ? 'Failed'
                      : 'Completed'}
                </strong>
              </div>
              <div className="fix-summary-item">
                <span className="fix-summary-label">Files changed</span>
                <strong className="fix-summary-value">{filesChanged}</strong>
              </div>
              <div className="fix-summary-item">
                <span className="fix-summary-label">Tool calls</span>
                <strong className="fix-summary-value">{steps.length}</strong>
              </div>
              <div className="fix-summary-item">
                <span className="fix-summary-label">Time</span>
                <strong className="fix-summary-value">{elapsedSec}s</strong>
              </div>
            </SpotlightCard>

            <SpotlightCard as="section" className="diff-panel">
              <div className="panel-header diff-header">
                <h2>Diff Viewer &amp; Approval Gate</h2>
                {runStatus === 'awaiting_approval' && (
                  <div className="approval-actions">
                    <input
                      type="text"
                      aria-label="Rejection reason"
                      placeholder="Reason (required)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      disabled={!diff || runStatus !== 'awaiting_approval'}
                    />
                    <HoldButton
                      label="Hold to Reject"
                      disabled={
                        !diff ||
                        runStatus !== 'awaiting_approval' ||
                        !rejectReason.trim()
                      }
                      onConfirm={handleReject}
                    />
                    <SlideCommit
                      label="Slide to Approve"
                      disabled={!diff || runStatus !== 'awaiting_approval'}
                      onCommit={handleApprove}
                    />
                  </div>
                )}
              </div>

              {errorMsg && <div className="error-banner">{errorMsg}</div>}

              {runStatus === 'approved' && (
                <div className="pr-banner" data-testid="fix-approved-banner">
                  <div>
                    <strong>Approved!</strong>{' '}
                    {prResult?.pr_url ? (
                      <>
                        PR opened:{' '}
                        <a
                          href={prResult.pr_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {prResult.pr_url}
                        </a>
                      </>
                    ) : (
                      <span>
                        Dry-run, no PR created (branch{' '}
                        <code>{prResult?.branch ?? 'dry-run'}</code>).
                      </span>
                    )}
                  </div>
                  <div className="fix-post-actions">
                    <button
                      type="button"
                      className="primary-btn rb-ripple-host"
                      onPointerDown={resetRipple.trigger}
                      onClick={handleResetToPickBug}
                    >
                      Fix another bug
                      {resetRipple.rippleLayer}
                    </button>
                    <Link to="/" className="secondary-btn landing-btn">
                      Back to home
                    </Link>
                  </div>
                </div>
              )}

              {runStatus === 'rejected' && (
                <div className="fix-rejected-banner" data-testid="fix-rejected-banner">
                  <div>
                    <strong>Rejected:</strong> {submittedRejectReason}
                  </div>
                  <div className="fix-post-actions">
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => setCurrentStep(2)}
                    >
                      Try again
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={handleResetToPickBug}
                    >
                      Choose another bug
                    </button>
                  </div>
                </div>
              )}

              {diff ? (
                <pre className="diff-code">
                  {diff.split('\n').map((line, idx) => {
                    const cls = line.startsWith('+')
                      ? 'diff-add'
                      : line.startsWith('-')
                        ? 'diff-del'
                        : line.startsWith('@@')
                          ? 'diff-hunk'
                          : '';
                    return (
                      <div key={idx} className={`diff-row ${cls}`.trim()}>
                        <span className="diff-lineno" aria-hidden="true">
                          {idx + 1}
                        </span>
                        <span className="diff-text">{line}</span>
                      </div>
                    );
                  })}
                </pre>
              ) : (
                <div className="empty-state">No diff generated yet.</div>
              )}
            </SpotlightCard>
          </div>
        </FadeContent>
      )}
    </div>
  );
}

export default FixBugPage;
