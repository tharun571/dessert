import { useEffect, useState, useCallback } from 'react';
import { scoreGetToday, sessionGetCurrent, taskListForDate, todayDate, sessionStart, sessionStop, sessionPause, sessionResume } from '../../lib/api';
import type { DayScore, Session, Task } from '../../lib/types';
import { playClick, playSuccess, playError } from '../../lib/sounds';

type Page = 'home' | 'session' | 'tasks' | 'rewards' | 'timeline' | 'settings';

interface Props {
  onNavigate: (page: Page) => void;
}

export default function HomePage({ onNavigate }: Props) {
  const [score, setScore] = useState<DayScore | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [mainQuest, setMainQuest] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [s, sess, tasks] = await Promise.all([
      scoreGetToday(),
      sessionGetCurrent(),
      taskListForDate(todayDate()),
    ]);
    setScore(s);
    setSession(sess);
    setMainQuest(tasks.find(t => t.is_main_quest && t.status === 'planned') ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setActionLoading(true);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
      playError();
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartSession = () => run(async () => {
    const s = await sessionStart(undefined, undefined);
    setSession(s);
    playSuccess();
    onNavigate('session');
  });

  const handleStopSession = () => run(async () => {
    if (!session) return;
    playClick();
    await sessionStop(session.id);
    await refresh();
  });

  const handlePauseResume = () => run(async () => {
    if (!session) return;
    playClick();
    if (session.state === 'active') {
      const s = await sessionPause(session.id);
      setSession(s);
    } else {
      const s = await sessionResume(session.id);
      setSession(s);
    }
  });

  if (loading) {
    return <div className="flex items-center justify-center h-full text-zinc-500">loading...</div>;
  }

  const totalDisplay = score?.total ?? 0;
  const isPositive = totalDisplay >= 0;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {error && (
        <div className="bg-red-900/30 border border-red-500/40 rounded-xl p-3 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Score banner */}
      <div className="mb-8">
        <p className="text-zinc-500 text-xs uppercase tracking-widest mb-1">today's score</p>
        <div className={`text-7xl font-bold tabular-nums ${isPositive ? 'text-gradient-score-pos' : 'text-gradient-score-neg'}`}>
          {isPositive ? '+' : ''}{totalDisplay}
        </div>
        {score && (
          <div className="flex gap-4 mt-2 text-sm">
            <span className="text-emerald-400">+{score.earned} earned</span>
            <span className="text-red-400">−{score.lost} lost</span>
            <span className="text-violet-400">−{score.spent} spent</span>
          </div>
        )}
      </div>

      {/* Session card */}
      <div className={`border rounded-2xl p-5 mb-4 transition-all ${
        session?.state === 'active'
          ? 'bg-zinc-900/80 card-glow-emerald border-emerald-500/20'
          : 'bg-zinc-900/60 border-white/5'
      }`}>
        {session ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                  session.state === 'active'
                    ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${session.state === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  {session.state === 'active' ? 'active' : 'paused'}
                </span>
                {session.title && (
                  <p className="text-zinc-200 font-medium mt-1.5">{session.title}</p>
                )}
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold tabular-nums ${session.score_total >= 0 ? 'text-gradient-orange' : 'text-red-400'}`}>
                  {session.score_total > 0 ? '+' : ''}{session.score_total}
                </p>
                <p className="text-xs text-zinc-600 mt-0.5">session pts</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePauseResume}
                disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm transition-all disabled:opacity-50 hover:scale-[1.02]"
              >
                {session.state === 'active' ? '⏸ pause' : '▶ resume'}
              </button>
              <button
                onClick={handleStopSession}
                disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-red-900/40 hover:text-red-300 text-sm transition-all disabled:opacity-50 hover:scale-[1.02]"
              >
                ⏹ stop
              </button>
              <button
                onClick={() => { playClick(); onNavigate('session'); }}
                className="flex-1 py-2.5 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 text-sm transition-all hover:scale-[1.02] btn-glow-orange"
              >
                view →
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-zinc-400 text-sm mb-3">no active session. ready to get to work?</p>
            <button
              onClick={handleStartSession}
              disabled={actionLoading}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 hover:scale-[1.01] btn-glow-orange"
              style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%)' }}
            >
              ⚡ start session
            </button>
          </>
        )}
      </div>

      {/* Main Quest */}
      {mainQuest && (
        <div className="bg-zinc-900/60 border border-amber-500/25 rounded-2xl p-5 mb-4 card-glow-amber">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-amber-400 text-xs font-semibold uppercase tracking-wider">⭐ main quest</span>
          </div>
          <p className="text-zinc-100 font-medium">{mainQuest.title}</p>
          {mainQuest.estimated_minutes && (
            <p className="text-xs text-zinc-500 mt-1">~{mainQuest.estimated_minutes} min</p>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { page: 'tasks' as Page, icon: '📋', label: 'quests' },
          { page: 'rewards' as Page, icon: '🍨', label: 'shop' },
          { page: 'timeline' as Page, icon: '📊', label: 'timeline' },
        ].map(({ page: p, icon, label }) => (
          <button
            key={p}
            onClick={() => { playClick(); onNavigate(p); }}
            className="bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/5 hover:border-white/10 rounded-2xl p-4 text-center transition-all card-hover"
          >
            <div className="text-2xl mb-1.5">{icon}</div>
            <p className="text-xs text-zinc-400">{label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
