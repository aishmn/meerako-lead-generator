import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@lib/utils';

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export const SheetContent = ({
  children,
  side = 'right',
  className,
  ...props
}: Dialog.DialogContentProps & { side?: 'left' | 'right' }) => (
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
    <Dialog.Content
      className={cn(
        'fixed z-50 h-full w-[480px] border-l border-border bg-card p-6 shadow-xl transition-transform data-[state=open]:translate-x-0',
        side === 'right' ? 'right-0 top-0' : 'left-0 top-0 border-r border-l-0',
        className
      )}
      {...props}
    >
      {children}
      <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
);

export const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mb-4 flex flex-col gap-1', className)} {...props} />
);

export const SheetTitle = Dialog.Title;
