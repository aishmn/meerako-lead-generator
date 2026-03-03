import { Briefcase, LayoutDashboard, MapPin, PanelLeftClose, PanelLeftOpen, Settings, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useUiStore, type AppSection } from '@/stores/ui-store';
import { cn } from '@lib/utils';
import { Button } from './ui/button';

interface NavItem {
  id:    AppSection;
  label: string;
  icon:  LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',   label: 'Dashboard',        icon: LayoutDashboard },
  { id: 'find-leads',  label: 'Find Businesses',  icon: MapPin          },
  { id: 'my-leads',    label: 'My Leads',         icon: Briefcase       },
  { id: 'settings',   label: 'Settings',          icon: Settings        },
];

export const Sidebar = () => {
  const { section, setSection, sidebarCollapsed, toggleSidebar } = useUiStore();

  const leadsCountQuery = useQuery({
    queryKey: ['leads-count'],
    queryFn:  async () => {
      const result = await window.leadforge.leads.list({ pageSize: 1 });
      return result.total;
    },
    staleTime: 30_000,
  });

  const total = leadsCountQuery.data ?? 0;

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border bg-card p-3 transition-all duration-300',
        sidebarCollapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Brand */}
      <div className="mb-6 flex items-center justify-between px-2 pt-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="shrink-0 rounded-lg bg-primary/20 p-2 text-primary">
            <Target size={18} />
          </div>
          {!sidebarCollapsed && <span className="truncate font-semibold">Meerako Lead Generator</span>}
        </div>
        <Button variant="ghost" size="icon" onClick={toggleSidebar}>
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </Button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = section === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon size={16} className="shrink-0" />
              {!sidebarCollapsed && (
                <>
                  <span className="truncate">{label}</span>
                  {id === 'my-leads' && total > 0 && (
                    <span className="ml-auto rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
                      {total}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* OSM attribution */}
      {!sidebarCollapsed && (
        <p className="mt-4 px-2 text-[10px] text-muted-foreground/60">
          Data © OpenStreetMap contributors
        </p>
      )}
    </aside>
  );
};
