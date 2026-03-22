import { useEffect, useState, useCallback } from 'react';
import { inventoryListAvailable, sessionGetCurrent } from '../../lib/api';
import type { InventoryItem, Session } from '../../lib/types';
import { playSuccess } from '../../lib/sounds';
import { inventoryConsume } from '../../lib/api';

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [flash, setFlash] = useState('');

  const refresh = useCallback(async () => {
    const [inv, s] = await Promise.all([inventoryListAvailable(), sessionGetCurrent()]);
    setInventory(inv);
    setSession(s);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 3000);
  };

  const handleConsume = async (item: InventoryItem) => {
    await inventoryConsume(item.id, session?.id);
    playSuccess();
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

      {inventory.length === 0 ? (
        <div className="text-center text-zinc-500 py-12">
          <p className="text-4xl mb-3">🎒</p>
          <p>no items in inventory.</p>
          <p className="text-xs mt-1">buy rewards from the shop to fill it up.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {inventory.map(item => (
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
      )}
    </div>
  );
}
