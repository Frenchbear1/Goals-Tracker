import { app, BrowserWindow, Menu, ipcMain, dialog, protocol, shell } from 'electron';
import path from 'path';
import fs from 'fs';

// Disable GPU acceleration to prevent crashes on Windows
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let mainWindow: BrowserWindow | null = null;

const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 350;
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

type AppSettings = {
  windowWidth?: number;
  windowHeight?: number;
  windowX?: number;
  windowY?: number;
};

const loadSettings = (): AppSettings => {
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      return JSON.parse(raw) as AppSettings;
    }
  } catch {
    return {};
  }
  return {};
};

const saveSettings = (settings: AppSettings) => {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch {
    // ignore write errors
  }
};

let appSettings: AppSettings = loadSettings();

const registerMediaProtocol = () => {
  protocol.registerFileProtocol('media', (request, callback) => {
    let urlPath = request.url.replace('media://', '');
    let filePath = decodeURIComponent(urlPath);
    if (filePath.startsWith('/')) {
      filePath = filePath.slice(1);
    }
    if (process.platform === 'win32') {
      filePath = filePath.replace(/\//g, '\\');
    }
    callback({ path: filePath });
  });
};

const createWindow = () => {
  const displays = require('electron').screen.getAllDisplays();
  const primaryDisplay = displays[0];
  const workArea = primaryDisplay.workArea;
  
  const windowWidth = typeof appSettings.windowWidth === 'number' ? appSettings.windowWidth : DEFAULT_WIDTH;
  const windowHeight = typeof appSettings.windowHeight === 'number' ? appSettings.windowHeight : DEFAULT_HEIGHT;

  // Position bottom-right within the usable work area (above taskbar) unless saved
  let x = typeof appSettings.windowX === 'number'
    ? appSettings.windowX
    : Math.floor(workArea.x + workArea.width - windowWidth);
  let y = typeof appSettings.windowY === 'number'
    ? appSettings.windowY
    : Math.floor(workArea.y + workArea.height - windowHeight);

  // Clamp just in case of small screens or DPI quirks
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - windowWidth));
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - windowHeight));
  
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, process.platform === 'win32' ? '../assets/icon.ico' : '../assets/icon.png'),
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    show: true,
    resizable: true,
    skipTaskbar: false,
    alwaysOnTop: true,
  });

  const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
  const isDev = process.env.REACT_APP_DEV === 'true' || process.env.ELECTRON_START_URL;
  if (isDev) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }

  mainWindow.webContents.once('did-finish-load', () => {
    if (!mainWindow) return;
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
  });

  // Open DevTools only in true development (can be toggled with Ctrl+Shift+I)
  // mainWindow.webContents.openDevTools();

  // Snap to corners on drag
  mainWindow.on('moved', () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    const displays = require('electron').screen.getAllDisplays();
    const primaryDisplay = displays[0];
    const workArea = primaryDisplay.workArea;
    const snapDistance = 30;
    
    let newX = bounds.x;
    let newY = bounds.y;
    
    // Check proximity to corners and edges
    if (bounds.x <= workArea.x + snapDistance) newX = workArea.x;
    if (bounds.y <= workArea.y + snapDistance) newY = workArea.y;
    if (bounds.x + bounds.width >= workArea.x + workArea.width - snapDistance) {
      newX = workArea.x + workArea.width - bounds.width;
    }
    if (bounds.y + bounds.height >= workArea.y + workArea.height - snapDistance) {
      newY = workArea.y + workArea.height - bounds.height;
    }
    
    if (newX !== bounds.x || newY !== bounds.y) {
      mainWindow.setPosition(newX, newY);
    }
  });

  mainWindow.on('resize', () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    mainWindow.webContents.send('window-resized', bounds);
  });

  mainWindow.on('moved', () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    mainWindow.webContents.send('window-moved', bounds);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(() => {
  registerMediaProtocol();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Keep app in system tray or allow staying on top
ipcMain.handle('minimize-window', () => {
  mainWindow?.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('close-window', () => {
  mainWindow?.close();
});

ipcMain.handle('get-window-bounds', () => {
  return mainWindow?.getBounds();
});

ipcMain.handle('get-window-settings', () => {
  return {
    windowWidth: typeof appSettings.windowWidth === 'number' ? appSettings.windowWidth : DEFAULT_WIDTH,
    windowHeight: typeof appSettings.windowHeight === 'number' ? appSettings.windowHeight : DEFAULT_HEIGHT,
    windowX: typeof appSettings.windowX === 'number' ? appSettings.windowX : null,
    windowY: typeof appSettings.windowY === 'number' ? appSettings.windowY : null,
  };
});

ipcMain.handle('save-window-settings', (_event, width: number, height: number, x: number, y: number) => {
  appSettings = { ...appSettings, windowWidth: width, windowHeight: height, windowX: x, windowY: y };
  saveSettings(appSettings);
});

ipcMain.handle('reset-window-settings', () => {
  appSettings = {};
  saveSettings(appSettings);
  return {
    windowWidth: DEFAULT_WIDTH,
    windowHeight: DEFAULT_HEIGHT,
    windowX: null,
    windowY: null,
  };
});

ipcMain.handle('delete-file', async (_event, filePath: string) => {
  if (!filePath) {
    return { ok: false, error: 'Missing file path' };
  }
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: 'File not found' };
    }
    fs.unlinkSync(filePath);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete file';
    return { ok: false, error: message };
  }
});

const collectMp3Files = (rootPath: string): string[] => {
  const results: string[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(rootPath, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMp3Files(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp3')) {
      results.push(fullPath);
    }
  }
  return results;
};

const resolveMediaPath = (maybeRelativePath: string) => {
  if (!maybeRelativePath) return '';
  if (path.isAbsolute(maybeRelativePath)) return maybeRelativePath;
  if (app.isPackaged) {
    return path.join(process.resourcesPath, maybeRelativePath);
  }
  return path.join(app.getAppPath(), maybeRelativePath);
};

ipcMain.handle('select-music-folder', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  const folderPath = result.filePaths[0];
  try {
    return { folderPath, files: collectMp3Files(folderPath) };
  } catch {
    return { folderPath, files: [] };
  }
});

ipcMain.handle('scan-music-folder', async (_event, folderPath: string) => {
  if (!folderPath) return [];
  try {
    const resolvedPath = resolveMediaPath(folderPath);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) return [];
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) return [];
    return collectMp3Files(resolvedPath);
  } catch {
    return [];
  }
});

ipcMain.handle('path-to-file-url', (_event, filePath: string) => {
  if (!filePath) return '';
  return `media://${encodeURIComponent(filePath)}`;
});

ipcMain.handle('read-audio-file', async (_event, filePath: string) => {
  if (!filePath) return null;
  try {
    const resolvedPath = resolveMediaPath(filePath);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) return null;
    return fs.readFileSync(resolvedPath);
  } catch {
    return null;
  }
});

ipcMain.handle('reveal-in-folder', async (_event, filePath: string) => {
  if (!filePath) {
    return { ok: false, error: 'Missing file path' };
  }
  try {
    shell.showItemInFolder(filePath);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reveal file';
    return { ok: false, error: message };
  }
});
