import { useEffect, useState, useCallback } from 'react';
import { timelineGetForDay, scoreGetToday, scoreGetOverall, todayDate } from '../../lib/api';
import type { ScoreEvent, DayScore, OverallScore } from '../../lib/types';
import { playClick } from '../../lib/sounds';

const REASON_META: Record<string, { emoji: string; color: string; border: string }> = {
  session_started:         { emoji: '⚡', color: 'text-emerald-400', border: 'border-emerald-500/40' },
  productive_minute:       { emoji: '✅', color: 'text-emerald-400', border: 'border-emerald-500/25' },
  combo_bonus:             { emoji: '🔥', color: 'text-orange-400',  border: 'border-orange-500/40' },
  session_combo_60:        { emoji: '🔥', color: 'text-orange-400',  border: 'border-orange-500/40' },
  session_combo_90:        { emoji: '🔥', color: 'text-orange-500',  border: 'border-orange-500/50' },
  session_combo_120:       { emoji: '🏆', color: 'text-amber-400',   border: 'border-amber-500/50' },
  task_completed:          { emoji: '📋', color: 'text-emerald-400', border: 'border-emerald-500/25' },
  main_quest_completed:    { emoji: '⭐', color: 'text-amber-400',   border: 'border-amber-500/40' },
  clean_session_bonus:     { emoji: '🏆', color: 'text-amber-400',   border: 'border-amber-500/40' },
  red_site_penalty:        { emoji: '🌀', color: 'text-red-400',     border: 'border-red-500/30' },
  ambient_red_site_penalty:{ emoji: '💸', color: 'text-red-400',     border: 'border-red-500/25' },
  recovery_bonus:          { emoji: '💪', color: 'text-emerald-400', border: 'border-emerald-500/25' },
  reward_purchased:        { emoji: '🛍', color: 'text-violet-400',  border: 'border-violet-500/30' },
  sunlight:                { emoji: '☀️', color: 'text-yellow-400',  border: 'border-yellow-500/30' },
  gym:                     { emoji: '💪', color: 'text-emerald-400', border: 'border-emerald-500/30' },
  book:                    { emoji: '📚', color: 'text-blue-400',    border: 'border-blue-500/30' },
  walk:                    { emoji: '🚶', color: 'text-sky-400',     border: 'border-sky-500/30' },
  no_outside_food:         { emoji: '🥗', color: 'text-lime-400',    border: 'border-lime-500/30' },
  task_reopened:           { emoji: '↩️', color: 'text-zinc-400',    border: 'border-zinc-500/30' },
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

type Tab = 'today' | 'overall';

export default function TimelinePage() {
  const [tab, setTab] = useState<Tab>('today');
  const [events, setEvents] = useState<ScoreEvent[]>([]);
  const [score, setScore] = useState<DayScore | null>(null);
  const [overall, setOverall] = useState<OverallScore | null>(null);

  const refresh = useCallback(async () => {
    const [ev, s, ov] = await Promise.all([
      timelineGetForDay(todayDate()),
      scoreGetToday(),
      scoreGetOverall(),
    ]);
    setEvents(ev);
    setScore(s);
    setOverall(ov);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-zinc-200 mb-4">stats</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-black/30 rounded-xl p-1 border border-white/5">
        {(['today', 'overall'] as Tab[]).map(t => (
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
                  { label: 'total',  value: (score.total >= 0 ? '+' : '') + score.total,  color: score.total >= 0 ? 'text-gradient-score-pos' : 'text-gradient-score-neg' },
                  { label: 'earned', value: `+${score.earned}`, color: 'text-emerald-400' },
                  { label: 'lost',   value: `−${score.lost}`,   color: 'text-red-400' },
                  { label: 'spent',  value: `−${score.spent}`,  color: 'text-violet-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-zinc-900/60 border border-white/5 rounded-2xl p-3 text-center">
                    <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 mb-6">
                <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-3 text-center">
                  <p className="text-lg font-bold tabular-nums text-zinc-200">{score.sessions_today}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">sessions today</p>
                </div>
                <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-3 text-center">
                  <p className="text-lg font-bold tabular-nums text-zinc-200">{formatDuration(score.time_spent_ms)}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">time focused</p>
                </div>
              </div>
            </>
          )}

          {events.length === 0 ? (
            <div className="text-center text-zinc-500 py-12">
              <p className="text-4xl mb-3">📊</p>
              <p>no activity yet today.</p>
              <p className="text-sm mt-1">start a session to earn points.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {events.map(event => {
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
              {/* Balance */}
              <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-5 mb-4 text-center">
                <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">balance</p>
                <p className={`text-5xl font-bold tabular-nums ${overall.total >= 0 ? 'text-gradient-score-pos' : 'text-gradient-score-neg'}`}>
                  {overall.total >= 0 ? '+' : ''}{overall.total}
                </p>
                <p className="text-xs text-zinc-600 mt-1">all-time net pts</p>
              </div>

              {/* Score breakdown */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: 'earned', value: `+${overall.earned}`, color: 'text-emerald-400' },
                  { label: 'lost',   value: `−${overall.lost}`,   color: 'text-red-400' },
                  { label: 'spent',  value: `−${overall.spent}`,  color: 'text-violet-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-zinc-900/60 border border-white/5 rounded-2xl p-3 text-center">
                    <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Activity stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'days active',        value: String(overall.days),               emoji: '📅' },
                  { label: 'sessions done',       value: String(overall.sessions_completed), emoji: '⚡' },
                  { label: 'tasks completed',     value: String(overall.tasks_completed),    emoji: '✅' },
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
