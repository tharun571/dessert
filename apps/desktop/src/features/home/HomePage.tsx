import { useEffect, useState, useCallback } from 'react';
import {
  scoreGetToday, sessionGetCurrent, taskListForDate, taskCreate,
  todayDate, tomorrowDate, currentHour,
  sessionStart, sessionStop, sessionPause, sessionResume,
  dayPlanningStatus,
} from '../../lib/api';
import type { DayScore, Session, Task, DayPlanningStatus } from '../../lib/types';
import { playClick, playSuccess, playError, playComplete } from '../../lib/sounds';

type Page = 'home' | 'session' | 'tasks' | 'rewards' | 'timeline' | 'settings';

interface Props {
  onNavigate: (page: Page) => void;
}

export default function HomePage({ onNavigate }: Props) {
  const [score, setScore] = useState<DayScore | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [mainQuest, setMainQuest] = useState<Task | null>(null);
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [planning, setPlanning] = useState<DayPlanningStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  // Inline planning form state
  const [questTitle, setQuestTitle] = useState('');
  const [questMinutes, setQuestMinutes] = useState('');
  const [questMainQuest, setQuestMainQuest] = useState(false);
  const [addingQuest, setAddingQuest] = useState(false);

  // Tomorrow prompt state
  const [dismissedTomorrow, setDismissedTomorrow] = useState(false);

  const today = todayDate();
  const tomorrow = tomorrowDate();
  const hour = currentHour();

  const refresh = useCallback(async () => {
    const [s, sess, tasks, plan] = await Promise.all([
      scoreGetToday(),
      sessionGetCurrent(),
      taskListForDate(today),
      dayPlanningStatus(today, tomorrow, hour),
    ]);
    setScore(s);
    setSession(sess);
    setTodayTasks(tasks);
    setMainQuest(tasks.find(t => t.is_main_quest && t.status === 'planned') ?? null);
    setPlanning(plan);
    setLoading(false);
  }, [today, tomorrow, hour]);

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

  const handleAddQuest = async () => {
    if (!questTitle.trim()) return;
    setAddingQuest(true);
    try {
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
    } finally {
      setAddingQuest(false);
    }
  };

  const handleStartSession = () => run(async () => {
    const s = await sessionStart(undefined, undefined, today);
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
  const plannedTasks = todayTasks.filter(t => t.status === 'planned');
  const needsPlanning = planning?.needs_planning ?? false;
  const showTomorrowPrompt = !dismissedTomorrow && (planning?.suggest_tomorrow ?? false) && !session;

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

      {/* Session card or planning gate */}
      {session ? (
        /* Active/paused session */
        <div className={`border rounded-2xl p-5 mb-4 transition-all ${
          session.state === 'active'
            ? 'bg-zinc-900/80 card-glow-emerald border-emerald-500/20'
            : 'bg-zinc-900/60 border-white/5'
        }`}>
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
              {session.title && <p className="text-zinc-200 font-medium mt-1.5">{session.title}</p>}
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
        </div>
      ) : needsPlanning ? (
        /* Planning gate — must add at least one quest */
        <div className="bg-zinc-900/60 border border-orange-500/20 rounded-2xl p-5 mb-4 card-glow-orange">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🌅</span>
            <p className="text-sm font-semibold text-orange-300">plan today's quests first</p>
          </div>
          <p className="text-xs text-zinc-500 mb-4">add at least one quest to unlock session start</p>

          {/* Quests added so far */}
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

          {/* Inline quest form */}
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
                disabled={!questTitle.trim() || addingQuest}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40 hover:scale-[1.03]"
                style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)' }}
              >
                add
              </button>
            </div>
          </div>

          {/* Once a task exists, unlock session start */}
          {plannedTasks.length > 0 ? (
            <button
              onClick={handleStartSession}
              disabled={actionLoading}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 hover:scale-[1.01] btn-glow-orange mt-2"
              style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%)' }}
            >
              ⚡ start session
            </button>
          ) : (
            <button
              onClick={() => { playClick(); onNavigate('tasks'); }}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mt-1"
            >
              or go to full quests page →
            </button>
          )}
        </div>
      ) : (
        /* No session, day already planned — normal start */
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-5 mb-4">
          <p className="text-zinc-400 text-sm mb-3">no active session. ready to get to work?</p>
          <button
            onClick={handleStartSession}
            disabled={actionLoading}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 hover:scale-[1.01] btn-glow-orange"
            style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%)' }}
          >
            ⚡ start session
          </button>
        </div>
      )}

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

      {/* Tomorrow prompt (soft, dismissible) */}
      {showTomorrowPrompt && (
        <div className="bg-zinc-900/40 border border-violet-500/20 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-300 font-medium">🌙 plan tomorrow before you go?</p>
              <p className="text-xs text-zinc-500 mt-0.5">you haven't added any quests for tomorrow yet</p>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => { playClick(); onNavigate('tasks'); }}
                className="px-3 py-1.5 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/25 rounded-xl text-xs text-violet-300 transition-all whitespace-nowrap"
              >
                plan tomorrow
              </button>
              <button
                onClick={() => { playClick(); setDismissedTomorrow(true); }}
                className="text-zinc-600 hover:text-zinc-400 text-lg leading-none transition-colors"
              >
                ×
              </button>
            </div>
          </div>
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
