import { useEffect, useState, useCallback } from 'react';
import {
  rewardList, rewardCreate, rewardPurchase, rewardUpdate, rewardDelete,
  sessionGetCurrent, scoreGetOverall,
} from '../../lib/api';
import type { Reward, Session, OverallScore } from '../../lib/types';
import { playClick, playPurchase } from '../../lib/sounds';

const SCOPE_EMOJI: Record<string, string> = {
  x: '𝕏',
  youtube: '▶',
  linkedin: 'in',
  none: '',
};

interface EditState {
  id: string;
  name: string;
  cost: string;
  endsSession: boolean;
}

export default function RewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [overall, setOverall] = useState<OverallScore | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [flash, setFlash] = useState('');
  const [editing, setEditing] = useState<EditState | null>(null);

  const [newName, setNewName] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [newEndsSession, setNewEndsSession] = useState(true);
  const [newScope, setNewScope] = useState('none');

  const refresh = useCallback(async () => {
    const [r, s, o] = await Promise.all([rewardList(), sessionGetCurrent(), scoreGetOverall()]);
    setRewards(r);
    setSession(s);
    setOverall(o);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 3000);
  };

  const handleBuy = async (reward: Reward) => {
    await rewardPurchase(reward.id, session?.id);
    playPurchase();
    showFlash(`🎉 ${reward.name} added to inventory!`);
    await refresh();
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newCost) return;
    playClick();
    await rewardCreate({
      name: newName.trim(),
      cost: parseInt(newCost),
      duration_minutes: newDuration ? parseInt(newDuration) : undefined,
      ends_session_on_consume: newEndsSession,
      suppresses_scope: newScope,
    });
    setNewName(''); setNewCost(''); setNewDuration(''); setNewEndsSession(true); setNewScope('none');
    setShowAdd(false);
    await refresh();
  };

  const startEdit = (reward: Reward) => {
    playClick();
    setEditing({ id: reward.id, name: reward.name, cost: String(reward.cost), endsSession: reward.ends_session_on_consume });
  };

  const handleSaveEdit = async () => {
    if (!editing || !editing.name.trim() || !editing.cost) return;
    playClick();
    await rewardUpdate({ id: editing.id, name: editing.name.trim(), cost: parseInt(editing.cost), ends_session_on_consume: editing.endsSession });
    setEditing(null);
    await refresh();
  };

  const handleDelete = async (reward: Reward) => {
    playClick();
    await rewardDelete(reward.id);
    showFlash(`${reward.name} removed.`);
    await refresh();
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-200">desserts</h1>
          {overall !== null && (
            <p className="text-sm text-orange-400 font-mono mt-0.5">⚡ {overall.total} pts available</p>
          )}
        </div>
        <button
          onClick={() => { playClick(); setShowAdd(true); }}
          className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.05]"
          style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)' }}
        >
          + custom
        </button>
      </div>

      {flash && (
        <div className="bg-emerald-900/20 border border-emerald-500/25 rounded-2xl p-3 mb-4 text-sm text-emerald-300">
          {flash}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">custom reward</h2>
          <input
            autoFocus
            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-orange-500/60 transition-colors"
            placeholder="reward name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2 mb-3">
            <input
              type="number"
              className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 transition-colors"
              placeholder="cost in points"
              value={newCost}
              onChange={e => setNewCost(e.target.value)}
            />
            <input
              type="number"
              className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 transition-colors"
              placeholder="duration (min, optional)"
              value={newDuration}
              onChange={e => setNewDuration(e.target.value)}
            />
          </div>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => { playClick(); setNewEndsSession(!newEndsSession); }}
              className={`flex-1 py-2 rounded-xl text-sm transition-all ${
                newEndsSession
                  ? 'bg-red-500/15 border border-red-500/35 text-red-300'
                  : 'bg-white/5 border border-white/10 text-zinc-400'
              }`}
            >
              {newEndsSession ? '⏹ ends session' : 'no session end'}
            </button>
            <select
              className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500/60 transition-colors"
              value={newScope}
              onChange={e => setNewScope(e.target.value)}
            >
              <option value="none">no suppression</option>
              <option value="x">suppress X</option>
              <option value="youtube">suppress YouTube</option>
              <option value="linkedin">suppress LinkedIn</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)' }}
            >
              add reward
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

      {/* Reward list */}
      <div className="space-y-2">
        {rewards.map(reward => {
          const canAfford = overall === null || overall.total >= reward.cost;
          const isEditing = editing?.id === reward.id;

          if (isEditing) {
            return (
              <div key={reward.id} className="bg-zinc-900/80 border border-orange-500/30 rounded-2xl p-4">
                <input
                  autoFocus
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm mb-2 focus:outline-none focus:border-orange-500/60 transition-colors"
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  placeholder="reward name"
                />
                <div className="flex gap-2 mb-2">
                  <input
                    type="number"
                    className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500/60 transition-colors"
                    value={editing.cost}
                    onChange={e => setEditing({ ...editing, cost: e.target.value })}
                    placeholder="cost in points"
                  />
                  <button
                    onClick={() => setEditing({ ...editing, endsSession: !editing.endsSession })}
                    className={`flex-1 py-2 rounded-xl text-sm transition-all ${
                      editing.endsSession
                        ? 'bg-red-500/15 border border-red-500/35 text-red-300'
                        : 'bg-white/5 border border-white/10 text-zinc-400'
                    }`}
                  >
                    {editing.endsSession ? '⏹ ends session' : 'no session end'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
                    style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)' }}
                  >
                    save
                  </button>
                  <button
                    onClick={() => { playClick(); setEditing(null); }}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm transition-all"
                  >
                    cancel
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={reward.id} className={`flex items-center justify-between bg-zinc-900/60 border rounded-2xl p-4 group transition-all card-hover ${canAfford ? 'border-white/5 hover:border-white/10' : 'border-white/5 opacity-50'}`}>
              <div className="flex-1 min-w-0 mr-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-zinc-200">{reward.name}</p>
                  {reward.suppresses_scope && reward.suppresses_scope !== 'none' && (
                    <span className="text-xs bg-white/5 text-zinc-400 px-1.5 py-0.5 rounded-lg border border-white/10">
                      {SCOPE_EMOJI[reward.suppresses_scope]} break
                    </span>
                  )}
                  {reward.duration_minutes && (
                    <span className="text-xs text-zinc-600">{reward.duration_minutes}min</span>
                  )}
                </div>
                {reward.ends_session_on_consume && (
                  <p className="text-xs text-zinc-600 mt-0.5">ends session on use</p>
                )}
              </div>

              {/* Edit / delete — visible on hover */}
              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity mr-2">
                <button
                  onClick={() => startEdit(reward)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm text-zinc-500 hover:text-zinc-200 hover:bg-white/8 transition-all"
                  title="edit"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDelete(reward)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="delete"
                >
                  ×
                </button>
              </div>

              <button
                onClick={() => canAfford && handleBuy(reward)}
                disabled={!canAfford}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition-all shrink-0 ${canAfford ? 'hover:scale-[1.05] btn-glow-orange' : 'cursor-not-allowed'}`}
                style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.2) 0%, rgba(251,146,60,0.2) 100%)', border: '1px solid rgba(249,115,22,0.35)' }}
              >
                <span className="font-mono font-bold text-orange-300">{reward.cost}</span>
                <span className="text-orange-500 text-xs">pt</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
