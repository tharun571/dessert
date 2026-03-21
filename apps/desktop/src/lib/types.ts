export interface DayPlanningStatus {
  local_date: string;
  has_tasks: boolean;
  task_count: number;
  has_sessions: boolean;
  session_count: number;
  needs_planning: boolean;
  suggest_tomorrow: boolean;
}

export interface Session {
  id: string;
  started_at: string;
  ended_at: string | null;
  state: 'active' | 'paused' | 'ended';
  planned_minutes: number | null;
  title: string | null;
  score_total: number;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  planned_for: string;
  estimated_minutes: number | null;
  is_main_quest: boolean;
  status: 'planned' | 'done' | 'skipped';
  completed_at: string | null;
  completion_source: string;
  llm_verdict_json: string | null;
  notes: string | null;
  created_at: string;
}

export interface Reward {
  id: string;
  name: string;
  cost: number;
  duration_minutes: number | null;
  ends_session_on_consume: boolean;
  suppresses_scope: string | null;
  cooldown_minutes: number | null;
  enabled: boolean;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  reward_id: string;
  reward_name: string;
  reward_cost: number;
  purchased_at: string;
  consumed_at: string | null;
  status: 'available' | 'consumed' | 'expired';
  purchase_session_id: string | null;
  consume_session_id: string | null;
}

export interface ScoreEvent {
  id: string;
  ts: string;
  session_id: string | null;
  delta: number;
  reason_code: string;
  explanation: string;
  related_event_id: string | null;
}

export interface DayScore {
  total: number;
  earned: number;
  lost: number;
  spent: number;
}

export interface AppRule {
  id: string;
  matcher_type: string;
  matcher_value: string;
  label: string;
  category: 'positive' | 'neutral' | 'negative';
  points_per_minute: number;
  enabled: boolean;
  created_at: string;
}

export interface SiteRule {
  id: string;
  domain: string;
  label: string;
  category: 'positive' | 'neutral' | 'negative';
  grace_seconds: number;
  penalty_per_minute_session: number;
  penalty_per_minute_ambient: number;
  reward_break_supported: boolean;
  enabled: boolean;
  created_at: string;
}

export interface AllRules {
  app_rules: AppRule[];
  site_rules: SiteRule[];
}

export interface CreateTaskInput {
  title: string;
  planned_for: string;
  estimated_minutes?: number;
  is_main_quest?: boolean;
  notes?: string;
}

export interface CreateRewardInput {
  name: string;
  cost: number;
  duration_minutes?: number;
  ends_session_on_consume?: boolean;
  suppresses_scope?: string;
  cooldown_minutes?: number;
}

export interface TrackerStatus {
  bundle_id: string | null;
  app_name: string | null;
  idle_seconds: number;
  is_idle: boolean;
  consecutive_productive_secs: number;
  last_tick: string | null;
}
