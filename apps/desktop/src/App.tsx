import { useState } from 'react';
import HomePage from './features/home/HomePage';
import SessionView from './features/sessions/SessionView';
import TasksPage from './features/tasks/TasksPage';
import RewardsPage from './features/rewards/RewardsPage';
import TimelinePage from './features/timeline/TimelinePage';
import SettingsPage from './features/settings/SettingsPage';
import { playClick } from './lib/sounds';

type Page = 'home' | 'session' | 'tasks' | 'rewards' | 'timeline' | 'settings';

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: 'home', label: 'home', icon: '🏠' },
  { id: 'session', label: 'session', icon: '⚡' },
  { id: 'tasks', label: 'quests', icon: '📋' },
  { id: 'rewards', label: 'shop', icon: '🍨' },
  { id: 'timeline', label: 'timeline', icon: '📊' },
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
      <nav className="w-16 flex flex-col items-center py-4 gap-1 shrink-0 border-r border-white/5"
        style={{ background: 'linear-gradient(180deg, #111 0%, #0d0a07 100%)' }}>
        <div className="text-2xl mb-4 select-none animate-bounce" style={{ animationDuration: '3s' }}>🍨</div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(item.id)}
            title={item.label}
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all duration-200 ${
              page === item.id
                ? 'bg-orange-500/25 nav-active-glow ring-1 ring-orange-500/60 scale-105'
                : 'hover:bg-white/5 text-zinc-500 hover:text-zinc-200 hover:scale-105'
            }`}
          >
            {item.icon}
          </button>
        ))}
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {page === 'home' && <HomePage onNavigate={navigate} />}
        {page === 'session' && <SessionView />}
        {page === 'tasks' && <TasksPage />}
        {page === 'rewards' && <RewardsPage />}
        {page === 'timeline' && <TimelinePage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

export default App;
