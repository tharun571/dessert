import { useEffect, useState, useCallback, useRef } from 'react';
import {
  scoreGetToday, scoreGetOverall, sessionGetCurrent, taskListForDate, taskCreate, taskMarkDone,
  sessionStart, sessionStop, sessionPause, sessionResume, sessionEndStats, trackerGetStatus,
  todayDate, tomorrowDate, currentHour,
  dayPlanningStatus, logSunlight,
} from '../../lib/api';
import type { DayScore, OverallScore, Session, Task, TrackerStatus, DayPlanningStatus, SessionEndStats } from '../../lib/types';
import { playClick, playSuccess, playError, playComplete, playCelebrate } from '../../lib/sounds';
import SessionEndOverlay from './SessionEndOverlay';

type Page = 'home' | 'session' | 'tasks' | 'rewards' | 'inventory' | 'timeline' | 'settings';

interface Props {
  onNavigate: (page: Page) => void;
}

function formatDuration(startedAt: string, pausedMs: number): string {
  const start = new Date(startedAt).getTime();
  const elapsed = Math.max(0, Math.floor((Date.now() - start - pausedMs) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function HomePage({ onNavigate: _onNavigate }: Props) {
  const [score, setScore] = useState<DayScore | null>(null);
  const [overall, setOverall] = useState<OverallScore | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus | null>(null);
  const [planning, setPlanning] = useState<DayPlanningStatus | null>(null);
  const [timer, setTimer] = useState('00:00');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  // Start session form
  const [showStart, setShowStart] = useState(false);
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('');

  // Inline planning form
  const [questTitle, setQuestTitle] = useState('');
  const [questMinutes, setQuestMinutes] = useState('');
  const [questMainQuest, setQuestMainQuest] = useState(false);
  const [addingQuest, setAddingQuest] = useState(false);

  const [dismissedTomorrow, setDismissedTomorrow] = useState(false);
  const [sunlightAnswered, setSunlightAnswered] = useState(false);
  const [endedSession, setEndedSession] = useState<Session | null>(null);
  const [endStats, setEndStats] = useState<SessionEndStats | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const today = todayDate();
  const tomorrow = tomorrowDate();
  const hour = currentHour();

  const refresh = useCallback(async () => {
    const [s, ov, sess, t, ts, plan] = await Promise.all([
      scoreGetToday(),
      scoreGetOverall(),
      sessionGetCurrent(),
      taskListForDate(today),
      trackerGetStatus(),
      dayPlanningStatus(today, tomorrow, hour),
    ]);
    setScore(s);
    setOverall(ov);
    setSession(sess);
    setTasks(t);
    setTrackerStatus(ts);
    setPlanning(plan);
    setLoading(false);
  }, [today, tomorrow, hour]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Live timer
  useEffect(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }

    if (!session || session.state === 'ended') {
      setTimer('00:00');
      return;
    }

    if (session.state === 'active') {
      const { started_at, paused_ms } = session;
      // Tick every second, subtracting accumulated paused time
      intervalRef.current = setInterval(() => setTimer(formatDuration(started_at, paused_ms)), 1000);
      setTimer(formatDuration(started_at, paused_ms));
    } else {
      // Paused: freeze timer at the moment of pause (paused_at is set, add no current-pause time)
      const currentPauseMs = session.paused_at
        ? Date.now() - new Date(session.paused_at).getTime()
        : 0;
      setTimer(formatDuration(session.started_at, session.paused_ms + currentPauseMs));
    }

    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  }, [session?.state, session?.started_at, session?.paused_ms, session?.paused_at]);

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setActionLoading(true);
    try { await fn(); } catch (e) { setError(String(e)); playError(); } finally { setActionLoading(false); }
  };

  const handleAddQuest = async () => {
    if (!questTitle.trim()) return;
    setAddingQuest(true);
    try {
      playClick();
      await taskCreate({ title: questTitle.trim(), planned_for: today, estimated_minutes: questMinutes ? parseInt(questMinutes) : undefined, is_main_quest: questMainQuest });
      playComplete();
      setQuestTitle(''); setQuestMinutes(''); setQuestMainQuest(false);
      await refresh();
    } finally { setAddingQuest(false); }
  };

  const handleStartSession = () => run(async () => {
    const s = await sessionStart(minutes ? parseInt(minutes) : undefined, title || undefined, today);
    setSession(s); setShowStart(false); setTitle(''); setMinutes('');
    playSuccess(); await refresh();
  });

  const handleStop = () => run(async () => {
    if (!session) return;
    const ended = await sessionStop(session.id);
    const stats = await sessionEndStats(session.id);
    playCelebrate();
    setEndedSession(ended);
    setEndStats(stats);
    setSession(null);
    await refresh();
  });

  const handlePauseResume = () => run(async () => {
    if (!session) return;
    playClick();
    if (session.state === 'active') { const s = await sessionPause(session.id); setSession(s); }
    else { const s = await sessionResume(session.id); setSession(s); playSuccess(); }
  });

  const handleMarkDone = (task_id: string) => run(async () => {
    playComplete(); await taskMarkDone(task_id); await refresh();
  });

  if (loading) return <div className="flex items-center justify-center h-full text-zinc-500">loading...</div>;

  const totalDisplay = score?.total ?? 0;
  const isPositive = totalDisplay >= 0;
  const plannedTasks = tasks.filter(t => t.status === 'planned');
  const needsPlanning = planning?.needs_planning ?? false;
  const askSunlight = !sunlightAnswered && (planning?.ask_sunlight ?? false);
  const showTomorrowPrompt = !dismissedTomorrow && (planning?.suggest_tomorrow ?? false) && !session;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {endedSession && endStats && (
        <SessionEndOverlay
          session={endedSession}
          stats={endStats}
          onDismiss={() => { setEndedSession(null); setEndStats(null); }}
        />
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-500/40 rounded-xl p-3 mb-4 text-sm text-red-300">{error}</div>
      )}

      {/* Score banner */}
      <div className="mb-8">
        <div className="flex items-end justify-between mb-1">
          <p className="text-zinc-500 text-xs uppercase tracking-widest">today</p>
          {overall !== null && (
            <div className="text-right">
              <p className="text-zinc-500 text-xs uppercase tracking-widest">all-time</p>
              <p className={`text-2xl font-bold tabular-nums ${overall.total >= 0 ? 'text-gradient-score-pos' : 'text-gradient-score-neg'}`}>
                {overall.total >= 0 ? '+' : ''}{overall.total}
              </p>
            </div>
          )}
        </div>
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

      {/* Session card / gates */}
      {session ? (
        <div className={`border rounded-2xl p-6 mb-4 transition-all ${
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
            <button onClick={handlePauseResume} disabled={actionLoading}
              className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm transition-all disabled:opacity-50 hover:scale-[1.02]">
              {session.state === 'active' ? '⏸ pause' : '▶ resume'}
            </button>
            <button onClick={handleStop} disabled={actionLoading}
              className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-red-900/40 hover:text-red-300 text-sm transition-all disabled:opacity-50 hover:scale-[1.02]">
              ⏹ stop
            </button>
          </div>
        </div>
      ) : needsPlanning ? (
        <div className="bg-zinc-900/60 border border-orange-500/20 rounded-2xl p-5 mb-4 card-glow-orange">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🌅</span>
            <p className="text-sm font-semibold text-orange-300">plan today's quests first</p>
          </div>
          <p className="text-xs text-zinc-500 mb-4">add at least one quest to unlock session start</p>
          {plannedTasks.length > 0 && (
            <div className="space-y-1.5 mb-4">
              {plannedTasks.map(t => (
                <div key={t.id} className="flex items-center gap-2 text-sm text-zinc-300">
                  <span className="text-emerald-400 text-xs">✓</span>
                  <span>{t.is_main_quest && '⭐ '}{t.title}</span>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2 mb-3">
            <input
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 transition-colors"
              placeholder="what's the quest?"
              value={questTitle}
              onChange={e => setQuestTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddQuest()}
              autoFocus
            />
            <div className="flex gap-2">
              <input type="number"
                className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500/60 transition-colors"
                placeholder="minutes (optional)" value={questMinutes} onChange={e => setQuestMinutes(e.target.value)}
              />
              <button onClick={() => { playClick(); setQuestMainQuest(!questMainQuest); }}
                className={`px-3 py-2 rounded-xl text-sm transition-all ${questMainQuest ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300' : 'bg-white/5 border border-white/10 text-zinc-400 hover:text-zinc-200'}`}>
                ⭐
              </button>
              <button onClick={handleAddQuest} disabled={!questTitle.trim() || addingQuest}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40 hover:scale-[1.03]"
                style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)' }}>
                add
              </button>
            </div>
          </div>
          {plannedTasks.length > 0 && (
            <button onClick={handleStartSession} disabled={actionLoading}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 hover:scale-[1.01] btn-glow-orange mt-2"
              style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%)' }}>
              ⚡ start session
            </button>
          )}
        </div>
      ) : askSunlight ? (
        <div className="bg-zinc-900/60 border border-yellow-500/25 rounded-2xl p-5 mb-4"
          style={{ boxShadow: '0 0 0 1px rgba(234,179,8,0.2), 0 0 20px rgba(234,179,8,0.07)' }}>
          <p className="text-base font-semibold text-zinc-100 mb-1">☀️ did you get some sunlight?</p>
          <p className="text-xs text-zinc-500 mb-4">step outside before diving in — even 5 minutes counts</p>
          <div className="flex gap-2">
            <button onClick={async () => { playSuccess(); await logSunlight(today); setSunlightAnswered(true); await refresh(); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #eab308 0%, #f59e0b 100%)' }}>
              yes! +10 pts ☀️
            </button>
            <button onClick={() => { playClick(); setSunlightAnswered(true); }}
              className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 text-sm transition-all">
              not yet
            </button>
          </div>
        </div>
      ) : showStart ? (
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-5 mb-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">new session</h2>
          <input className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-orange-500/60 transition-colors"
            placeholder="session title (optional)" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <input className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm mb-4 focus:outline-none focus:border-orange-500/60 transition-colors"
            placeholder="planned duration in minutes (optional)" type="number" value={minutes} onChange={e => setMinutes(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={handleStartSession} disabled={actionLoading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 hover:scale-[1.02] btn-glow-orange"
              style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%)' }}>
              ⚡ start
            </button>
            <button onClick={() => { playClick(); setShowStart(false); }}
              className="px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm transition-all">
              cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-5 mb-4 text-center">
          <p className="text-zinc-400 mb-4">no active session. ready to get to work?</p>
          <button onClick={() => { playClick(); setShowStart(true); }} disabled={actionLoading}
            className="px-6 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 hover:scale-[1.01] btn-glow-orange"
            style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%)' }}>
            ⚡ start session
          </button>
        </div>
      )}

      {/* Tracker status */}
      {trackerStatus && (
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-4 mb-4">
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

      {/* Today's quest checklist */}
      {plannedTasks.length > 0 && (
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-5 mb-4">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">today's quests</h2>
          <div className="space-y-2">
            {plannedTasks.map(task => (
              <div key={task.id} className="flex items-center gap-3">
                <button
                  onClick={() => handleMarkDone(task.id)}
                  disabled={actionLoading}
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

      {/* Tomorrow prompt */}
      {showTomorrowPrompt && (
        <div className="bg-zinc-900/40 border border-violet-500/20 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-300 font-medium">🌙 plan tomorrow before you go?</p>
              <p className="text-xs text-zinc-500 mt-0.5">you haven't added any quests for tomorrow yet</p>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button onClick={() => { playClick(); _onNavigate('tasks'); }}
                className="px-3 py-1.5 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/25 rounded-xl text-xs text-violet-300 transition-all whitespace-nowrap">
                plan tomorrow
              </button>
              <button onClick={() => { playClick(); setDismissedTomorrow(true); }}
                className="text-zinc-600 hover:text-zinc-400 text-lg leading-none transition-colors">
                ×
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
