import { invoke } from '@tauri-apps/api/core';
import type {
  Session, Task, Reward, InventoryItem, ScoreEvent, DayScore, OverallScore, AllRules,
  CreateTaskInput, CreateRewardInput, DayPlanningStatus, SessionEndStats, AnalyticsDashboard,
} from './types';

// Sessions
export const sessionStart = (plannedMinutes?: number, title?: string, localDate?: string) =>
  invoke<Session>('session_start', { plannedMinutes, title, localDate: localDate ?? new Date().toISOString().slice(0, 10) });

export const dayPlanningStatus = (localDate: string, localTomorrowDate: string, hour: number) =>
  invoke<DayPlanningStatus>('day_planning_status', { localDate, localTomorrowDate, hour });

export const logSunlight = (localDate: string) =>
  invoke<void>('log_sunlight', { localDate });

export const logGym = (localDate: string) =>
  invoke<void>('log_gym', { localDate });

export const logBook = (localDate: string) =>
  invoke<void>('log_book', { localDate });

export const logWalk = (localDate: string) =>
  invoke<void>('log_walk', { localDate });

export const logNoOutsideFood = (localDate: string) =>
  invoke<void>('log_no_outside_food', { localDate });

export const unlogHabit = (reasonCode: string, localDate: string) =>
  invoke<void>('unlog_habit', { reasonCode, localDate });

export const sessionPause = (sessionId: string) =>
  invoke<Session>('session_pause', { sessionId });

export const sessionResume = (sessionId: string) =>
  invoke<Session>('session_resume', { sessionId });

export const sessionStop = (sessionId: string) =>
  invoke<Session>('session_stop', { sessionId });

export const sessionEndStats = (sessionId: string) =>
  invoke<SessionEndStats>('session_end_stats', { sessionId });

export const sessionGetCurrent = () =>
  invoke<Session | null>('session_get_current');

export const sessionListForDay = (date: string) =>
  invoke<Session[]>('session_list_for_day', { date });

// Tasks
export const taskCreate = (input: CreateTaskInput) =>
  invoke<Task>('task_create', { input });

export const taskUpdate = (input: { id: string; title?: string; estimated_minutes?: number; is_main_quest?: boolean; notes?: string; planned_for?: string }) =>
  invoke<Task>('task_update', { input });

export const taskMarkDone = (taskId: string) =>
  invoke<Task>('task_mark_done', { taskId });

export const taskReopen = (taskId: string) =>
  invoke<Task>('task_reopen', { taskId });

export const taskDelete = (taskId: string) =>
  invoke<void>('task_delete', { taskId });

export const taskListForDate = (date: string) =>
  invoke<Task[]>('task_list_for_date', { date });

// Rewards
export const rewardList = () =>
  invoke<Reward[]>('reward_list');

export const rewardListAll = () =>
  invoke<Reward[]>('reward_list_all');

export const rewardCreate = (input: CreateRewardInput) =>
  invoke<Reward>('reward_create', { input });

export const rewardUpdate = (input: { id: string; name?: string; cost?: number; enabled?: boolean; ends_session_on_consume?: boolean }) =>
  invoke<Reward>('reward_update', { input });

export const rewardDelete = (rewardId: string) =>
  invoke<void>('reward_delete', { rewardId });

export const rewardPurchase = (rewardId: string, purchaseSessionId?: string) =>
  invoke<InventoryItem>('reward_purchase', { rewardId, purchaseSessionId });

export const inventoryListAvailable = () =>
  invoke<InventoryItem[]>('inventory_list_available');

export const inventoryListConsumed = () =>
  invoke<InventoryItem[]>('inventory_list_consumed');

export const inventoryConsume = (itemId: string, consumeSessionId?: string) =>
  invoke<InventoryItem>('inventory_consume', { itemId, consumeSessionId });

// Scoring
export const scoreGetToday = () =>
  invoke<DayScore>('score_get_today');

export const scoreGetOverall = () =>
  invoke<OverallScore>('score_get_overall');

export const timelineGetForDay = (date: string) =>
  invoke<ScoreEvent[]>('timeline_get_for_day', { date });

// Analytics
export const analyticsGetDashboard = (localDate: string, days = 7) =>
  invoke<AnalyticsDashboard>('analytics_get_dashboard', { localDate, days });

// Rules
export const rulesGetAll = () =>
  invoke<AllRules>('rules_get_all');

// Tracker
export interface TrackerStatus {
  bundle_id: string | null;
  app_name: string | null;
  idle_seconds: number;
  is_idle: boolean;
  last_tick: string | null;
}

export const trackerGetStatus = () =>
  invoke<TrackerStatus>('tracker_get_status');

// Helpers
export const todayDate = () => new Date().toISOString().slice(0, 10);

export const currentHour = () => new Date().getHours();

export const tomorrowDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};
