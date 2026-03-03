import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const maskEmail = (email?: string | null): string => {
  if (!email) return 'N/A';
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length === 1) return `*@${domain}`;
  return `${local[0]}***@${domain}`;
};
