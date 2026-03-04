import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUiStore } from './stores/ui-store';
import { Sidebar } from './components/sidebar';
import { Header } from './components/header';
import { QuickAddLeadSheet } from './components/quick-add-lead-sheet';
import { GlobalSearchDialog } from './components/global-search-dialog';
import { LeadDetailDrawer } from './components/lead-detail-drawer';
import { ErrorBoundary } from './components/error-boundary';
import { DashboardPage } from './pages/dashboard-page';
import { FindLeadsPage } from './pages/find-leads-page';
import { MyLeadsPage } from './pages/my-leads-page';
import { SettingsPage } from './pages/settings-page';

const sectionToPage = {
  dashboard:   DashboardPage,
  'find-leads': FindLeadsPage,
  'my-leads':   MyLeadsPage,
  settings:     SettingsPage,
} as const;

type Section = keyof typeof sectionToPage;

export default function App() {
  const { section, setGlobalSearchOpen, setQuickAddOpen } = useUiStore();

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn:  () => window.leadforge.settings.get(),
  });

  useEffect(() => {
    const theme = settingsQuery.data?.general.theme ?? 'dark';
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [settingsQuery.data?.general.theme]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key.toLowerCase() === 'k') { e.preventDefault(); setGlobalSearchOpen(true); }
      if (isMeta && e.key.toLowerCase() === 'n') { e.preventDefault(); setQuickAddOpen(true); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setGlobalSearchOpen, setQuickAddOpen]);

  const ActivePage = sectionToPage[section as Section] ?? DashboardPage;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="min-w-0 flex-1 overflow-auto">
          <ErrorBoundary section={section}>
            <ActivePage />
          </ErrorBoundary>
        </main>
      </div>
      <QuickAddLeadSheet />
      <GlobalSearchDialog />
      <LeadDetailDrawer />
    </div>
  );
}
