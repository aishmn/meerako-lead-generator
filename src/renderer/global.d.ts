import type { AppApi } from '@lib/ipc';

declare global {
  interface Window {
    leadforge: AppApi;
  }
}

export {};
