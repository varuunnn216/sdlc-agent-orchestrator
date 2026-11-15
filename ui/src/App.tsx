import { useEffect, useRef, useState } from 'react';
import { AnimatedList } from './components/reactbits/AnimatedList';
import { CallChip } from './components/reactbits/CallChip';
import { Counter } from './components/reactbits/Counter';
import { FadeContent } from './components/reactbits/FadeContent';
import { GradientText } from './components/reactbits/GradientText';
import { HoldButton } from './components/reactbits/HoldButton';
import { LatticeLoader } from './components/reactbits/LatticeLoader';
import { RubberSegment } from './components/reactbits/RubberSegment';
import { SlideCommit } from './components/reactbits/SlideCommit';
import { SpotlightCard } from './components/reactbits/SpotlightCard';
import { SquishSwitch } from './components/reactbits/SquishSwitch';
import { StarBorder } from './components/reactbits/StarBorder';
import { StatusMark } from './components/reactbits/StatusMark';
import { TextType } from './components/reactbits/TextType';
import { ThoughtLine } from './components/reactbits/ThoughtLine';

interface WorkItem {
  id: string;
  type: 'bug' | 'story';
  difficulty: string;
  status: string;
  title: string;
  description: string;
}

interface StepEvent {
  step_index: number;
  phase: string;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  tokens_in: number;
  tokens_out: number;
  duration_ms: number;
}

interface PrResult {
  dry_run: boolean;
  status: string;
  branch: string;
  pr_url?: string;
}

export function App() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'bug' | 'story'>('all');
  const [selectedId, setSelectedId] = useState<string>('');
  const [dryRun, setDryRun] = useState<boolean>(true);

  const [runId, setRunId] = useState<string>('');
  const [runStatus, setRunStatus] = useState<string>('idle');
  const [plan, setPlan] = useState<string>('');
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [diff, setDiff] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [rejectReason, setRejectReason] = useState<string>('');
  const [prResult, setPrResult] = useState<PrResult | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const traceEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [steps.length, plan]);

  useEffect(() => {
    fetch('/api/work-items')
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

  const handleRun = async () => {
    if (!selectedId) return;
    eventSourceRef.current?.close();

    setRunStatus('running');
    setPlan('');
    setSteps([]);
    setDiff('');
    setErrorMsg('');
    setPrResult(null);

    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: selectedId, dry_run: dryRun }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.detail ?? 'Failed to start run');
      }
      const data = await res.json();
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
          setRunStatus(ev.status);
          setDiff(ev.diff ?? '');
          if (ev.error) setErrorMsg(ev.error);
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
    const res = await fetch(`/api/runs/${runId}/reject`, {
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

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <h1>
            <GradientText>SDLC Agent Orchestrator</GradientText>
          </h1>
          <p className="subtitle">
            <TextType text="Plan → Implement via MCP → Verify with Vitest → Human Approval Gate" />
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
                <Counter value={visibleItems.length} />
              </div>
              <RubberSegment
                ariaLabel="Filter work items"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'bug', label: 'Bugs' },
                  { value: 'story', label: 'Stories' },
                ]}
              />
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
                    <StarBorder disabled={runStatus === 'running'}>
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={handleRun}
                        disabled={runStatus === 'running'}
                      >
                        {runStatus === 'running' ? 'Running...' : 'Run Agent'}
                      </button>
                    </StarBorder>
                  </div>
                </div>
                {errorMsg && <div className="error-banner">{errorMsg}</div>}
              </SpotlightCard>
            </FadeContent>
          )}

          <FadeContent delayMs={80}>
            <SpotlightCard as="section" className="trace-panel">
              <div className="panel-header">
                <h2>Live Step Trace (SSE)</h2>
                {runStatus === 'running' && <LatticeLoader />}
              </div>
              {plan && <ThoughtLine label="Plan" content={plan} />}
              <div className="trace-scroll">
                {steps.length === 0 ? (
                  <p className="muted">
                    Select a work item and click Run Agent.
                  </p>
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
                    placeholder="Rejection reason (required)"
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
                <p className="muted">No diff generated yet.</p>
              )}
            </SpotlightCard>
          </FadeContent>
        </main>
      </div>
    </div>
  );
}

export default App;
