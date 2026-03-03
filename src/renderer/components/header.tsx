import { Search, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useUiStore } from '@/stores/ui-store';
import { Button } from './ui/button';

export const Header = () => {
  const { setGlobalSearchOpen, setQuickAddOpen } = useUiStore();

  const { data: settings } = useQuery({
    queryKey: ['settings', 'company-name'],
    queryFn: () => window.leadforge.settings.get()
  });

  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-6">
      <div>
        <h1 className="text-lg font-semibold">{settings?.general.appName || 'Meerako Lead Generator'}</h1>
        <p className="text-xs text-muted-foreground">Location-based lead discovery — OpenStreetMap powered</p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => setGlobalSearchOpen(true)}>
          <Search className="mr-2 h-4 w-4" />
          Search (Ctrl/Cmd + K)
        </Button>
        <Button onClick={() => setQuickAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Quick Add (Ctrl/Cmd + N)
        </Button>
      </div>
    </header>
  );
};
