import path from 'node:path';
import { app, BrowserWindow, dialog, shell } from 'electron';
import log from 'electron-log/main';
import { initDatabase, closeDatabase } from './db';
import { registerIpcHandlers } from './ipc';
import { startJobRunner, stopJobRunner } from './services/job-queue';
import { startBackupService, stopBackupService } from './services/backup-service';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

const runningUnderWine = Boolean(
  process.env.WINEPREFIX || process.env.WINEDLLOVERRIDES || process.env.WINELOADERNOEXEC
);

if (process.env.MEERAKO_DISABLE_GPU === '1' || runningUnderWine) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

const createWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    width:     1600,
    height:    980,
    minWidth:  1280,
    minHeight: 820,
    backgroundColor: '#09090b',
    title: 'Meerako Lead Generator',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
      webSecurity:      true,
      spellcheck:       false,
    },
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    log.error(`[renderer] did-fail-load code=${errorCode} url=${validatedURL} reason=${errorDescription}`);
    void mainWindow?.loadURL(
      `data:text/html,${encodeURIComponent(
        `<html><body style="font-family: sans-serif; padding: 16px;"><h2>UI failed to load</h2><p>${errorDescription} (code ${errorCode})</p><p>${validatedURL}</p></body></html>`
      )}`
    );
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log.error('[renderer] render-process-gone', details);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      log.error(`[renderer-console] ${sourceId}:${line} ${message}`);
    }
  });

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    log.error(`[renderer] preload-error at ${preloadPath}`, error);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      void mainWindow.webContents.executeJavaScript(
        `(() => {
          const root = document.getElementById('root');
          return {
            href: window.location.href,
            hasRoot: Boolean(root),
            rootLen: (root?.innerHTML ?? '').trim().length
          };
        })();`
      ).then((state: { href: string; hasRoot: boolean; rootLen: number }) => {
        if (state.hasRoot && state.rootLen === 0) {
          log.error(`[renderer] root remained empty after load: ${state.href}`);
          void mainWindow?.loadURL(
            `data:text/html,${encodeURIComponent(
              `<html><body style="font-family: sans-serif; padding: 16px;"><h2>UI boot failed</h2><p>The window loaded but renderer did not mount.</p><p>${state.href}</p></body></html>`
            )}`
          );
        }
      }).catch((error) => {
        log.error('[renderer] post-load health-check failed', error);
      });
    }, 3500);
  });

  await registerIpcHandlers(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  mainWindow.on('closed', () => { mainWindow = null; });
};

app.on('ready', async () => {
  log.initialize();
  log.info(`[app] starting Meerako Lead Generator v${app.getVersion()} — ${app.isPackaged ? 'production' : 'development'}`);

  try {
    await initDatabase();
    startJobRunner();
    startBackupService();
    await createWindow();
  } catch (error) {
    log.error('[app] startup failed', error);
    const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error);
    dialog.showErrorBox('Startup failed', `Meerako Lead Generator could not start.\n\n${message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) await createWindow();
});

app.on('before-quit', () => {
  stopJobRunner();
  stopBackupService();
  closeDatabase();
});
