import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import { Briefcase, Flame, Globe, MapPin, Phone, TrendingUp, WifiOff } from 'lucide-react';
import { useUiStore } from '@/stores/ui-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const DashboardPage = () => {
  const { setSection } = useUiStore();

  const metricsQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn:  () => window.leadforge.dashboard.getMetrics(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const m = metricsQuery.data;

  const statCards = [
    { label: 'Total Leads',     value: m?.totalLeads    ?? 0, icon: Briefcase, color: 'text-primary',      desc: 'All discovered businesses' },
    { label: 'New This Week',   value: m?.newThisWeek   ?? 0, icon: TrendingUp, color: 'text-emerald-400', desc: 'Recently added' },
    { label: 'Hot Prospects',   value: m?.hotProspects  ?? 0, icon: Flame,      color: 'text-red-400',     desc: 'No website + has phone' },
    { label: 'No Website',      value: m?.noWebsite     ?? 0, icon: WifiOff,    color: 'text-orange-400',  desc: 'Prime web dev targets' },
    { label: 'With Phone',      value: m?.withPhone     ?? 0, icon: Phone,      color: 'text-amber-400',   desc: 'Directly reachable' },
    { label: 'With Website',    value: m?.withWebsite   ?? 0, icon: Globe,      color: 'text-blue-400',    desc: 'May need redesign/SEO' },
  ];

  const statusData = m?.byStatus
    ? Object.entries(m.byStatus).map(([status, count]) => ({ status, count }))
    : [];

  const categoryData = m?.topCategories ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Meerako.com · Software & Web Agency — Client Discovery
          </p>
        </div>
        <Button onClick={() => setSection('find-leads')}>
          <MapPin size={14} className="mr-2" /> Find Businesses
        </Button>
      </div>

      {/* Hot prospects callout */}
      {(m?.hotProspects ?? 0) > 0 && (
        <div
          className="flex cursor-pointer items-center gap-4 rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-4"
          onClick={() => setSection('my-leads')}
        >
          <Flame className="h-8 w-8 text-orange-400 shrink-0" />
          <div>
            <p className="font-semibold text-orange-300">
              {m!.hotProspects} hot prospect{m!.hotProspects !== 1 ? 's' : ''} waiting
            </p>
            <p className="text-sm text-orange-400/80">
              Businesses with no website but a phone number — prime targets for Meerako. Click to view.
            </p>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 lg:grid-cols-6">
        {statCards.map(({ label, value, icon: Icon, color, desc }) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-bold">{value.toLocaleString()}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{desc}</p>
                </div>
                <Icon className={`h-4 w-4 shrink-0 ${color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Status breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
            <CardDescription>Lead status distribution</CardDescription>
          </CardHeader>
          <CardContent>
            {statusData.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                No leads yet —{' '}
                <button className="ml-1 text-primary hover:underline" onClick={() => setSection('find-leads')}>
                  find some
                </button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={statusData} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="status" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
                    cursor={{ fill: 'hsl(var(--muted))' }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top categories */}
        <Card>
          <CardHeader>
            <CardTitle>Top Categories</CardTitle>
            <CardDescription>Business types — hover to see count</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                No data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={categoryData} barSize={24} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis dataKey="category" type="category" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={90} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent events */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {!m?.recentEvents?.length ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="space-y-2">
              {m.recentEvents.map((event) => (
                <div key={event.id} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
                  <div className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span className="font-medium capitalize">{event.eventType.replace(/_/g, ' ')}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDistanceToNow(event.createdAt, { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
