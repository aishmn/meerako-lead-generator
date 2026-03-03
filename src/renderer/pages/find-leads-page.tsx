import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2, MapPin, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { OsmSearchRequest, OsmSearchResult } from '@lib/types';

const RADIUS_OPTIONS = [
  { label: '500 m',  value: 500   },
  { label: '1 km',   value: 1000  },
  { label: '5 km',   value: 5000  },
  { label: '10 km',  value: 10000 },
  { label: '25 km',  value: 25000 },
  { label: '50 km',  value: 50000 },
];

export const FindLeadsPage = () => {
  const queryClient = useQueryClient();
  const [location,     setLocation]     = useState('');
  const [categories,   setCategories]   = useState<string[]>([]);
  const [radiusMeters, setRadiusMeters] = useState(5000);
  const [lastResult,   setLastResult]   = useState<OsmSearchResult | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['osm:categories'],
    queryFn:  () => window.leadforge.osm.categories(),
    staleTime: Infinity,
  });

  const availableCategories = categoriesQuery.data ?? [];

  const searchMutation = useMutation({
    mutationFn: (req: OsmSearchRequest) => window.leadforge.osm.search(req),
    onSuccess: (result) => {
      setLastResult(result);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      if (result.cached) {
        toast.info('Served from cache — same area was queried recently');
      } else if (result.inserted > 0) {
        toast.success(`${result.inserted} new leads added, ${result.skipped} duplicates skipped`);
      } else {
        toast.info(`No new leads found — ${result.skipped} already in database`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleCategory = (cat: string) =>
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );

  const handleSearch = () => {
    if (!location.trim()) { toast.error('Enter a city or location'); return; }
    if (!categories.length) { toast.error('Select at least one business type'); return; }
    searchMutation.mutate({ location: location.trim(), categories, radiusMeters });
  };

  return (
    <div className="grid h-full grid-cols-[320px_1fr] gap-4 p-6">
      {/* ── Search Panel ─────────────────────────────────────────────── */}
      <Card className="h-[calc(100vh-8rem)] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin size={16} /> Discover Businesses
          </CardTitle>
          <CardDescription>Free data via OpenStreetMap — no API key required.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Location input */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">City / Location</label>
            <Input
              placeholder="e.g. Berlin, Kathmandu, New York"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>

          {/* Radius selector */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Search radius</label>
            <div className="flex flex-wrap gap-1.5">
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRadiusMeters(opt.value)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    radiusMeters === opt.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Business type picker */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium">Business types</label>
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setCategories(availableCategories)}>All</button>
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => setCategories([])}>Clear</button>
              </div>
            </div>

            {categoriesQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {availableCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                      categories.includes(cat)
                        ? 'border-primary bg-primary/10 font-medium text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {categories.includes(cat) && <CheckCircle2 size={10} />}
                    {cat.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            )}

            {categories.length > 0 && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">{categories.length} selected</p>
            )}
          </div>

          <Button className="w-full" onClick={handleSearch} disabled={searchMutation.isPending}>
            {searchMutation.isPending
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Searching OSM…</>
              : <><Search className="mr-2 h-4 w-4" />Find Businesses</>}
          </Button>

          <p className="text-center text-[10px] text-muted-foreground">
            Powered by OpenStreetMap / Overpass API
          </p>
        </CardContent>
      </Card>

      {/* ── Results Panel ─────────────────────────────────────────────── */}
      <Card className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>Results</CardTitle>
          <CardDescription>
            Leads are saved directly to your database and deduplicated automatically.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col items-center justify-center overflow-auto">
          {/* Idle */}
          {!searchMutation.isPending && !lastResult && !searchMutation.isError && (
            <div className="flex flex-col items-center gap-3 text-center">
              <MapPin className="h-12 w-12 text-muted-foreground/40" />
              <h3 className="text-lg font-medium">Ready to discover</h3>
              <p className="max-w-xs text-sm text-muted-foreground">
                Enter a city, pick business categories, and LeadForge will
                query OpenStreetMap and import matching businesses.
              </p>
            </div>
          )}

          {/* Loading */}
          {searchMutation.isPending && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative">
                <MapPin className="h-12 w-12 text-primary/30" />
                <Loader2 className="absolute inset-0 m-auto h-6 w-6 animate-spin text-primary" />
              </div>
              <h3 className="font-medium">Querying OpenStreetMap…</h3>
              <p className="text-sm text-muted-foreground">May take a few seconds for large areas.</p>
            </div>
          )}

          {/* Error */}
          {searchMutation.isError && (
            <div className="flex flex-col items-center gap-3 text-center">
              <AlertCircle className="h-12 w-12 text-destructive/70" />
              <h3 className="font-medium text-destructive">Search failed</h3>
              <p className="text-sm text-muted-foreground">{(searchMutation.error as Error)?.message}</p>
              <Button variant="outline" onClick={handleSearch}>
                <RefreshCw size={14} className="mr-2" /> Retry
              </Button>
            </div>
          )}

          {/* Success */}
          {lastResult && !searchMutation.isPending && (
            <div className="w-full space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'New leads saved',     value: lastResult.inserted },
                  { label: 'Duplicates skipped',  value: lastResult.skipped  },
                  { label: 'Total found in area', value: lastResult.total    },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg border border-border bg-card p-4 text-center">
                    <p className="text-2xl font-bold text-primary">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

              {lastResult.cached && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
                  <RefreshCw size={14} /> Results served from 24 h cache.
                </div>
              )}

              <div className="space-y-1.5 rounded-lg border border-border p-4 text-sm">
                <p className="font-medium">What happens next</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>✓ Leads saved with full OSM metadata &amp; coordinates</li>
                  <li>✓ Phones normalized for deduplication</li>
                  <li>✓ Website crawl jobs queued for email/contact enrichment</li>
                  <li>→ View in <strong>My Leads</strong></li>
                </ul>
              </div>

              <Button variant="outline" className="w-full" onClick={() => { setLastResult(null); searchMutation.reset(); }}>
                New Search
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
