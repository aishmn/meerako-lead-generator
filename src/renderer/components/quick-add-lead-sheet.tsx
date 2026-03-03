import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useUiStore } from '@/stores/ui-store';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Input } from './ui/input';
import { Button } from './ui/button';

const initial = { name: '', website: '', phone: '', email: '', address: '', city: '', country: '' };

export const QuickAddLeadSheet = () => {
  const { quickAddOpen, setQuickAddOpen } = useUiStore();
  const [form, setForm] = useState(initial);
  const queryClient = useQueryClient();

  const field = (key: keyof typeof initial) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value })),
  });

  const createMutation = useMutation({
    mutationFn: () => window.leadforge.leads.create(form),
    onSuccess: () => {
      toast.success('Lead added');
      setForm(initial);
      setQuickAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create lead'),
  });

  return (
    <Sheet open={quickAddOpen} onOpenChange={setQuickAddOpen}>
      <SheetContent side="right" className="w-[480px]">
        <SheetHeader>
          <SheetTitle>Add Lead Manually</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Add a business lead by hand. Full details can be edited later.
          </p>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <Input placeholder="Business name *" {...field('name')} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Phone"   {...field('phone')} />
            <Input placeholder="Email"   type="email" {...field('email')} />
            <Input placeholder="Website" {...field('website')} />
            <Input placeholder="City"    {...field('city')} />
            <Input placeholder="Country" {...field('country')} className="col-span-2" />
          </div>
          <Input placeholder="Address" {...field('address')} />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setQuickAddOpen(false)}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!form.name.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? 'Saving…' : 'Create Lead'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
