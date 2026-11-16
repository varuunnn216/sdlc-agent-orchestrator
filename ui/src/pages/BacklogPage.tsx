import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../api';
import { ErrorCard } from '../components/ErrorCard';
import { AnimatedList } from '../components/reactbits/AnimatedList';
import { CallChip } from '../components/reactbits/CallChip';
import { Counter } from '../components/reactbits/Counter';
import { CountUp } from '../components/reactbits/CountUp';
import { FadeContent } from '../components/reactbits/FadeContent';
import { HoldButton } from '../components/reactbits/HoldButton';
import { LatticeLoader } from '../components/reactbits/LatticeLoader';
import { useRipple } from '../components/reactbits/Ripple';
import { ShinyText } from '../components/reactbits/ShinyText';
import { SlideCommit } from '../components/reactbits/SlideCommit';
import { SplitText } from '../components/reactbits/SplitText';
import { SpotlightCard } from '../components/reactbits/SpotlightCard';
import { SquishSwitch } from '../components/reactbits/SquishSwitch';
import { StarBorder } from '../components/reactbits/StarBorder';
import { StatusMark } from '../components/reactbits/StatusMark';
import { ThoughtLine } from '../components/reactbits/ThoughtLine';
import type { ErrorDetail, PrResult, StepEvent, WorkItem } from '../types';

const PIPELINE_STEPS = [
  'Plan',
  'Implement via MCP',
  'Verify with Vitest',
  'Human Approval',
];

interface BacklogPageProps {
  onStatusChange?: (status: string) => void;
  onRunStarted?: () => void;
}

export function BacklogPage({
  onStatusChange,
  onRunStarted,
}: BacklogPageProps) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'bug' | 'story'>('all');
  const [hasFiltered, setHasFiltered] = useState<boolean>(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [dryRun, setDryRun] = useState<boolean>(true);

  const [runId, setRunId] = useState<string>('');
  const [runStatus, setRunStatus] = useState<string>('idle');
  const [plan, setPlan] = useState<string>('');
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [diff, setDiff] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [errorDetail, setErrorDetail] = useState<ErrorDetail | null>(null);
  const [providerNote, setProviderNote] = useState<string>('');
  const [rejectReason, setRejectReason] = useState<string>('');
  const [prResult, setPrResult] = useState<PrResult | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const traceEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onStatusChange?.(runStatus);
  }, [runStatus, onStatusChange]);

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [steps.length, plan]);

  useEffect(() => {
    fetch(apiUrl('/api/work-items'))
      .then((res) => res.json())
      .then((data: WorkItem[]) => {
        setItems(data);
        if (data.length > 0) {
          setSelectedId(data[0].id);
        }
      })
      .catch((err) => setErrorMsg(`Failed to load work items: ${String(err)}`));

    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const visibleItems = items.filter(
    (item) => filter === 'all' || item.type === filter
  );
  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  const activePipelineStep = (() => {
    if (runStatus === 'done' || runStatus === 'approved') return 4;
    if (runStatus === 'awaiting_approval') return 3;
    if (runStatus !== 'running') return null;
    const last = steps[steps.length - 1];
    if (!last) return 0;
    const phase = last.phase.toLowerCase();
    const tool = last.tool.toLowerCase();
    if (
      phase.includes('verify') ||
      tool.includes('test') ||
      tool.includes('vitest')
    ) {
      return 2;
    }
    if (phase.includes('plan')) return 0;
    return 1;
  })();

  const handleRun = async () => {
    if (!selectedId) return;
    eventSourceRef.current?.close();

    setRunStatus('running');
    setPlan('');
    setSteps([]);
    setDiff('');
    setErrorMsg('');
    setErrorDetail(null);
    setProviderNote('');
    setPrResult(null);

    try {
      const res = await fetch(apiUrl('/api/runs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: selectedId, dry_run: dryRun }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.detail ?? 'Failed to start run');
      }
      onRunStarted?.();
      const data = await res.json();
      setRunId(data.run_id);

      const es = new EventSource(apiUrl(`/api/runs/${data.run_id}/stream`));
      eventSourceRef.current = es;

      es.onmessage = (msg) => {
        const ev = JSON.parse(msg.data);
        if (ev.type === 'plan') {
          setPlan(ev.plan ?? '');
        } else if (ev.type === 'provider_switch') {
          setProviderNote(`Switched AI provider: ${ev.from} -> ${ev.to} (${ev.reason})`);
        } else if (ev.type === 'step') {
          setSteps((prev) => [...prev, ev.step]);
        } else if (ev.type === 'done') {
          setRunStatus(ev.status);
          setDiff(ev.diff ?? '');
          if (ev.error) setErrorMsg(ev.error);
          if (ev.error_detail) setErrorDetail(ev.error_detail);
          onRunStarted?.();
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

  const handleApprove = async () => {
    if (!runId) return;
    const res = await fetch(apiUrl(`/api/runs/${runId}/approve`), { method: 'POST' });
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
    const res = await fetch(apiUrl(`/api/runs/${runId}/reject`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: rejectReason.trim() || 'Rejected by reviewer',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.detail ?? 'Reject failed');
      return;
    }
    setRunStatus(data.status);
    setRejectReason('');
  };

  const runBtnRipple = useRipple(runStatus === 'running');
  const filterAllRipple = useRipple();
  const filterBugRipple = useRipple();
  const filterStoryRipple = useRipple();

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <h1>
            <SplitText text="SDLC Agent Orchestrator" />
          </h1>
          <p className="subtitle subtitle-pipeline">
            {PIPELINE_STEPS.map((label, idx) => {
              const isCurrent =
                activePipelineStep !== null && idx === activePipelineStep;
              const isFinished =
                activePipelineStep !== null && idx < activePipelineStep;
              return (
                <span key={label} className="subtitle-segment">
                  {isCurrent ? (
                    <ShinyText text={label} />
                  ) : (
                    <span
                      className={`subtitle-step ${isFinished ? 'is-done' : ''}`.trim()}
                    >
                      {label}
                    </span>
                  )}
                  {idx < PIPELINE_STEPS.length - 1 && (
                    <span className="subtitle-sep" aria-hidden="true">
                      {' → '}
                    </span>
                  )}
                </span>
              );
            })}
          </p>
        </div>
        <StatusMark status={runStatus} />
      </header>

      <div className="grid">
        <FadeContent>
          <SpotlightCard as="aside" className="backlog-panel">
            <div className="panel-header">
              <div className="backlog-title-row">
                <h2>Backlog</h2>
                {hasFiltered ? (
                  <Counter value={visibleItems.length} />
                ) : (
                  <CountUp to={visibleItems.length} />
                )}
              </div>
              <div
                className="segmented-filter"
                role="tablist"
                aria-label="Filter work items"
              >
                <span
                  className="segmented-filter-indicator"
                  aria-hidden="true"
                  style={{
                    transform: `translateX(${
                      (filter === 'all' ? 0 : filter === 'bug' ? 1 : 2) * 100
                    }%)`,
                  }}
                />
                {(['all', 'bug', 'story'] as const).map((val) => {
                  const label =
                    val === 'all' ? 'All' : val === 'bug' ? 'Bugs' : 'Stories';
                  const active = filter === val;
                  const rip =
                    val === 'all'
                      ? filterAllRipple
                      : val === 'bug'
                        ? filterBugRipple
                        : filterStoryRipple;
                  return (
                    <button
                      key={val}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`segmented-filter-btn rb-ripple-host ${active ? 'active' : ''}`.trim()}
                      onPointerDown={rip.trigger}
                      onClick={() => {
                        setHasFiltered(true);
                        setFilter(val);
                      }}
                    >
                      {label}
                      {rip.rippleLayer}
                    </button>
                  );
                })}
              </div>
            </div>

            <AnimatedList
              items={visibleItems}
              selectedId={selectedId}
              onSelect={setSelectedId}
              ariaLabel="Work items"
              renderItem={(item) => (
                <>
                  <div className="item-meta">
                    <span className={`tag tag-${item.type}`}>{item.id}</span>
                    <span className={`tag tag-${item.difficulty}`}>
                      {item.difficulty}
                    </span>
                  </div>
                  <div className="item-title">{item.title}</div>
                </>
              )}
            />
          </SpotlightCard>
        </FadeContent>

        <main className="workspace">
          {selectedItem && (
            <FadeContent delayMs={40}>
              <SpotlightCard as="section" className="ticket-panel">
                <div className="ticket-header">
                  <div>
                    <h2>
                      {selectedItem.id}: {selectedItem.title}
                    </h2>
                    <p>{selectedItem.description}</p>
                  </div>
                  <div className="run-controls">
                    <SquishSwitch
                      label="Dry-run PR"
                      checked={dryRun}
                      onChange={setDryRun}
                    />
                    <StarBorder active={runStatus === 'running'}>
                      <button
                        type="button"
                        className="primary-btn"
                        onPointerDown={runBtnRipple.trigger}
                        onClick={handleRun}
                        disabled={runStatus === 'running'}
                      >
                        {runStatus === 'running' ? 'Running...' : 'Run Agent'}
                        {runBtnRipple.rippleLayer}
                      </button>
                    </StarBorder>
                  </div>
                </div>
                <ErrorCard message={errorMsg} detail={errorDetail} />
              </SpotlightCard>
            </FadeContent>
          )}

          <FadeContent delayMs={80}>
            <SpotlightCard as="section" className="trace-panel">
              <div className="panel-header">
                <h2>Live Step Trace (SSE)</h2>
                {runStatus === 'running' && <LatticeLoader />}
              </div>
              {providerNote && (
                <div className="fix-metric-pill" data-testid="provider-switch-note">
                  {providerNote}
                </div>
              )}
              {plan && <ThoughtLine label="Plan" content={plan} />}
              <div className="trace-scroll">
                {steps.length === 0 ? (
                  <div className="empty-state">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="4 17 10 11 4 5" />
                      <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                    <span>Select a work item and click Run Agent.</span>
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
            </SpotlightCard>
          </FadeContent>

          <FadeContent delayMs={120}>
            <SpotlightCard as="section" className="diff-panel">
              <div className="panel-header diff-header">
                <h2>Diff Viewer &amp; Approval Gate</h2>
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
              </div>

              {prResult && (
                <div className="pr-banner">
                  PR {prResult.status} on branch <code>{prResult.branch}</code>
                  {prResult.pr_url && (
                    <>
                      {' — '}
                      <a href={prResult.pr_url} target="_blank" rel="noreferrer">
                        {prResult.pr_url}
                      </a>
                    </>
                  )}
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
                <div className="empty-state">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                  <span>No diff generated yet.</span>
                </div>
              )}
            </SpotlightCard>
          </FadeContent>
        </main>
      </div>
    </div>
  );
}

export default BacklogPage;
