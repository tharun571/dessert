import { useEffect, useState, useCallback, useRef } from 'react';
import {
  sessionGetCurrent, sessionStart, sessionStop, sessionPause, sessionResume,
  taskListForDate, taskMarkDone, rewardList, rewardPurchase, trackerGetStatus, todayDate,
} from '../../lib/api';
import type { Session, Task, Reward, TrackerStatus } from '../../lib/types';
import { playClick, playSuccess, playPurchase, playError } from '../../lib/sounds';

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
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus | null>(null);
  const [timer, setTimer] = useState('00:00');
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('');
  const [showStart, setShowStart] = useState(false);
  const [buyMsg, setBuyMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const [s, t, r, ts] = await Promise.all([
      sessionGetCurrent(),
      taskListForDate(todayDate()),
      rewardList(),
      trackerGetStatus(),
    ]);
    setSession(s);
    setTasks(t);
    setRewards(r);
    setTrackerStatus(ts);
  }, []);

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

  const handleStart = () => run(async () => {
    const s = await sessionStart(minutes ? parseInt(minutes) : undefined, title || undefined);
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

  const handleBuyReward = (reward_id: string, reward_name: string) => run(async () => {
    await rewardPurchase(reward_id, session?.id);
    playPurchase();
    setBuyMsg(`🎉 ${reward_name} added to inventory!`);
    setTimeout(() => setBuyMsg(''), 3000);
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
      {trackerStatus && (
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-4 mb-4">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">now tracking</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {trackerStatus.is_idle ? (
                <span className="text-zinc-500 text-sm">💤 idle ({Math.floor(trackerStatus.idle_seconds / 60)}m)</span>
              ) : trackerStatus.app_name ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-sm text-zinc-200">{trackerStatus.app_name}</span>
                </>
              ) : (
                <span className="text-zinc-600 text-sm">waiting for first tick…</span>
              )}
            </div>
            {trackerStatus.consecutive_productive_secs > 0 && (
              <div className="flex items-center gap-1 text-xs text-orange-400">
                <span>🔥</span>
                <span>{Math.floor(trackerStatus.consecutive_productive_secs / 60)}m streak</span>
              </div>
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

      {/* Quick buy reward */}
      {buyMsg && (
        <div className="bg-emerald-900/20 border border-emerald-500/25 rounded-2xl p-3 mb-4 text-sm text-emerald-300">
          {buyMsg}
        </div>
      )}
      {rewards.slice(0, 4).length > 0 && (
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-5">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">quick buy</h2>
          <div className="grid grid-cols-2 gap-2">
            {rewards.slice(0, 4).map(r => (
              <button
                key={r.id}
                onClick={() => handleBuyReward(r.id, r.name)}
                disabled={loading}
                className="flex items-center justify-between bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 hover:border-orange-500/40 rounded-xl px-3 py-2.5 text-sm transition-all disabled:opacity-50 hover:scale-[1.02]"
              >
                <span className="text-zinc-200">{r.name}</span>
                <span className="text-orange-400 font-mono text-xs font-bold">{r.cost}pt</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
