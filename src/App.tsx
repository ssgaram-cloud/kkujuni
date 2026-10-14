import { useEffect } from 'react';
import { Brand, SyncPill } from './components/bits';
import { Icon } from './components/Icon';
import { StopSheet } from './components/StopSheet';
import { TimerBar } from './components/TimerBar';
import { ToastProvider, useRoute } from './components/ui';
import { useSettings } from './lib/hooks';
import { Home } from './pages/Home';
import { NoteDetail, NoteEditor, NotesList } from './pages/Notes';
import { Progress, SubjectProgress } from './pages/Progress';
import { Records } from './pages/Records';
import { SettingsPage } from './pages/Settings';
import { Stats } from './pages/Stats';

const NAV = [
  { id: 'home', name: '기록', icon: 'timer' },
  { id: 'progress', name: '진도', icon: 'bookmark', wideName: '진도 노트' },
  { id: 'stats', name: '통계', icon: 'chart' },
  { id: 'notes', name: '오답노트', icon: 'note' },
  { id: 'records', name: '기록 관리', icon: 'list', wideOnly: true },
  { id: 'settings', name: '설정', icon: 'gear' }
];

function Page({ route }: { route: string[] }) {
  const [a, b, c] = route;
  switch (a) {
    case 'progress':
      return b ? <SubjectProgress id={b} /> : <Progress />;
    case 'stats':
      return <Stats />;
    case 'notes':
      if (b === 'new') return <NoteEditor />;
      if (b === 'due') return <NotesList dueOnly />;
      if (b && c === 'edit') return <NoteEditor id={b} />;
      if (b) return <NoteDetail id={b} />;
      return <NotesList />;
    case 'records':
      return <Records date={b} openId={c} />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <Home />;
  }
}

function Shell() {
  const route = useRoute();
  const settings = useSettings();
  const cur = route[0] || 'home';

  useEffect(() => {
    const el = document.documentElement;
    if (settings.theme === 'system') delete el.dataset.theme;
    else el.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    document.querySelector('.main')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [route.join('/')]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="side-brand">
          <Brand size={36} />
          <span className="muted xsmall">세무사 1차 공부관리</span>
        </div>
        <nav className="side-nav" aria-label="메뉴">
          {NAV.map((n) => (
            <a key={n.id} href={'#/' + n.id} className={cur === n.id ? 'on' : ''} aria-current={cur === n.id ? 'page' : undefined}>
              <Icon name={n.icon} size={18} />
              {n.wideName || n.name}
            </a>
          ))}
        </nav>
        <div className="side-sync">
          <SyncPill long />
        </div>
      </aside>

      <div className="main-col">
        <main className="main" id="main">
          <Page route={route} />
        </main>
        <div className="bottom-stack">
          <TimerBar />
          <nav className="tabbar" aria-label="메뉴">
            {NAV.filter((n) => !n.wideOnly).map((n) => (
              <a key={n.id} href={'#/' + n.id} className={cur === n.id ? 'on' : ''} aria-current={cur === n.id ? 'page' : undefined}>
                <Icon name={n.icon} size={22} />
                {n.name}
              </a>
            ))}
          </nav>
        </div>
      </div>
      <StopSheet />
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
