import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000
    }
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Renderer root element #root was not found.');
}

const renderCrashFallback = (title: string, details: string) => {
  rootElement.innerHTML = `
    <div style="font-family: sans-serif; padding: 16px; line-height: 1.4;">
      <h2>${title}</h2>
      <pre style="white-space: pre-wrap; word-break: break-word;">${details}</pre>
    </div>
  `;
};

window.addEventListener('error', (event) => {
  const detail = `${event.message}\n${event.filename}:${event.lineno}:${event.colno}`;
  console.error('[renderer] window error', event.error ?? detail);
  renderCrashFallback('Renderer Error', detail);
});

window.addEventListener('unhandledrejection', (event) => {
  const detail = event.reason instanceof Error
    ? `${event.reason.message}\n${event.reason.stack ?? ''}`
    : String(event.reason);
  console.error('[renderer] unhandled rejection', event.reason);
  renderCrashFallback('Unhandled Promise Rejection', detail);
});

try {
  createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster richColors closeButton position="top-right" />
      </QueryClientProvider>
    </React.StrictMode>
  );
} catch (error) {
  const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  console.error('[renderer] bootstrap failed', error);
  renderCrashFallback('Renderer Bootstrap Failed', detail);
}
