import { useEffect, useState, useCallback } from 'react';
import { timelineGetForDay, scoreGetToday, scoreGetOverall, todayDate, analyticsGetDashboard } from '../../lib/api';
import type {
  ScoreEvent,
  DayScore,
  OverallScore,
  AnalyticsDashboard,
  ActivitySegment,
  ActivityDot,
} from '../../lib/types';
import { playClick } from '../../lib/sounds';

const REASON_META: Record<string, { emoji: string; color: string; border: string }> = {
  session_started: { emoji: '⚡', color: 'text-emerald-400', border: 'border-emerald-500/40' },
  session_minute: { emoji: '⏱', color: 'text-zinc-400', border: 'border-zinc-700/30' },
  productive_minute: { emoji: '✅', color: 'text-emerald-400', border: 'border-emerald-500/25' },
  combo_bonus: { emoji: '🔥', color: 'text-orange-400', border: 'border-orange-500/40' },
  session_combo_30: { emoji: '⚡', color: 'text-emerald-400', border: 'border-emerald-500/40' },
  session_combo_60: { emoji: '🔥', color: 'text-orange-400', border: 'border-orange-500/40' },
  session_combo_90: { emoji: '🔥', color: 'text-orange-500', border: 'border-orange-500/50' },
  session_combo_120: { emoji: '🏆', color: 'text-amber-400', border: 'border-amber-500/50' },
  task_completed: { emoji: '📋', color: 'text-emerald-400', border: 'border-emerald-500/25' },
  main_quest_completed: { emoji: '⭐', color: 'text-amber-400', border: 'border-amber-500/40' },
  clean_session_bonus: { emoji: '🏆', color: 'text-amber-400', border: 'border-amber-500/40' },
  red_site_penalty: { emoji: '🌀', color: 'text-red-400', border: 'border-red-500/30' },
  ambient_red_site_penalty: { emoji: '💸', color: 'text-red-400', border: 'border-red-500/25' },
  recovery_bonus: { emoji: '💪', color: 'text-emerald-400', border: 'border-emerald-500/25' },
  reward_purchased: { emoji: '🛍', color: 'text-violet-400', border: 'border-violet-500/30' },
  sunlight: { emoji: '☀️', color: 'text-yellow-400', border: 'border-yellow-500/30' },
  gym: { emoji: '💪', color: 'text-emerald-400', border: 'border-emerald-500/30' },
  book: { emoji: '📚', color: 'text-blue-400', border: 'border-blue-500/30' },
  walk: { emoji: '🚶', color: 'text-sky-400', border: 'border-sky-500/30' },
  no_outside_food: { emoji: '🥗', color: 'text-lime-400', border: 'border-lime-500/30' },
  task_reopened: { emoji: '↩️', color: 'text-zinc-400', border: 'border-zinc-500/30' },
};

const SEGMENT_COLORS: Record<string, string> = {
  focus: 'bg-blue-500/85',
  idle: 'bg-zinc-500/85',
};

const DOT_COLORS: Record<string, string> = {
  dessert_bought: 'bg-red-500',
  dessert_used: 'bg-violet-500',
  habit: 'bg-emerald-500',
  penalty: 'bg-rose-500',
  milestone: 'bg-amber-400',
  task: 'bg-cyan-400',
  other: 'bg-zinc-400',
};

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number): string {
  const totalMins = Math.floor(ms / 60_000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function TimelineActivityLine({ segments, dots }: { segments: ActivitySegment[]; dots: ActivityDot[] }) {
  return (
    <div className="mb-6 bg-zinc-900/55 border border-white/5 rounded-2xl px-3 py-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-widest text-zinc-500">24h activity line</p>
        <p className="text-xs text-zinc-600">00:00 → 24:00</p>
      </div>

      <div className="relative h-14 rounded-xl bg-black/30 border border-white/10 overflow-hidden">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-zinc-700/70 -translate-y-1/2" />

        {segments.map((segment, idx) => {
          const left = (segment.start_minute / 1440) * 100;
          const width = ((segment.end_minute - segment.start_minute) / 1440) * 100;
          return (
            <div
              key={`${segment.kind}-${segment.start_minute}-${segment.end_minute}-${idx}`}
              className={`absolute top-1/2 -translate-y-1/2 h-5 rounded-full ${SEGMENT_COLORS[segment.kind] ?? 'bg-zinc-600/80'}`}
              style={{ left: `${left}%`, width: `${Math.max(width, 0.2)}%` }}
            />
          );
        })}

        {dots.map((dot, idx) => (
          <div
            key={`${dot.kind}-${dot.ts}-${idx}`}
            className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border border-black/50 ${DOT_COLORS[dot.kind] ?? DOT_COLORS.other}`}
            style={{ left: `${(dot.minute / 1440) * 100}%` }}
            title={`${formatTime(dot.ts)} — ${dot.label}`}
          />
        ))}
      </div>

      <div className="flex justify-between text-[10px] text-zinc-600 mt-1.5">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-zinc-400">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />focus</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-zinc-500" />idle</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />dessert bought</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500" />dessert used</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />habits</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" />penalties</span>
      </div>
    </div>
  );
}

type Tab = 'today' | 'overall';

export default function TimelinePage() {
  const [tab, setTab] = useState<Tab>('today');
  const [events, setEvents] = useState<ScoreEvent[]>([]);
  const [score, setScore] = useState<DayScore | null>(null);
  const [overall, setOverall] = useState<OverallScore | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsDashboard | null>(null);

  const refresh = useCallback(async () => {
    const today = todayDate();
    const [ev, s, ov, ad] = await Promise.all([
      timelineGetForDay(today),
      scoreGetToday(),
      scoreGetOverall(),
      analyticsGetDashboard(today, 7),
    ]);
    setEvents(ev);
    setScore(s);
    setOverall(ov);
    setAnalytics(ad);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  const todaySummary = analytics?.today_summary;
  const todayActivity = analytics?.today_activity;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-zinc-200 mb-4">stats</h1>

      <div className="flex gap-1 mb-6 bg-black/30 rounded-xl p-1 border border-white/5">
        {(['today', 'overall'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { playClick(); setTab(t); }}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
              tab === t
                ? 'bg-zinc-700/80 text-zinc-100 ring-1 ring-white/10'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'today' ? (
        <>
          {score && (
            <>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[
                  { label: 'total', value: (score.total >= 0 ? '+' : '') + score.total, color: score.total >= 0 ? 'text-gradient-score-pos' : 'text-gradient-score-neg' },
                  { label: 'earned', value: `+${score.earned}`, color: 'text-emerald-400' },
                  { label: 'lost', value: `−${score.lost}`, color: 'text-red-400' },
                  { label: 'spent', value: `−${score.spent}`, color: 'text-violet-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-zinc-900/60 border border-white/5 rounded-2xl p-3 text-center">
                    <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-3 text-center">
                  <p className="text-lg font-bold tabular-nums text-zinc-200">{todaySummary?.sessions_started ?? score.sessions_today}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">sessions started</p>
                </div>
                <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-3 text-center">
                  <p className="text-lg font-bold tabular-nums text-blue-400">{formatDuration(todaySummary?.work_ms ?? score.time_spent_ms)}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">focus time</p>
                </div>
                <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-3 text-center">
                  <p className="text-lg font-bold tabular-nums text-zinc-300">{formatDuration(todaySummary?.idle_ms ?? 0)}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">idle time</p>
                </div>
              </div>
            </>
          )}

          <TimelineActivityLine segments={todayActivity?.segments ?? []} dots={todayActivity?.dots ?? []} />

          {events.length === 0 ? (
            <div className="text-center text-zinc-500 py-12">
              <p className="text-4xl mb-3">📊</p>
              <p>no activity yet today.</p>
              <p className="text-sm mt-1">start a session to earn points.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {events.map((event) => {
                const meta = REASON_META[event.reason_code] ?? { emoji: '•', color: 'text-zinc-400', border: 'border-zinc-700/30' };
                return (
                  <div
                    key={event.id}
                    className={`flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-zinc-900/50 transition-all border-l-2 ${meta.border} pl-3`}
                  >
                    <span className="text-base shrink-0">{meta.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-300 truncate">{event.explanation}</p>
                    </div>
                    <span className={`text-sm font-mono font-bold tabular-nums shrink-0 ${meta.color}`}>
                      {event.delta > 0 ? '+' : ''}{event.delta}
                    </span>
                    <span className="text-xs text-zinc-600 shrink-0 w-12 text-right">{formatTime(event.ts)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {overall && (
            <>
              <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-5 mb-4 text-center">
                <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">balance</p>
                <p className={`text-5xl font-bold tabular-nums ${overall.total >= 0 ? 'text-gradient-score-pos' : 'text-gradient-score-neg'}`}>
                  {overall.total >= 0 ? '+' : ''}{overall.total}
                </p>
                <p className="text-xs text-zinc-600 mt-1">all-time net pts</p>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: 'earned', value: `+${overall.earned}`, color: 'text-emerald-400' },
                  { label: 'lost', value: `−${overall.lost}`, color: 'text-red-400' },
                  { label: 'spent', value: `−${overall.spent}`, color: 'text-violet-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-zinc-900/60 border border-white/5 rounded-2xl p-3 text-center">
                    <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'days active', value: String(overall.days), emoji: '📅' },
                  { label: 'sessions done', value: String(overall.sessions_completed), emoji: '⚡' },
                  { label: 'tasks completed', value: String(overall.tasks_completed), emoji: '✅' },
                ].map(({ label, value, emoji }) => (
                  <div key={label} className="bg-zinc-900/60 border border-white/5 rounded-2xl p-4 text-center">
                    <p className="text-2xl mb-1">{emoji}</p>
                    <p className="text-xl font-bold text-zinc-100 tabular-nums">{value}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
