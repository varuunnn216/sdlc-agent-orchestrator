export interface WorkItem {
  id: string;
  type: 'bug' | 'story';
  difficulty: string;
  status: string;
  title: string;
  description: string;
  steps_to_reproduce?: string[];
  expected?: string;
  actual?: string;
  acceptance_criteria?: string[];
}

export interface StepEvent {
  step_index: number;
  phase: string;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  tokens_in: number;
  tokens_out: number;
  duration_ms: number;
  provider?: string;
  model?: string;
}

export interface PrResult {
  dry_run: boolean;
  status: string;
  branch: string;
  pr_url?: string;
}

export interface DemoStatus {
  demo_mode: boolean;
  ip_remaining: number;
  ip_limit: number;
  global_remaining: number;
  global_limit: number;
  real_pr_enabled: boolean;
}

export interface LlmProviderStatus {
  configured: boolean;
  model: string;
  cooling_down_until: string | null;
  exhausted_today: boolean;
  requests_today: number;
}

export interface LlmStatus {
  capacity: 'ok' | 'limited';
  providers: Record<string, LlmProviderStatus>;
}

export interface ErrorDetail {
  kind: string;
  provider?: string;
  attempts?: number;
  retry_after_s?: number | null;
}
