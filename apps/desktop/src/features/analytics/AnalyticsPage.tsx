import { useCallback, useEffect, useState } from 'react';
import { analyticsGetDashboard } from '../../lib/api';
import type { AnalyticsDashboard, AnalyticsDayPoint } from '../../lib/types';

function localTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDuration(ms: number): string {
  const totalMins = Math.floor(ms / 60_000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function dayWeekLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString([], {
    weekday: 'short',
  });
}

function dayNumLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString([], {
    day: 'numeric',
  });
}

function MetricTrend({
  title,
  colorClass,
  negativeColorClass,
  points,
  valueFn,
  formatFn,
  signed = false,
}: {
  title: string;
  colorClass: string;
  negativeColorClass?: string;
  points: AnalyticsDayPoint[];
  valueFn: (point: AnalyticsDayPoint) => number;
  formatFn: (value: number) => string;
  signed?: boolean;
}) {
  const values = points.map(valueFn);
  const max = Math.max(...values, 1);
  const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 1);

  return (
    <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-4">
      <p className="text-sm font-semibold text-zinc-200 mb-3">{title}</p>
      <div className="grid grid-cols-7 gap-2">
        {points.map((point) => {
          const value = valueFn(point);
          const unsignedHeightPct = `${Math.max(8, Math.round((value / max) * 100))}%`;
          const signedHalfHeightPct = `${Math.max(6, Math.round((Math.abs(value) / maxAbs) * 50))}%`;
          return (
            <div key={`${title}-${point.date}`} className="text-center">
              <p className="text-[10px] text-zinc-300 font-mono mb-1 truncate" title={`${dayLabel(point.date)} — ${formatFn(value)}`}>
                {formatFn(value)}
              </p>
              {signed ? (
                <div className="relative h-24 rounded-lg bg-zinc-800/70 overflow-hidden border border-white/5">
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-zinc-600/80 -translate-y-1/2" />
                  {value > 0 && (
                    <div
                      className={`absolute left-[20%] right-[20%] bottom-1/2 rounded-t-md ${colorClass}`}
                      style={{
                        height: signedHalfHeightPct,
                      }}
                    />
                  )}
                  {value < 0 && (
                    <div
                      className={`absolute left-[20%] right-[20%] top-1/2 rounded-b-md ${negativeColorClass ?? 'bg-rose-500'}`}
                      style={{
                        height: signedHalfHeightPct,
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="relative h-24 rounded-lg bg-zinc-800/70 overflow-hidden border border-white/5">
                  <div
                    className={`absolute left-[20%] right-[20%] bottom-0 rounded-t-md ${colorClass}`}
                    style={{ height: unsignedHeightPct }}
                  />
                </div>
              )}
              <p className="text-[10px] text-zinc-500 mt-1 leading-none">{dayWeekLabel(point.date)}</p>
              <p className="text-[10px] text-zinc-600 leading-none mt-0.5">{dayNumLabel(point.date)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await analyticsGetDashboard(localTodayDate(), 7);
      setDashboard(data);
      setLastRefreshedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setError('');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);

    const onFocus = () => { refresh(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refresh]);

  if (loading) return <div className="flex items-center justify-center h-full text-zinc-500">loading...</div>;

  if (error) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-red-900/30 border border-red-500/40 rounded-xl p-3 text-sm text-red-300">{error}</div>
      </div>
    );
  }

  if (!dashboard) return null;

  const daywise = dashboard.daywise;
  const today = dashboard.today_summary;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-end justify-between mb-4">
        <h1 className="text-xl font-bold text-zinc-200">analytics</h1>
        <p className="text-xs text-zinc-500">{lastRefreshedAt ? `refreshing automatically · updated ${lastRefreshedAt}` : 'refreshing automatically'}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-3 text-center">
          <p className="text-lg font-bold text-blue-400 tabular-nums">{formatDuration(today.work_ms)}</p>
          <p className="text-xs text-zinc-500 mt-0.5">today work hours</p>
        </div>
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-3 text-center">
          <p className="text-lg font-bold text-orange-400 tabular-nums">{today.sessions_started}</p>
          <p className="text-xs text-zinc-500 mt-0.5">today sessions</p>
        </div>
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-3 text-center">
          <p className="text-lg font-bold text-emerald-400 tabular-nums">+{today.points_earned}</p>
          <p className="text-xs text-zinc-500 mt-0.5">today earned</p>
        </div>
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-3 text-center">
          <p className="text-lg font-bold text-cyan-400 tabular-nums">{today.quests_completed}</p>
          <p className="text-xs text-zinc-500 mt-0.5">today quests completed</p>
        </div>
      </div>

      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">last 7 days from today</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <MetricTrend
          title="work hours — day by day"
          colorClass="bg-blue-500"
          points={daywise}
          valueFn={(point) => point.work_ms}
          formatFn={(value) => formatDuration(value)}
        />
        <MetricTrend
          title="sessions — day by day"
          colorClass="bg-orange-500"
          points={daywise}
          valueFn={(point) => point.sessions_started}
          formatFn={(value) => `${value}`}
        />
        <MetricTrend
          title="points earned — day by day"
          colorClass="bg-emerald-500"
          points={daywise}
          valueFn={(point) => point.points_earned}
          formatFn={(value) => `+${value}`}
        />
        <MetricTrend
          title="quests completed — day by day"
          colorClass="bg-cyan-500"
          points={daywise}
          valueFn={(point) => point.quests_completed}
          formatFn={(value) => `${value}`}
        />
        <div className="md:col-span-2">
          <MetricTrend
            title="net points (earned - spent) — day by day"
            colorClass="bg-emerald-500"
            negativeColorClass="bg-rose-500"
            points={daywise}
            valueFn={(point) => point.points_earned - point.points_spent}
            formatFn={(value) => `${value > 0 ? '+' : ''}${value}`}
            signed
          />
        </div>
      </div>
    </div>
  );
}
