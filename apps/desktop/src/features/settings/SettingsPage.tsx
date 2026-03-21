import { useEffect, useState, useCallback } from 'react';
import { rulesGetAll } from '../../lib/api';
import type { AllRules } from '../../lib/types';
import { playClick } from '../../lib/sounds';

const CATEGORY_COLORS: Record<string, string> = {
  positive: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  neutral:  'text-zinc-400 bg-zinc-700/20 border-zinc-700/30',
  negative: 'text-red-400 bg-red-500/10 border-red-500/20',
};

export default function SettingsPage() {
  const [rules, setRules] = useState<AllRules | null>(null);
  const [activeTab, setActiveTab] = useState<'apps' | 'sites'>('apps');

  const refresh = useCallback(async () => {
    const r = await rulesGetAll();
    setRules(r);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-zinc-200 mb-6">settings</h1>

      {/* Rules tabs */}
      <div className="flex gap-1 mb-4 bg-black/30 rounded-xl p-1 border border-white/5">
        {(['apps', 'sites'] as const).map(t => (
          <button
            key={t}
            onClick={() => { playClick(); setActiveTab(t); }}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
              activeTab === t
                ? 'bg-zinc-700/80 text-zinc-100 ring-1 ring-white/10'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t === 'apps' ? 'app rules' : 'site rules'}
          </button>
        ))}
      </div>

      {rules && activeTab === 'apps' && (
        <div className="space-y-2">
          {rules.app_rules.map(rule => (
            <div key={rule.id} className="flex items-center justify-between bg-zinc-900/60 border border-white/5 rounded-2xl p-3">
              <div>
                <p className="text-sm text-zinc-200">{rule.label}</p>
                <p className="text-xs text-zinc-600">{rule.matcher_type}: {rule.matcher_value}</p>
              </div>
              <div className="flex items-center gap-2">
                {rule.points_per_minute > 0 && (
                  <span className="text-xs text-emerald-400">+{rule.points_per_minute}/min</span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[rule.category]}`}>
                  {rule.category}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {rules && activeTab === 'sites' && (
        <div className="space-y-2">
          {rules.site_rules.map(rule => (
            <div key={rule.id} className="flex items-center justify-between bg-zinc-900/60 border border-white/5 rounded-2xl p-3">
              <div>
                <p className="text-sm text-zinc-200">{rule.label}</p>
                <p className="text-xs text-zinc-600">{rule.domain}</p>
                {rule.category === 'negative' && (
                  <p className="text-xs text-zinc-600 mt-0.5">
                    grace: {rule.grace_seconds}s · penalty: {rule.penalty_per_minute_session}/min session
                  </p>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[rule.category]}`}>
                {rule.category}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Scoring reference */}
      <div className="mt-8 bg-zinc-900/60 border border-white/5 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">scoring reference</h2>
        <div className="space-y-1.5 text-sm text-zinc-400">
          <div className="flex justify-between"><span>start session</span><span className="text-emerald-400">+5</span></div>
          <div className="flex justify-between"><span>productive app (per min)</span><span className="text-emerald-400">+1</span></div>
          <div className="flex justify-between"><span>25min combo</span><span className="text-emerald-400">+5</span></div>
          <div className="flex justify-between"><span>complete task</span><span className="text-emerald-400">+15</span></div>
          <div className="flex justify-between"><span>complete main quest</span><span className="text-amber-400">+25</span></div>
          <div className="flex justify-between"><span>clean session bonus</span><span className="text-emerald-400">+10</span></div>
          <div className="flex justify-between"><span>recovery bonus</span><span className="text-emerald-400">+5</span></div>
          <div className="flex justify-between"><span>X/YT drift (per min, in session)</span><span className="text-red-400">−3</span></div>
          <div className="flex justify-between"><span>X/YT drift (per min, ambient)</span><span className="text-red-400">−1</span></div>
        </div>
      </div>
    </div>
  );
}
