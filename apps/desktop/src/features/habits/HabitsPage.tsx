import { useCallback, useEffect, useState } from 'react';
import {
  currentHour,
  dayPlanningStatus,
  logBook,
  logColdShower,
  logGym,
  logMeditation,
  logNoOutsideFood,
  logSingingPractice,
  logSunlight,
  logWalk,
  todayDate,
  tomorrowDate,
  unlogHabit,
} from '../../lib/api';
import type { DayPlanningStatus } from '../../lib/types';
import { playClick, playSuccess } from '../../lib/sounds';

export default function HabitsPage() {
  const [planning, setPlanning] = useState<DayPlanningStatus | null>(null);

  const today = todayDate();
  const tomorrow = tomorrowDate();

  const refresh = useCallback(async () => {
    const p = await dayPlanningStatus(today, tomorrow, currentHour());
    setPlanning(p);
  }, [today, tomorrow]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!planning) {
    return <div className="flex items-center justify-center h-full text-zinc-500">loading...</div>;
  }

  const fmtTime = (ts: string | null) =>
    ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  const habits = [
    { label: '☀️ morning sunlight', done: planning.sunlight_done, at: fmtTime(planning.sunlight_at), code: 'sunlight', points: 10, onLog: () => logSunlight(today), activeColor: 'border-yellow-500 bg-yellow-500/20 text-yellow-400', hoverColor: 'hover:border-yellow-400 hover:bg-yellow-500/10' },
    { label: '💪 gym', done: planning.gym_done, at: fmtTime(planning.gym_at), code: 'gym', points: 10, onLog: () => logGym(today), activeColor: 'border-emerald-500 bg-emerald-500/20 text-emerald-400', hoverColor: 'hover:border-emerald-400 hover:bg-emerald-500/10' },
    { label: '📚 read a book', done: planning.book_done, at: fmtTime(planning.book_at), code: 'book', points: 10, onLog: () => logBook(today), activeColor: 'border-blue-500 bg-blue-500/20 text-blue-400', hoverColor: 'hover:border-blue-400 hover:bg-blue-500/10' },
    { label: '🚶 go for a walk', done: planning.walk_done, at: fmtTime(planning.walk_at), code: 'walk', points: 10, onLog: () => logWalk(today), activeColor: 'border-sky-500 bg-sky-500/20 text-sky-400', hoverColor: 'hover:border-sky-400 hover:bg-sky-500/10' },
    { label: '🥗 no outside food', done: planning.no_outside_food_done, at: fmtTime(planning.no_outside_food_at), code: 'no_outside_food', points: 10, onLog: () => logNoOutsideFood(today), activeColor: 'border-lime-500 bg-lime-500/20 text-lime-400', hoverColor: 'hover:border-lime-400 hover:bg-lime-500/10' },
    { label: '🚿 cold shower', done: planning.cold_shower_done, at: fmtTime(planning.cold_shower_at), code: 'cold_shower', points: 50, onLog: () => logColdShower(today), activeColor: 'border-cyan-500 bg-cyan-500/20 text-cyan-400', hoverColor: 'hover:border-cyan-400 hover:bg-cyan-500/10' },
    { label: '🧘 meditation', done: planning.meditation_done, at: fmtTime(planning.meditation_at), code: 'meditation', points: 50, onLog: () => logMeditation(today), activeColor: 'border-fuchsia-500 bg-fuchsia-500/20 text-fuchsia-400', hoverColor: 'hover:border-fuchsia-400 hover:bg-fuchsia-500/10' },
    { label: '🎤 singing practice', done: planning.singing_practice_done, at: fmtTime(planning.singing_practice_at), code: 'singing_practice', points: 50, onLog: () => logSingingPractice(today), activeColor: 'border-rose-500 bg-rose-500/20 text-rose-400', hoverColor: 'hover:border-rose-400 hover:bg-rose-500/10' },
  ];

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-zinc-200 mb-6">habits</h1>
      <div className="space-y-2">
        {habits.map((h) => (
          <div key={h.label} className="flex items-center gap-3 bg-zinc-900/60 border border-white/5 rounded-2xl p-3.5">
            <button
              onClick={async () => {
                if (h.done) {
                  playClick();
                  await unlogHabit(h.code, today);
                } else {
                  playSuccess();
                  await h.onLog();
                }
                await refresh();
              }}
              className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all text-xs ${h.done ? h.activeColor : `border-zinc-600 ${h.hoverColor}`}`}
            >
              {h.done && '✓'}
            </button>
            <div className="flex-1">
              <p className="text-sm text-zinc-300">{h.label}</p>
              {h.done && h.at && <p className="text-xs text-zinc-600 mt-0.5">logged at {h.at} · +{h.points} pts</p>}
            </div>
            {!h.done && <span className="text-xs text-zinc-600">+{h.points} pts</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
