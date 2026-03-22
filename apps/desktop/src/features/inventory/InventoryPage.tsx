import { useEffect, useState, useCallback } from 'react';
import { inventoryListAvailable, inventoryListConsumed, sessionGetCurrent, inventoryConsume } from '../../lib/api';
import type { InventoryItem, Session } from '../../lib/types';
import { playSuccess } from '../../lib/sounds';

export default function InventoryPage() {
  const [available, setAvailable] = useState<InventoryItem[]>([]);
  const [consumed, setConsumed] = useState<InventoryItem[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [flash, setFlash] = useState('');

  const refresh = useCallback(async () => {
    const [avail, used, s] = await Promise.all([
      inventoryListAvailable(),
      inventoryListConsumed(),
      sessionGetCurrent(),
    ]);
    setAvailable(avail);
    setConsumed(used);
    setSession(s);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 3000);
  };

  const handleConsume = async (item: InventoryItem) => {
    playSuccess();
    await inventoryConsume(item.id, session?.id);
    showFlash(`✨ enjoy your ${item.reward_name}!`);
    await refresh();
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-zinc-200 mb-6">inventory</h1>

      {flash && (
        <div className="bg-emerald-900/20 border border-emerald-500/25 rounded-2xl p-3 mb-4 text-sm text-emerald-300">
          {flash}
        </div>
      )}

      {/* Available */}
      {available.length === 0 && consumed.length === 0 ? (
        <div className="text-center text-zinc-500 py-12">
          <p className="text-4xl mb-3">🎒</p>
          <p>no items in inventory.</p>
          <p className="text-xs mt-1">buy rewards from the shop to fill it up.</p>
        </div>
      ) : (
        <>
          {available.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">available</p>
              <div className="space-y-2">
                {available.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between bg-violet-500/10 border border-violet-500/25 rounded-2xl p-4 card-glow-violet"
                  >
                    <div>
                      <p className="text-sm font-medium text-violet-200">{item.reward_name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {item.reward_cost} pts · bought {new Date(item.purchased_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleConsume(item)}
                      className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.05]"
                      style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.3) 0%, rgba(167,139,250,0.3) 100%)', border: '1px solid rgba(139,92,246,0.4)' }}
                    >
                      <span className="text-violet-300">use →</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {consumed.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">used</p>
              <div className="space-y-2">
                {consumed.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between bg-zinc-800/40 border border-white/5 rounded-2xl p-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-400">{item.reward_name}</p>
                      <p className="text-xs text-zinc-600 mt-0.5">
                        {item.reward_cost} pts · used {item.consumed_at ? new Date(item.consumed_at).toLocaleDateString() : '—'}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-600">✓ used</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
