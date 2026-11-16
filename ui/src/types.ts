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
