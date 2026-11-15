import { useEffect, useRef, useState } from 'react';
import { FadeContent } from './components/reactbits/FadeContent';
import { GradientText } from './components/reactbits/GradientText';
import { SpotlightCard } from './components/reactbits/SpotlightCard';
import { TextType } from './components/reactbits/TextType';

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
        <div className="status-pill" data-status={runStatus}>
          Status: <strong>{runStatus}</strong>
        </div>
      </header>

      <div className="grid">
        <FadeContent>
          <SpotlightCard as="aside" className="backlog-panel">
            <div className="panel-header">
              <h2>Backlog ({visibleItems.length})</h2>
              <div className="filter-tabs">
                {(['all', 'bug', 'story'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={filter === tab ? 'tab active' : 'tab'}
                    onClick={() => setFilter(tab)}
                  >
                    {tab === 'all' ? 'All' : tab === 'bug' ? 'Bugs' : 'Stories'}
                  </button>
                ))}
              </div>
            </div>

            <ul className="item-list">
              {visibleItems.map((item) => (
                <li
                  key={item.id}
                  className={
                    item.id === selectedId ? 'item-card selected' : 'item-card'
                  }
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className="item-meta">
                    <span className={`tag tag-${item.type}`}>{item.id}</span>
                    <span className="tag tag-diff">{item.difficulty}</span>
                  </div>
                  <div className="item-title">{item.title}</div>
                </li>
              ))}
            </ul>
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
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={dryRun}
                        onChange={(e) => setDryRun(e.target.checked)}
                      />
                      Dry-run PR
                    </label>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={handleRun}
                      disabled={runStatus === 'running'}
                    >
                      {runStatus === 'running' ? 'Running...' : 'Run Agent'}
                    </button>
                  </div>
                </div>
                {errorMsg && <div className="error-banner">{errorMsg}</div>}
              </SpotlightCard>
            </FadeContent>
          )}

          <FadeContent delayMs={80}>
            <SpotlightCard as="section" className="trace-panel">
              <h2>Live Step Trace (SSE)</h2>
              {plan && (
                <div className="plan-box">
                  <strong>Plan</strong>
                  <pre>{plan}</pre>
                </div>
              )}
              {steps.length === 0 ? (
                <p className="muted">Select a work item and click Run Agent.</p>
              ) : (
                <ol className="step-list">
                  {steps.map((s) => (
                    <li key={s.step_index} className="step-item">
                      <div className="step-head">
                        <span className="step-badge">{s.phase}</span>
                        <code>{s.tool}</code>
                        <span className="muted">
                          {s.duration_ms}ms · {s.tokens_in + s.tokens_out} tok
                        </span>
                      </div>
                      <pre className="step-args">
                        {JSON.stringify(s.args, null, 2)}
                      </pre>
                    </li>
                  ))}
                </ol>
              )}
            </SpotlightCard>
          </FadeContent>

          <FadeContent delayMs={120}>
            <SpotlightCard as="section" className="diff-panel">
              <div className="panel-header">
                <h2>Diff Viewer &amp; Approval Gate</h2>
                {runStatus === 'awaiting_approval' && (
                  <div className="approval-actions">
                    <input
                      type="text"
                      placeholder="Rejection reason (optional)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <button
                      type="button"
                      className="reject-btn"
                      onClick={handleReject}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="approve-btn"
                      onClick={handleApprove}
                    >
                      Approve &amp; Open PR
                    </button>
                  </div>
                )}
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
                      <div key={idx} className={cls}>
                        {line}
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
