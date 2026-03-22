import { useEffect, useState } from 'react';
import type { Session, SessionEndStats } from '../../lib/types';

interface Props {
  session: Session;
  stats: SessionEndStats;
  onDismiss: () => void;
}

function formatMs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const COLORS = [
  '#f97316', '#fb923c', '#fbbf24', '#34d399', '#60a5fa',
  '#a78bfa', '#f472b6', '#facc15', '#4ade80', '#38bdf8',
];

function Confetti() {
  const [particles] = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 2.5 + Math.random() * 1.5,
      color: COLORS[i % COLORS.length],
      size: 6 + Math.random() * 8,
      sway: (Math.random() - 0.5) * 60,
      rotate: Math.random() * 360,
    }))
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: '-20px',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.id % 3 === 0 ? '50%' : '2px',
            animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
            '--sway': `${p.sway}px`,
            '--rotate': `${p.rotate}deg`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export default function SessionEndOverlay({ session, stats, onDismiss }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 400); }, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const record = stats.is_longest_ever ? 'ever'
    : stats.is_longest_week ? 'week'
    : stats.is_longest_today ? 'today'
    : null;

  const recordLabel: Record<string, string> = {
    ever: '🏆 longest session ever!',
    week: '🔥 longest session this week!',
    today: '⚡ longest session today!',
  };

  return (
    <div
      onClick={() => { setVisible(false); setTimeout(onDismiss, 400); }}
      className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
      style={{
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s ease',
      }}
    >
      <Confetti />

      <div
        onClick={e => e.stopPropagation()}
        className="relative z-10 bg-zinc-900/95 border border-white/10 rounded-3xl p-8 max-w-sm w-full mx-6 text-center shadow-2xl"
        style={{
          transform: visible ? 'scale(1)' : 'scale(0.95)',
          transition: 'transform 0.4s ease',
          boxShadow: '0 0 60px rgba(249,115,22,0.2)',
        }}
      >
        <div className="text-5xl mb-3">🎉</div>
        <h2 className="text-xl font-bold text-zinc-100 mb-1">session complete!</h2>

        {record && (
          <div className="inline-flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/30 rounded-full px-3 py-1 text-sm text-amber-300 font-semibold mb-4">
            {recordLabel[record]}
          </div>
        )}

        <div className="flex gap-3 mt-4 justify-center">
          <div className="bg-black/30 rounded-2xl p-4 flex-1">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">duration</p>
            <p className="text-2xl font-bold text-gradient-orange tabular-nums">
              {formatMs(stats.duration_ms)}
            </p>
          </div>
          <div className="bg-black/30 rounded-2xl p-4 flex-1">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">score</p>
            <p className={`text-2xl font-bold tabular-nums ${session.score_total >= 0 ? 'text-gradient-score-pos' : 'text-red-400'}`}>
              {session.score_total >= 0 ? '+' : ''}{session.score_total}
            </p>
          </div>
        </div>

        <p className="text-xs text-zinc-600 mt-4">tap anywhere to dismiss</p>
      </div>
    </div>
  );
}
