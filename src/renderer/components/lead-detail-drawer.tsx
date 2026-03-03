import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Copy, ExternalLink, Globe, Mail, MapPin, Phone, Plus, Tag, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useUiStore } from '@/stores/ui-store';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Lead, LeadStatus, LeadTag } from '@lib/types';

const STATUS_OPTIONS: LeadStatus[] = ['new', 'contacted', 'interested', 'rejected', 'closed'];

const STATUS_COLORS: Record<LeadStatus, string> = {
  new:        'bg-blue-500/20 text-blue-400 border-blue-500/30',
  contacted:  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  interested: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  rejected:   'bg-red-500/20 text-red-400 border-red-500/30',
  closed:     'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-red-500' :
    score >= 60 ? 'bg-orange-500' :
    score >= 40 ? 'bg-yellow-500' :
                  'bg-muted-foreground';
  const label =
    score >= 80 ? 'Hot prospect' :
    score >= 60 ? 'Good prospect' :
    score >= 40 ? 'Warm lead' :
                  'Cold lead';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Prospect score</span>
        <span className="font-semibold">{score}/100 · {label}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <p className="text-[10px] text-muted-foreground">
        Scoring: no website +50, phone +20, email +15, agency category +15
      </p>
    </div>
  );
}

function buildPitchTemplate(lead: Lead): string {
  const greeting = lead.name ? `Hi ${lead.name.split(' ')[0]},` : 'Hi,';
  const location = lead.city ? ` in ${lead.city}` : '';
  const category = lead.category ? lead.category.replace(/_/g, ' ') : 'business';
  const hasWebsite = !!lead.website;

  if (!hasWebsite) {
    return `${greeting}

I noticed that your ${category}${location} doesn't yet have a website, and I wanted to reach out.

We're Meerako — a software and web development agency. We help businesses like yours get online quickly and professionally.

A well-designed website can:
• Help customers find you on Google
• Build trust before they even walk through the door
• Accept bookings or enquiries 24/7

We'd love to build something great for ${lead.name}. We offer affordable packages and have our first site ready within 2 weeks.

Would you be open to a quick 15-minute chat this week?

Best regards,
Meerako Team
meerako.com`;
  }

  return `${greeting}

I came across ${lead.name}${location} and wanted to get in touch.

We're Meerako — a software and web development agency. We help established businesses like yours improve their digital presence.

We noticed your current online presence might benefit from:
• A modern redesign to convert more visitors
• SEO improvements to rank higher on Google
• A custom web app or booking system

Happy to do a free website audit and share some ideas. Would you be open to a quick call?

Best regards,
Meerako Team
meerako.com`;
}

export const LeadDetailDrawer = () => {
  const queryClient       = useQueryClient();
  const { selectedLeadId, setSelectedLeadId } = useUiStore();
  const [noteText, setNoteText] = useState('');
  const [pitchCopied, setPitchCopied] = useState(false);

  const leadQuery = useQuery({
    queryKey: ['lead', selectedLeadId],
    queryFn:  () => window.leadforge.leads.getById(selectedLeadId!),
    enabled:  !!selectedLeadId,
  });

  const notesQuery = useQuery({
    queryKey: ['notes', selectedLeadId],
    queryFn:  () => window.leadforge.notes.list(selectedLeadId!),
    enabled:  !!selectedLeadId,
  });

  const eventsQuery = useQuery({
    queryKey: ['events', selectedLeadId],
    queryFn:  () => window.leadforge.events.list(selectedLeadId!),
    enabled:  !!selectedLeadId,
  });

  const allTagsQuery = useQuery({
    queryKey: ['tags:all'],
    queryFn:  () => window.leadforge.tags.list(),
    enabled:  !!selectedLeadId,
  });

  const leadTagsQuery = useQuery({
    queryKey: ['tags:lead', selectedLeadId],
    queryFn:  () => window.leadforge.tags.listForLead(selectedLeadId!),
    enabled:  !!selectedLeadId,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<Lead>) =>
      window.leadforge.leads.update(selectedLeadId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', selectedLeadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: () => toast.error('Update failed'),
  });

  const addNoteMutation = useMutation({
    mutationFn: (content: string) =>
      window.leadforge.notes.add(selectedLeadId!, content),
    onSuccess: () => {
      setNoteText('');
      queryClient.invalidateQueries({ queryKey: ['notes', selectedLeadId] });
      queryClient.invalidateQueries({ queryKey: ['lead', selectedLeadId] });
    },
    onError: () => toast.error('Failed to add note'),
  });

  const removeNoteMutation = useMutation({
    mutationFn: (noteId: string) => window.leadforge.notes.remove(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', selectedLeadId] });
      queryClient.invalidateQueries({ queryKey: ['lead', selectedLeadId] });
    },
  });

  const addTagMutation = useMutation({
    mutationFn: (tagId: string) => window.leadforge.tags.addToLead(selectedLeadId!, tagId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags:lead', selectedLeadId] }),
  });

  const removeTagMutation = useMutation({
    mutationFn: (tagId: string) => window.leadforge.tags.removeFromLead(selectedLeadId!, tagId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags:lead', selectedLeadId] }),
  });

  if (!selectedLeadId) return null;

  const lead     = leadQuery.data;
  const leadTags = leadTagsQuery.data ?? [];
  const allTags  = allTagsQuery.data  ?? [];
  const tagIds   = new Set(leadTags.map((t: LeadTag) => t.id));

  const copyPitch = () => {
    if (!lead) return;
    navigator.clipboard.writeText(buildPitchTemplate(lead))
      .then(() => { setPitchCopied(true); setTimeout(() => setPitchCopied(false), 2000); })
      .catch(() => toast.error('Failed to copy'));
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
      onClick={() => setSelectedLeadId(null)}
    >
      {/* Drawer */}
      <div
        className="absolute right-0 top-0 flex h-full w-[580px] flex-col overflow-hidden bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex-1 min-w-0">
            {lead ? (
              <>
                <h2 className="truncate text-lg font-semibold">{lead.name}</h2>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {lead.category && <span>{lead.category.replace(/_/g, ' ')}</span>}
                  {lead.city && (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} /> {lead.city}{lead.country ? `, ${lead.country}` : ''}
                    </span>
                  )}
                </div>
                {/* Score bar */}
                <div className="mt-3">
                  <ScoreBar score={lead.score} />
                </div>
              </>
            ) : (
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => setSelectedLeadId(null)}>
            <X size={16} />
          </Button>
        </div>

        {/* Status picker */}
        {lead && (
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <span className="text-xs text-muted-foreground">Status:</span>
            <div className="flex gap-1.5 flex-wrap">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => updateMutation.mutate({ status: s })}
                  className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                    lead.status === s
                      ? STATUS_COLORS[s]
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {lead && (
          <div className="flex items-center gap-2 flex-wrap border-b border-border px-5 py-2.5">
            <Tag size={12} className="text-muted-foreground shrink-0" />
            {leadTags.map((t: LeadTag) => (
              <button
                key={t.id}
                type="button"
                onClick={() => removeTagMutation.mutate(t.id)}
                className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] hover:opacity-70 transition-opacity"
                style={{ borderColor: t.color + '60', color: t.color }}
              >
                {t.name} <X size={9} />
              </button>
            ))}
            {allTags.filter((t: LeadTag) => !tagIds.has(t.id)).map((t: LeadTag) => (
              <button
                key={t.id}
                type="button"
                onClick={() => addTagMutation.mutate(t.id)}
                className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-solid hover:text-foreground transition-colors"
              >
                + {t.name}
              </button>
            ))}
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="info" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TabsList className="mx-5 mt-3 w-auto justify-start">
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="pitch">Pitch</TabsTrigger>
            <TabsTrigger value="notes">
              Notes {(notesQuery.data?.length ?? 0) > 0 && `(${notesQuery.data!.length})`}
            </TabsTrigger>
            <TabsTrigger value="enrichment">Enrichment</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* Info tab */}
          <TabsContent value="info" className="flex-1 overflow-y-auto px-5 py-4">
            {lead && (
              <div className="space-y-4">
                <Section title="Contact">
                  <Row icon={<Phone size={13} />} label="Phone" value={lead.phone} />
                  <Row icon={<Mail  size={13} />} label="Email" value={lead.email} />
                  <Row icon={<Globe size={13} />} label="Website" value={lead.website} link />
                  {!lead.website && (
                    <div className="rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-400">
                      No website detected — prime prospect for web development services.
                    </div>
                  )}
                </Section>

                <Section title="Location">
                  <Row label="Address" value={lead.address} />
                  <Row label="City"    value={lead.city} />
                  <Row label="Country" value={lead.country} />
                  {lead.latitude && lead.longitude && (
                    <Row label="Coordinates" value={`${lead.latitude.toFixed(5)}, ${lead.longitude.toFixed(5)}`} />
                  )}
                </Section>

                <Section title="Source">
                  <Row label="Source"   value={lead.source.replace('_', ' ')} />
                  <Row label="OSM type" value={lead.osmType} />
                  <Row label="OSM ID"   value={lead.osmId} />
                  {lead.rawTags && Object.keys(lead.rawTags).length > 0 && (
                    <div className="mt-2">
                      <p className="mb-1 text-xs text-muted-foreground">Raw OSM tags</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(lead.rawTags).slice(0, 20).map(([k, v]) => (
                          <span key={k} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                            {k}={v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </Section>
              </div>
            )}
          </TabsContent>

          {/* Pitch tab */}
          <TabsContent value="pitch" className="flex-1 overflow-y-auto px-5 py-4">
            {lead && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Outreach template</p>
                  <Button size="sm" variant="outline" onClick={copyPitch}>
                    <Copy size={12} className="mr-1" />
                    {pitchCopied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-4 text-xs leading-relaxed text-foreground font-sans">
                  {buildPitchTemplate(lead)}
                </pre>
                <p className="text-[10px] text-muted-foreground">
                  Personalize before sending. Template adapts based on whether the business has a website.
                </p>
              </div>
            )}
          </TabsContent>

          {/* Notes tab */}
          <TabsContent value="notes" className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
            <div className="flex gap-2">
              <Textarea
                placeholder="Add a note…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="min-h-[80px] flex-1 resize-none text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && noteText.trim()) {
                    addNoteMutation.mutate(noteText.trim());
                  }
                }}
              />
              <Button
                size="sm"
                className="self-end"
                disabled={!noteText.trim() || addNoteMutation.isPending}
                onClick={() => addNoteMutation.mutate(noteText.trim())}
              >
                <Plus size={14} />
              </Button>
            </div>

            <div className="space-y-2">
              {(notesQuery.data ?? []).map((note) => (
                <div key={note.id} className="group relative rounded-lg border border-border bg-card p-3">
                  <p className="text-sm leading-relaxed">{note.content}</p>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    {formatDistanceToNow(note.createdAt, { addSuffix: true })}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeNoteMutation.mutate(note.id)}
                    className="absolute right-2 top-2 hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:flex"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {notesQuery.data?.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">No notes yet.</p>
              )}
            </div>
          </TabsContent>

          {/* Enrichment tab */}
          <TabsContent value="enrichment" className="flex-1 overflow-y-auto px-5 py-4">
            {lead && (
              <div className="space-y-4">
                <Section title="Crawl Status">
                  <Row label="Status" value={lead.crawlStatus ?? 'not set'} />
                  {lead.crawledAt && (
                    <Row label="Last crawled" value={new Date(lead.crawledAt).toLocaleString()} />
                  )}
                </Section>

                {lead.crawlEmails.length > 0 && (
                  <Section title="Discovered Emails">
                    {lead.crawlEmails.map((e) => (
                      <div key={e} className="flex items-center gap-2 text-sm">
                        <Mail size={12} className="text-muted-foreground" />
                        <a href={`mailto:${e}`} className="text-primary hover:underline">{e}</a>
                      </div>
                    ))}
                  </Section>
                )}

                {lead.crawlPhones.length > 0 && (
                  <Section title="Discovered Phones">
                    {lead.crawlPhones.map((p) => (
                      <div key={p} className="flex items-center gap-2 text-sm">
                        <Phone size={12} className="text-muted-foreground" />
                        <span>{p}</span>
                      </div>
                    ))}
                  </Section>
                )}

                {lead.crawlSocial && Object.values(lead.crawlSocial).some(Boolean) && (
                  <Section title="Social Links">
                    {Object.entries(lead.crawlSocial).filter(([, v]) => v).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 text-sm">
                        <Globe size={12} className="text-muted-foreground" />
                        <span className="capitalize text-muted-foreground w-20">{k}</span>
                        <a href={v!} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
                          {v}
                        </a>
                      </div>
                    ))}
                  </Section>
                )}

                {lead.crawlStatus === 'pending' && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
                    Website crawl queued — enrichment will appear here automatically.
                  </div>
                )}
                {lead.crawlStatus === 'skipped' && (
                  <div className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
                    No website — crawl skipped.
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* History tab */}
          <TabsContent value="history" className="flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-2">
              {(eventsQuery.data ?? []).map((event) => (
                <div key={event.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{formatEventType(event.eventType)}</p>
                    {event.payload && (
                      <p className="text-xs text-muted-foreground">
                        {JSON.stringify(event.payload)}
                      </p>
                    )}
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(event.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
              {eventsQuery.data?.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">No history yet.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ icon, label, value, link }: {
  icon?:  React.ReactNode;
  label:  string;
  value:  string | null | undefined;
  link?:  boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      {link ? (
        <a
          href={value.startsWith('http') ? value : `https://${value}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 truncate text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {value} <ExternalLink size={10} />
        </a>
      ) : (
        <span className="truncate">{value}</span>
      )}
    </div>
  );
}

function formatEventType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
