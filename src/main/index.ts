import path from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import log from 'electron-log/main';
import { initDatabase, closeDatabase } from './db';
import { registerIpcHandlers } from './ipc';
import { startJobRunner, stopJobRunner } from './services/job-queue';
import { startBackupService, stopBackupService } from './services/backup-service';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

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

  await registerIpcHandlers(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env.OPEN_DEVTOOLS === '1') {
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

  await initDatabase();
  startJobRunner();
  startBackupService();
  await createWindow();
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
