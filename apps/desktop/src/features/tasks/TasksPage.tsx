import { useEffect, useState, useCallback } from 'react';
import {
  taskListForDate, taskCreate, taskMarkDone, taskReopen, taskDelete, taskUpdate,
  todayDate, tomorrowDate, currentHour, dayPlanningStatus, logSunlight, logGym, logBook, logWalk, logNoOutsideFood,
} from '../../lib/api';
import type { Task, DayPlanningStatus } from '../../lib/types';
import { playClick, playSuccess, playComplete } from '../../lib/sounds';

type Tab = 'today' | 'tomorrow';

export default function TasksPage() {
  const [tab, setTab] = useState<Tab>('today');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newMinutes, setNewMinutes] = useState('');
  const [newMainQuest, setNewMainQuest] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [planning, setPlanning] = useState<DayPlanningStatus | null>(null);

  const today = todayDate();
  const tomorrow = tomorrowDate();
  const date = tab === 'today' ? today : tomorrow;

  const refresh = useCallback(async () => {
    const [t, p] = await Promise.all([
      taskListForDate(date),
      tab === 'today' ? dayPlanningStatus(today, tomorrow, currentHour()) : Promise.resolve(null),
    ]);
    setTasks(t);
    if (tab === 'today') setPlanning(p as DayPlanningStatus);
  }, [date, tab, today, tomorrow]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    playClick();
    await taskCreate({
      title: newTitle.trim(),
      planned_for: date,
      estimated_minutes: newMinutes ? parseInt(newMinutes) : undefined,
      is_main_quest: newMainQuest,
    });
    setNewTitle('');
    setNewMinutes('');
    setNewMainQuest(false);
    setShowAdd(false);
    await refresh();
  };

  const handleToggle = async (task: Task) => {
    if (task.status === 'done') {
      playClick();
      await taskReopen(task.id);
    } else {
      playComplete();
      await taskMarkDone(task.id);
    }
    await refresh();
  };

  const handleToggleMainQuest = async (task: Task) => {
    playClick();
    await taskUpdate({ id: task.id, is_main_quest: !task.is_main_quest });
    await refresh();
  };

  const handleDelete = async (task_id: string) => {
    playClick();
    await taskDelete(task_id);
    await refresh();
  };

  const planned = tasks.filter(t => t.status === 'planned');
  const done = tasks.filter(t => t.status === 'done');

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-zinc-200">quests</h1>
        <button
          onClick={() => { playClick(); setShowAdd(true); }}
          className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.05] btn-glow-orange"
          style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)' }}
        >
          + add
        </button>
      </div>

      {/* Tab */}
      <div className="flex gap-1 mb-6 bg-black/30 rounded-xl p-1 border border-white/5">
        {(['today', 'tomorrow'] as Tab[]).map(t => (
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

      {/* Add form */}
      {showAdd && (
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-4 mb-4">
          <input
            autoFocus
            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-orange-500/60 transition-colors"
            placeholder="quest title..."
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <div className="flex gap-2 mb-3">
            <input
              type="number"
              className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 transition-colors"
              placeholder="minutes (optional)"
              value={newMinutes}
              onChange={e => setNewMinutes(e.target.value)}
            />
            <button
              onClick={() => { playClick(); setNewMainQuest(!newMainQuest); }}
              className={`px-3 py-2 rounded-xl text-sm transition-all ${
                newMainQuest
                  ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300 card-glow-amber'
                  : 'bg-white/5 border border-white/10 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              ⭐ main quest
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] btn-glow-orange"
              style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)' }}
            >
              add quest
            </button>
            <button
              onClick={() => { playClick(); setShowAdd(false); }}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm transition-all"
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {/* Habits — today only, hardcoded */}
      {tab === 'today' && planning && (() => {
        const habits = [
          { label: '☀️ morning sunlight', done: planning.sunlight_done, onLog: () => logSunlight(today), activeColor: 'border-yellow-500 bg-yellow-500/20 text-yellow-400', hoverColor: 'hover:border-yellow-400 hover:bg-yellow-500/10' },
          { label: '💪 gym',              done: planning.gym_done,      onLog: () => logGym(today),      activeColor: 'border-emerald-500 bg-emerald-500/20 text-emerald-400', hoverColor: 'hover:border-emerald-400 hover:bg-emerald-500/10' },
          { label: '📚 read a book',      done: planning.book_done,     onLog: () => logBook(today),     activeColor: 'border-blue-500 bg-blue-500/20 text-blue-400',         hoverColor: 'hover:border-blue-400 hover:bg-blue-500/10' },
          { label: '🚶 go for a walk',    done: planning.walk_done,     onLog: () => logWalk(today),     activeColor: 'border-sky-500 bg-sky-500/20 text-sky-400',           hoverColor: 'hover:border-sky-400 hover:bg-sky-500/10' },
          { label: '🥗 no outside food',  done: planning.no_outside_food_done, onLog: () => logNoOutsideFood(today), activeColor: 'border-lime-500 bg-lime-500/20 text-lime-400', hoverColor: 'hover:border-lime-400 hover:bg-lime-500/10' },
        ];
        return (
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">habits</p>
            <div className="space-y-2">
              {habits.map(h => (
                <div key={h.label} className="flex items-center gap-3 bg-zinc-900/60 border border-white/5 rounded-2xl p-3.5">
                  <button
                    onClick={async () => { if (!h.done) { playSuccess(); await h.onLog(); await refresh(); } }}
                    disabled={h.done}
                    className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all text-xs ${h.done ? h.activeColor : `border-zinc-600 ${h.hoverColor}`}`}
                  >
                    {h.done && '✓'}
                  </button>
                  <div className="flex-1">
                    <p className="text-sm text-zinc-300">{h.label}</p>
                    {h.done && <p className="text-xs text-zinc-600 mt-0.5">logged today · +10 pts</p>}
                  </div>
                  {!h.done && <span className="text-xs text-zinc-600">+10 pts</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Empty state */}
      {planned.length === 0 && done.length === 0 && (
        <div className="text-center text-zinc-500 py-12">
          <p className="text-4xl mb-3">📋</p>
          <p>no quests yet. add one!</p>
        </div>
      )}

      {/* Planned tasks */}
      {planned.length > 0 && (
        <div className="space-y-2 mb-6">
          {planned.map(task => (
            <div key={task.id} className={`flex items-center gap-3 border rounded-2xl p-3.5 group transition-all card-hover ${
              task.is_main_quest
                ? 'bg-amber-500/5 border-amber-500/25 card-glow-amber'
                : 'bg-zinc-900/60 border-white/5 hover:border-white/10'
            }`}>
              <button
                onClick={() => handleToggle(task)}
                className="w-5 h-5 rounded border border-zinc-600 hover:border-emerald-400 hover:bg-emerald-500/10 flex items-center justify-center shrink-0 transition-all"
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${task.is_main_quest ? 'text-amber-300 font-medium' : 'text-zinc-200'}`}>
                  {task.is_main_quest && '⭐ '}{task.title}
                </p>
                {task.estimated_minutes && (
                  <p className="text-xs text-zinc-500 mt-0.5">~{task.estimated_minutes} min</p>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleToggleMainQuest(task)}
                  title={task.is_main_quest ? 'remove main quest' : 'set as main quest'}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all ${
                    task.is_main_quest ? 'text-amber-400 hover:bg-amber-500/20' : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/5'
                  }`}
                >
                  ⭐
                </button>
                <button
                  onClick={() => handleDelete(task.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Done tasks */}
      {done.length > 0 && (
        <div>
          <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2">completed</p>
          <div className="space-y-2">
            {done.map(task => (
              <div key={task.id} className="flex items-center gap-3 bg-zinc-900/30 border border-white/5 rounded-2xl p-3.5 opacity-50">
                <button
                  onClick={() => handleToggle(task)}
                  className="w-5 h-5 rounded border border-emerald-500 bg-emerald-500/20 flex items-center justify-center shrink-0 text-xs text-emerald-400"
                >
                  ✓
                </button>
                <p className="text-sm text-zinc-500 line-through truncate">{task.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
