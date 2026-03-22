import { useEffect, useState, useCallback, useRef } from 'react';
import {
  sessionGetCurrent, sessionStart, sessionStop, sessionPause, sessionResume,
  taskListForDate, taskCreate, taskMarkDone, trackerGetStatus,
  todayDate, tomorrowDate, currentHour, dayPlanningStatus, logSunlight,
} from '../../lib/api';
import type { Session, Task, TrackerStatus, DayPlanningStatus } from '../../lib/types';
import { playClick, playSuccess, playError, playComplete } from '../../lib/sounds';

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const elapsed = Math.floor((Date.now() - start) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function SessionView() {
  const [session, setSession] = useState<Session | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus | null>(null);
  const [planning, setPlanning] = useState<DayPlanningStatus | null>(null);
  const [timer, setTimer] = useState('00:00');
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('');
  const [showStart, setShowStart] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Inline planning form (shown when gate is active on this page)
  const [questTitle, setQuestTitle] = useState('');
  const [questMinutes, setQuestMinutes] = useState('');
  const [questMainQuest, setQuestMainQuest] = useState(false);
  const [sunlightAnswered, setSunlightAnswered] = useState(false);

  const today = todayDate();
  const tomorrow = tomorrowDate();
  const hour = currentHour();

  const refresh = useCallback(async () => {
    const [s, t, ts, plan] = await Promise.all([
      sessionGetCurrent(),
      taskListForDate(today),
      trackerGetStatus(),
      dayPlanningStatus(today, tomorrow, hour),
    ]);
    setSession(s);
    setTasks(t);
    setTrackerStatus(ts);
    setPlanning(plan);
  }, [today, tomorrow, hour]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (session?.state === 'active') {
      const startedAt = session.started_at;
      intervalRef.current = setInterval(() => {
        setTimer(formatDuration(startedAt));
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [session?.state, session?.started_at]);

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
      playError();
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuest = async () => {
    if (!questTitle.trim()) return;
    playClick();
    await taskCreate({
      title: questTitle.trim(),
      planned_for: today,
      estimated_minutes: questMinutes ? parseInt(questMinutes) : undefined,
      is_main_quest: questMainQuest,
    });
    playComplete();
    setQuestTitle('');
    setQuestMinutes('');
    setQuestMainQuest(false);
    await refresh();
  };

  const handleStart = () => run(async () => {
    const s = await sessionStart(minutes ? parseInt(minutes) : undefined, title || undefined, today);
    setSession(s);
    setShowStart(false);
    setTitle('');
    setMinutes('');
    playSuccess();
    await refresh();
  });

  const handleStop = () => run(async () => {
    if (!session) return;
    playClick();
    await sessionStop(session.id);
    setSession(null);
    await refresh();
  });

  const handlePause = () => run(async () => {
    if (!session) return;
    playClick();
    const s = await sessionPause(session.id);
    setSession(s);
  });

  const handleResume = () => run(async () => {
    if (!session) return;
    playSuccess();
    const s = await sessionResume(session.id);
    setSession(s);
  });

  const handleMarkDone = (task_id: string) => run(async () => {
    playSuccess();
    await taskMarkDone(task_id);
    await refresh();
  });

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-6 text-zinc-200">session</h1>

      {error && (
        <div className="bg-red-900/30 border border-red-500/40 rounded-xl p-3 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Active session */}
      {session ? (
        <div className={`border rounded-2xl p-6 mb-6 transition-all ${
          session.state === 'active'
            ? 'bg-zinc-900/80 card-glow-emerald border-emerald-500/20'
            : 'bg-zinc-900/60 border-white/5'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                session.state === 'active'
                  ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${session.state === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                {session.state === 'active' ? 'active' : 'paused'}
              </span>
              {session.title && <p className="text-zinc-300 font-medium mt-1.5">{session.title}</p>}
            </div>
            <div className="text-right">
              <p className="text-5xl font-mono font-bold text-gradient-orange tabular-nums">{timer}</p>
              <p className="text-xs text-zinc-600 mt-0.5">elapsed</p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4 bg-black/20 rounded-xl p-3 border border-white/5">
            <p className="text-sm text-zinc-400">session score</p>
            <p className={`text-2xl font-bold tabular-nums ${session.score_total >= 0 ? 'text-gradient-orange' : 'text-red-400'}`}>
              {session.score_total >= 0 ? '+' : ''}{session.score_total}
            </p>
          </div>

          <div className="flex gap-2">
            {session.state === 'active' ? (
              <button
                onClick={handlePause}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm transition-all disabled:opacity-50 hover:scale-[1.02]"
              >
                ⏸ pause
              </button>
            ) : (
              <button
                onClick={handleResume}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm transition-all disabled:opacity-50 hover:scale-[1.02]"
              >
                ▶ resume
              </button>
            )}
            <button
              onClick={handleStop}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-red-900/40 hover:text-red-300 text-sm transition-all disabled:opacity-50 hover:scale-[1.02]"
            >
              ⏹ stop session
            </button>
          </div>
        </div>
      ) : planning?.needs_planning ? (
        /* Planning gate */
        <div className="bg-zinc-900/60 border border-orange-500/20 rounded-2xl p-6 mb-6 card-glow-orange">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🌅</span>
            <p className="text-sm font-semibold text-orange-300">plan today's quests first</p>
          </div>
          <p className="text-xs text-zinc-500 mb-4">add at least one quest to unlock session start</p>
          {tasks.filter(t => t.status === 'planned').length > 0 && (
            <div className="space-y-1.5 mb-4">
              {tasks.filter(t => t.status === 'planned').map(t => (
                <div key={t.id} className="flex items-center gap-2 text-sm text-zinc-300">
                  <span className="text-emerald-400 text-xs">✓</span>
                  <span>{t.is_main_quest && '⭐ '}{t.title}</span>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2 mb-3">
            <input
              autoFocus
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 transition-colors"
              placeholder="what's the quest?"
              value={questTitle}
              onChange={e => setQuestTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddQuest()}
            />
            <div className="flex gap-2">
              <input
                type="number"
                className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500/60 transition-colors"
                placeholder="minutes (optional)"
                value={questMinutes}
                onChange={e => setQuestMinutes(e.target.value)}
              />
              <button
                onClick={() => { playClick(); setQuestMainQuest(!questMainQuest); }}
                className={`px-3 py-2 rounded-xl text-sm transition-all ${
                  questMainQuest
                    ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                    : 'bg-white/5 border border-white/10 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                ⭐
              </button>
              <button
                onClick={handleAddQuest}
                disabled={!questTitle.trim()}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)' }}
              >
                add
              </button>
            </div>
          </div>
          {tasks.filter(t => t.status === 'planned').length > 0 && (
            <button
              onClick={() => { playClick(); setShowStart(true); }}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] btn-glow-orange"
              style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%)' }}
            >
              ⚡ start session
            </button>
          )}
        </div>
      ) : showStart ? (
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">new session</h2>
          <input
            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-orange-500/60 transition-colors"
            placeholder="session title (optional)"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          <input
            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm mb-4 focus:outline-none focus:border-orange-500/60 transition-colors"
            placeholder="planned duration in minutes (optional)"
            type="number"
            value={minutes}
            onChange={e => setMinutes(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={handleStart}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 hover:scale-[1.02] btn-glow-orange"
              style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%)' }}
            >
              ⚡ start
            </button>
            <button
              onClick={() => { playClick(); setShowStart(false); }}
              className="px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm transition-all"
            >
              cancel
            </button>
          </div>
        </div>
      ) : !sunlightAnswered && planning?.ask_sunlight ? (
        /* Sunlight check — morning, first session */
        <div className="bg-zinc-900/60 border border-yellow-500/25 rounded-2xl p-6 mb-6"
          style={{ boxShadow: '0 0 0 1px rgba(234,179,8,0.2), 0 0 20px rgba(234,179,8,0.07)' }}>
          <p className="text-base font-semibold text-zinc-100 mb-1">☀️ did you get some sunlight?</p>
          <p className="text-xs text-zinc-500 mb-4">step outside before diving in — even 5 minutes counts</p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                playSuccess();
                await logSunlight(today);
                setSunlightAnswered(true);
                await refresh();
              }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #eab308 0%, #f59e0b 100%)' }}
            >
              yes! +10 pts ☀️
            </button>
            <button
              onClick={() => { playClick(); setSunlightAnswered(true); }}
              className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 text-sm transition-all"
            >
              not yet
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-6 mb-6 text-center">
          <p className="text-zinc-400 mb-4">no active session</p>
          <button
            onClick={() => { playClick(); setShowStart(true); }}
            className="px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] btn-glow-orange"
            style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%)' }}
          >
            ⚡ start session
          </button>
        </div>
      )}

      {/* Tracker status */}
      {trackerStatus && (trackerStatus.is_idle || trackerStatus.app_name) && (
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-4 mb-4">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">now tracking</p>
          <div className="flex items-center gap-2">
            {trackerStatus.is_idle ? (
              <span className="text-zinc-500 text-sm">💤 idle ({Math.floor(trackerStatus.idle_seconds / 60)}m)</span>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm text-zinc-200">{trackerStatus.app_name}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tasks in session */}
      {tasks.filter(t => t.status === 'planned').length > 0 && (
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-5 mb-4">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">today's quests</h2>
          <div className="space-y-2">
            {tasks.filter(t => t.status === 'planned').map(task => (
              <div key={task.id} className="flex items-center gap-3">
                <button
                  onClick={() => handleMarkDone(task.id)}
                  disabled={loading}
                  className="w-5 h-5 rounded border border-zinc-600 hover:border-emerald-400 hover:bg-emerald-500/10 flex items-center justify-center shrink-0 transition-all disabled:opacity-50"
                />
                <span className={`text-sm ${task.is_main_quest ? 'text-amber-300 font-medium' : 'text-zinc-300'}`}>
                  {task.is_main_quest && '⭐ '}{task.title}
                </span>
                {task.estimated_minutes && (
                  <span className="text-xs text-zinc-600 ml-auto">~{task.estimated_minutes}m</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
