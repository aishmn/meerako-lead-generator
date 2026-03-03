import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { AppSettings } from '@lib/types';

export const SettingsPage = () => {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn:  () => window.leadforge.settings.get(),
  });

  const settings = settingsQuery.data;
  const [appName, setAppName] = useState('');
  const [theme, setTheme]     = useState<'dark' | 'light'>('dark');

  // Sync form when settings load
  useState(() => {
    if (settings) {
      setAppName(settings.general.appName);
      setTheme(settings.general.theme);
    }
  });

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<AppSettings>) =>
      window.leadforge.settings.update(payload),
    onSuccess: () => {
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error('Failed to save settings'),
  });

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* General */}
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Application appearance and identity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">App name</label>
            <Input
              value={appName || settings?.general.appName || ''}
              onChange={(e) => setAppName(e.target.value)}
              className="max-w-xs"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Theme</label>
            <div className="flex gap-3">
              {(['dark', 'light'] as const).map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 text-sm capitalize">
                  <input
                    type="radio"
                    name="theme"
                    value={t}
                    checked={(theme || settings?.general.theme) === t}
                    onChange={() => setTheme(t)}
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <Button
            onClick={() => saveMutation.mutate({ general: { appName: appName || settings?.general.appName!, theme } })}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </CardContent>
      </Card>

      {/* Data sources info */}
      <Card>
        <CardHeader>
          <CardTitle>Data Sources</CardTitle>
          <CardDescription>All data sources used by Meerako Lead Generator are free and open.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            {[
              {
                name: 'OpenStreetMap / Overpass API',
                desc: 'Business discovery by location and category. No API key required.',
                url:  'https://overpass-api.de',
              },
              {
                name: 'Nominatim Geocoding',
                desc: 'Converts city/location names to bounding boxes. Max 1 req/sec, results cached permanently.',
                url:  'https://nominatim.openstreetmap.org',
              },
              {
                name: 'Website Crawler',
                desc: 'Crawls business websites to extract contact emails, phones, and social links. Respects robots.txt.',
                url:  null,
              },
            ].map(({ name, desc, url }) => (
              <div key={name} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{name}</p>
                  {url && (
                    <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                      {url}
                    </a>
                  )}
                </div>
                <p className="mt-1 text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Database info */}
      <Card>
        <CardHeader>
          <CardTitle>Database</CardTitle>
          <CardDescription>Local SQLite database with daily automated backups.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>The database is stored locally in Electron's userData directory. Backups are created daily and kept for 7 days.</p>
          <p className="mt-2">To export your data use the <strong>Export CSV</strong> button in My Leads.</p>
        </CardContent>
      </Card>
    </div>
  );
};
