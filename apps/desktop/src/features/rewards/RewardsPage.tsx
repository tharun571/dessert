import { useEffect, useState, useCallback } from 'react';
import {
  rewardList, rewardCreate, rewardPurchase, inventoryListAvailable, inventoryConsume, sessionGetCurrent,
} from '../../lib/api';
import type { Reward, InventoryItem, Session } from '../../lib/types';
import { playClick, playPurchase, playSuccess } from '../../lib/sounds';

const SCOPE_EMOJI: Record<string, string> = {
  x: '𝕏',
  youtube: '▶',
  linkedin: 'in',
  none: '',
};

export default function RewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [flash, setFlash] = useState('');

  const [newName, setNewName] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [newEndsSession, setNewEndsSession] = useState(true);
  const [newScope, setNewScope] = useState('none');

  const refresh = useCallback(async () => {
    const [r, inv, s] = await Promise.all([rewardList(), inventoryListAvailable(), sessionGetCurrent()]);
    setRewards(r);
    setInventory(inv);
    setSession(s);
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

  const handleConsume = async (item: InventoryItem) => {
    await inventoryConsume(item.id, session?.id);
    playSuccess();
    showFlash(`✨ enjoy your ${item.reward_name}!`);
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
    setNewName('');
    setNewCost('');
    setNewDuration('');
    setNewEndsSession(true);
    setNewScope('none');
    setShowAdd(false);
    await refresh();
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-zinc-200">reward shop</h1>
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

      {/* Inventory */}
      {inventory.length > 0 && (
        <div className="mb-6">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">inventory</p>
          <div className="grid grid-cols-2 gap-2">
            {inventory.map(item => (
              <button
                key={item.id}
                onClick={() => handleConsume(item)}
                className="flex items-center justify-between bg-violet-500/10 border border-violet-500/25 rounded-xl p-3.5 hover:bg-violet-500/20 hover:border-violet-500/40 transition-all card-hover card-glow-violet"
              >
                <span className="text-sm text-violet-300">{item.reward_name}</span>
                <span className="text-xs text-violet-500">use →</span>
              </button>
            ))}
          </div>
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
        {rewards.map(reward => (
          <div key={reward.id} className="flex items-center justify-between bg-zinc-900/60 border border-white/5 hover:border-white/10 rounded-2xl p-4 group transition-all card-hover">
            <div>
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
            <button
              onClick={() => handleBuy(reward)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition-all hover:scale-[1.05] btn-glow-orange"
              style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.2) 0%, rgba(251,146,60,0.2) 100%)', border: '1px solid rgba(249,115,22,0.35)' }}
            >
              <span className="font-mono font-bold text-orange-300">{reward.cost}</span>
              <span className="text-orange-500 text-xs">pt</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
