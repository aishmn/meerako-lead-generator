import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useUiStore } from '@/stores/ui-store';
import { useDebounce } from '@/hooks/use-debounce';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Input } from './ui/input';
import { Button } from './ui/button';

export const GlobalSearchDialog = () => {
  const { globalSearchOpen, setGlobalSearchOpen, setSection, setSelectedLeadId } = useUiStore();
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 300);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['global-search', debounced],
    enabled:  globalSearchOpen && debounced.trim().length > 1,
    queryFn:  () => window.leadforge.leads.searchGlobal(debounced),
  });

  return (
    <Sheet open={globalSearchOpen} onOpenChange={setGlobalSearchOpen}>
      <SheetContent className="w-[560px]" side="right">
        <SheetHeader>
          <SheetTitle>Global Search</SheetTitle>
          <p className="text-sm text-muted-foreground">Search by name, city, phone, email, or website.</p>
        </SheetHeader>

        <div className="relative mb-3 mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search leads…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          {isFetching && <p className="text-sm text-muted-foreground">Searching…</p>}
          {!isFetching && debounced && results.length === 0 && (
            <p className="text-sm text-muted-foreground">No leads found.</p>
          )}
          {results.map((lead) => (
            <button
              key={lead.id}
              type="button"
              className="w-full rounded-md border border-border p-3 text-left hover:bg-muted"
              onClick={() => {
                setSection('my-leads');
                setSelectedLeadId(lead.id);
                setGlobalSearchOpen(false);
                setQuery('');
              }}
            >
              <p className="font-medium">{lead.name}</p>
              <p className="text-sm text-muted-foreground">
                {[lead.category?.replace(/_/g, ' '), lead.city, lead.phone].filter(Boolean).join(' · ')}
              </p>
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={() => { setGlobalSearchOpen(false); setQuery(''); }}>Close</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
