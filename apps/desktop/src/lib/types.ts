export interface DayPlanningStatus {
  local_date: string;
  has_tasks: boolean;
  task_count: number;
  has_sessions: boolean;
  session_count: number;
  needs_planning: boolean;
  suggest_tomorrow: boolean;
  ask_sunlight: boolean;
  sunlight_done: boolean;
  sunlight_at: string | null;
  ask_gym: boolean;
  gym_done: boolean;
  gym_at: string | null;
  book_done: boolean;
  book_at: string | null;
  walk_done: boolean;
  walk_at: string | null;
  no_outside_food_done: boolean;
  no_outside_food_at: string | null;
  cold_shower_done: boolean;
  cold_shower_at: string | null;
  meditation_done: boolean;
  meditation_at: string | null;
  singing_practice_done: boolean;
  singing_practice_at: string | null;
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
  paused_ms: number;
  paused_at: string | null;
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

export interface SessionEndStats {
  duration_ms: number;
  is_longest_today: boolean;
  is_longest_week: boolean;
  is_longest_ever: boolean;
}

export interface DayScore {
  total: number;
  earned: number;
  lost: number;
  spent: number;
  sessions_today: number;
  time_spent_ms: number;
}

export interface AnalyticsDayPoint {
  date: string;
  work_ms: number;
  sessions_started: number;
  points_earned: number;
  points_spent: number;
  quests_completed: number;
}

export interface AnalyticsTodaySummary {
  work_ms: number;
  idle_ms: number;
  sessions_started: number;
  points_earned: number;
  quests_completed: number;
}

export interface ActivitySegment {
  kind: string;
  start_minute: number;
  end_minute: number;
}

export interface ActivityDot {
  kind: string;
  minute: number;
  ts: string;
  label: string;
}

export interface TodayActivity {
  segments: ActivitySegment[];
  dots: ActivityDot[];
}

export interface AnalyticsDashboard {
  daywise: AnalyticsDayPoint[];
  today_summary: AnalyticsTodaySummary;
  today_activity: TodayActivity;
}

export interface OverallScore {
  total: number;
  days: number;
  earned: number;
  lost: number;
  spent: number;
  sessions_completed: number;
  tasks_completed: number;
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
  last_tick: string | null;
}
