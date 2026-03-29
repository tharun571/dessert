import { useState } from 'react';
import HomePage from './features/home/HomePage';
import TasksPage from './features/tasks/TasksPage';
import RewardsPage from './features/rewards/RewardsPage';
import InventoryPage from './features/inventory/InventoryPage';
import TimelinePage from './features/timeline/TimelinePage';
import SettingsPage from './features/settings/SettingsPage';
import AnalyticsPage from './features/analytics/AnalyticsPage';
import HabitsPage from './features/habits/HabitsPage';
import { playClick } from './lib/sounds';

type Page = 'home' | 'tasks' | 'habits' | 'rewards' | 'inventory' | 'timeline' | 'analytics' | 'settings';

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: 'home', label: 'home', icon: '🏠' },
  { id: 'tasks', label: 'quests', icon: '📋' },
  { id: 'habits', label: 'habits', icon: '🟢' },
  { id: 'rewards', label: 'desserts', icon: '🍨' },
  { id: 'inventory', label: 'inventory', icon: '🎒' },
  { id: 'timeline', label: 'timeline', icon: '📊' },
  { id: 'analytics', label: 'analytics', icon: '📈' },
  { id: 'settings', label: 'settings', icon: '⚙️' },
];

function App() {
  const [page, setPage] = useState<Page>('home');

  const navigate = (p: Page) => {
    playClick();
    setPage(p);
  };

  return (
    <div className="flex h-screen text-zinc-100 overflow-hidden" style={{ background: 'transparent' }}>
      {/* Sidebar */}
      <nav className="w-16 flex flex-col items-center py-4 shrink-0 border-r border-white/5"
        style={{ background: 'linear-gradient(180deg, #111 0%, #0d0a07 100%)' }}>
        <div className="text-2xl mb-4 select-none animate-bounce" style={{ animationDuration: '3s' }}>🍨</div>
        <div className="flex-1 w-full overflow-y-auto">
          <div className="flex flex-col items-center gap-1 pb-2">
            {NAV_ITEMS.map((item) => (
              <div key={item.id} className="relative group">
                <button
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => navigate(item.id)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all duration-200 ${
                    page === item.id
                      ? 'bg-orange-500/25 nav-active-glow ring-1 ring-orange-500/60 scale-105'
                      : 'hover:bg-white/5 text-zinc-500 hover:text-zinc-200 hover:scale-105'
                  }`}
                >
                  {item.icon}
                </button>
                {/* Tooltip */}
                <div className="absolute left-12 top-1/2 -translate-y-1/2 pointer-events-none z-50
                  opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <div className="bg-zinc-800 border border-white/10 text-zinc-200 text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-xl">
                    {item.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {page === 'home' && <HomePage onNavigate={navigate} />}
        {page === 'tasks' && <TasksPage />}
        {page === 'habits' && <HabitsPage />}
        {page === 'rewards' && <RewardsPage />}
        {page === 'inventory' && <InventoryPage />}
        {page === 'timeline' && <TimelinePage />}
        {page === 'analytics' && <AnalyticsPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

export default App;
