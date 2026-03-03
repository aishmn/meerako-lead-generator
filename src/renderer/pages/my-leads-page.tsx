import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Filter, Loader2, MapPin, Phone, Globe, Mail, Trash2, X, Flame } from 'lucide-react';
import { toast } from 'sonner';
import { useUiStore } from '@/stores/ui-store';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Lead, LeadListParams, LeadStatus } from '@lib/types';

const STATUS_COLORS: Record<LeadStatus, string> = {
  new:        'bg-blue-500/20 text-blue-400 border-blue-500/30',
  contacted:  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  interested: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  rejected:   'bg-red-500/20 text-red-400 border-red-500/30',
  closed:     'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

const ALL_STATUSES: LeadStatus[] = ['new', 'contacted', 'interested', 'rejected', 'closed'];

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-red-500/20 text-red-400 border-red-500/40' :
    score >= 60 ? 'bg-orange-500/20 text-orange-400 border-orange-500/40' :
    score >= 40 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' :
                  'bg-muted text-muted-foreground border-border';
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${color}`}>
      {score}
    </span>
  );
}

export const MyLeadsPage = () => {
  const queryClient = useQueryClient();
  const { setSelectedLeadId } = useUiStore();

  const [search,     setSearch]     = useState('');
  const [status,     setStatus]     = useState<LeadStatus | ''>('');
  const [city,       setCity]       = useState('');
  const [hasWebsite, setHasWebsite] = useState(false);
  const [noWebsite,  setNoWebsite]  = useState(false);
  const [hasPhone,   setHasPhone]   = useState(false);
  const [hasEmail,   setHasEmail]   = useState(false);
  const [page,       setPage]       = useState(1);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const pageSize = 50;

  const params: LeadListParams = {
    page, pageSize, search, status, city,
    hasWebsite: hasWebsite || undefined,
    hasPhone:   hasPhone   || undefined,
    hasEmail:   hasEmail   || undefined,
    noWebsite:  noWebsite  || undefined,
    sortBy: 'score', sortDir: 'desc',
  };

  const leadsQuery = useQuery({
    queryKey: ['leads', params],
    queryFn:  () => window.leadforge.leads.list(params),
    placeholderData: (prev) => prev,
  });

  const leads  = leadsQuery.data?.leads  ?? [];
  const total  = leadsQuery.data?.total  ?? 0;
  const pages  = leadsQuery.data?.pages  ?? 1;

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => window.leadforge.leads.deleteMany(ids),
    onSuccess: (n) => {
      toast.success(`${n} lead${n === 1 ? '' : 's'} deleted`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: LeadStatus }) =>
      window.leadforge.leads.bulkStatus(ids, status),
    onSuccess: (n) => {
      toast.success(`${n} leads updated`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async (ids?: string[]) => {
      const csv = await window.leadforge.leads.exportCsv(ids);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `meerako-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return csv;
    },
    onSuccess: () => toast.success('CSV exported'),
    onError:   () => toast.error('Export failed'),
  });

  const resetPage = () => setPage(1);
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map((l) => l.id)));
    }
  };

  const hasFilters = search || status || city || hasWebsite || hasPhone || hasEmail || noWebsite;

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* ── Filter Bar ─────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search name, city, phone, email…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              />
            </div>

            <Input
              className="w-36"
              placeholder="City"
              value={city}
              onChange={(e) => { setCity(e.target.value); resetPage(); }}
            />

            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(e) => { setStatus(e.target.value as LeadStatus | ''); resetPage(); }}
            >
              <option value="">All statuses</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>

            {/* Prospect filters */}
            <label className="flex items-center gap-1.5 text-sm cursor-pointer font-medium text-orange-400">
              <input type="checkbox" checked={noWebsite} onChange={(e) => { setNoWebsite(e.target.checked); setHasWebsite(false); resetPage(); }} />
              No website
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={hasWebsite} onChange={(e) => { setHasWebsite(e.target.checked); setNoWebsite(false); resetPage(); }} />
              Has website
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={hasPhone} onChange={(e) => { setHasPhone(e.target.checked); resetPage(); }} />
              Phone
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={hasEmail} onChange={(e) => { setHasEmail(e.target.checked); resetPage(); }} />
              Email
            </label>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatus(''); setCity(''); setHasWebsite(false); setNoWebsite(false); setHasPhone(false); setHasEmail(false); resetPage(); }}>
                <X size={14} className="mr-1" /> Clear
              </Button>
            )}

            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{total} leads</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportMutation.mutate(selected.size > 0 ? [...selected] : undefined)}
                disabled={exportMutation.isPending}
              >
                <Download size={14} className="mr-1" />
                {selected.size > 0 ? `Export ${selected.size}` : 'Export all'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Bulk actions bar ──────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex gap-2">
            {ALL_STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                onClick={() => bulkStatusMutation.mutate({ ids: [...selected], status: s })}
                disabled={bulkStatusMutation.isPending}
                className="h-7 text-xs"
              >
                → {s}
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            variant="destructive"
            className="ml-auto h-7 text-xs"
            onClick={() => {
              if (confirm(`Delete ${selected.size} leads? This cannot be undone.`)) {
                deleteMutation.mutate([...selected]);
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 size={12} className="mr-1" /> Delete
          </Button>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <Card className="flex-1 overflow-hidden">
        <div className="h-full overflow-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-3">
                  <input type="checkbox" checked={selected.size === leads.length && leads.length > 0} onChange={toggleAll} />
                </th>
                <th className="px-3 py-3">Score</th>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Location</th>
                <th className="px-3 py-3">Contact</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Added</th>
              </tr>
            </thead>
            <tbody>
              {leadsQuery.isLoading && (
                <tr>
                  <td colSpan={9} className="px-3 py-16 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </td>
                </tr>
              )}
              {!leadsQuery.isLoading && leads.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-16 text-center text-muted-foreground">
                    {hasFilters ? 'No leads match your filters.' : 'No leads yet — use Find Businesses to discover leads.'}
                  </td>
                </tr>
              )}
              {leads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  selected={selected.has(lead.id)}
                  onToggle={() => toggleSelect(lead.id)}
                  onClick={() => setSelectedLeadId(lead.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Pagination ────────────────────────────────────────────────── */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="text-sm text-muted-foreground">Page {page} / {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
};

// ─── Lead Row ─────────────────────────────────────────────────────────────────

interface LeadRowProps {
  lead:     Lead;
  selected: boolean;
  onToggle: () => void;
  onClick:  () => void;
}

function LeadRow({ lead, selected, onToggle, onClick }: LeadRowProps) {
  const isHot = !lead.website && !!lead.phone;

  return (
    <tr
      className={`cursor-pointer border-t border-border transition-colors hover:bg-muted/40 ${selected ? 'bg-primary/5' : ''}`}
      onClick={onClick}
    >
      <td className="px-3 py-2.5" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
        <input type="checkbox" checked={selected} onChange={onToggle} />
      </td>

      <td className="px-3 py-2.5">
        <ScoreBadge score={lead.score} />
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          {isHot && <Flame size={12} className="text-orange-400 shrink-0" aria-label="Hot prospect: no website, has phone" />}
          <div>
            <p className="font-medium leading-tight">{lead.name}</p>
            {!lead.website && (
              <p className="text-[10px] text-orange-400 font-medium">No website</p>
            )}
            {lead.address && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{lead.address}</p>}
          </div>
        </div>
      </td>

      <td className="px-3 py-2.5">
        {lead.category && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{lead.category.replace(/_/g, ' ')}</span>
        )}
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1 text-muted-foreground">
          {lead.city && <><MapPin size={11} /><span className="text-xs">{lead.city}{lead.country ? `, ${lead.country}` : ''}</span></>}
        </div>
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {lead.phone   && <Phone  size={12} className="text-muted-foreground" aria-label={lead.phone} />}
          {lead.website && <Globe  size={12} className="text-muted-foreground" aria-label={lead.website} />}
          {lead.email   && <Mail   size={12} className="text-muted-foreground" aria-label={lead.email} />}
          {lead.crawlEmails.length > 0 && <span className="text-[10px] text-emerald-400">+{lead.crawlEmails.length} email</span>}
        </div>
      </td>

      <td className="px-3 py-2.5">
        <span className="text-xs text-muted-foreground">{lead.source.replace('_', ' ')}</span>
      </td>

      <td className="px-3 py-2.5">
        <span className={`rounded border px-2 py-0.5 text-xs ${STATUS_COLORS[lead.status]}`}>
          {lead.status}
        </span>
      </td>

      <td className="px-3 py-2.5 text-xs text-muted-foreground">
        {new Date(lead.createdAt).toLocaleDateString()}
      </td>
    </tr>
  );
}
