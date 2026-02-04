import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
  getWindowSettings: () => ipcRenderer.invoke('get-window-settings'),
  saveWindowSettings: (width: number, height: number, x: number, y: number) =>
    ipcRenderer.invoke('save-window-settings', width, height, x, y),
  resetWindowSettings: () => ipcRenderer.invoke('reset-window-settings'),
  deleteFile: (filePath: string) => ipcRenderer.invoke('delete-file', filePath),
  selectMusicFolder: () => ipcRenderer.invoke('select-music-folder'),
  scanMusicFolder: (folderPath: string) => ipcRenderer.invoke('scan-music-folder', folderPath),
  pathToFileUrl: (filePath: string) => ipcRenderer.invoke('path-to-file-url', filePath),
  readAudioFile: (filePath: string) => ipcRenderer.invoke('read-audio-file', filePath),
  revealInFolder: (filePath: string) => ipcRenderer.invoke('reveal-in-folder', filePath),
  onWindowResized: (callback: (bounds: { width: number; height: number; x: number; y: number }) => void) => {
    const handler = (_event: unknown, bounds: { width: number; height: number; x: number; y: number }) => callback(bounds);
    ipcRenderer.on('window-resized', handler);
    return () => {
      ipcRenderer.removeListener('window-resized', handler);
    };
  },
  onWindowMoved: (callback: (bounds: { width: number; height: number; x: number; y: number }) => void) => {
    const handler = (_event: unknown, bounds: { width: number; height: number; x: number; y: number }) => callback(bounds);
    ipcRenderer.on('window-moved', handler);
    return () => {
      ipcRenderer.removeListener('window-moved', handler);
    };
  },
});

export type ElectronAPI = {
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  getWindowBounds: () => Promise<{ width: number; height: number } | undefined>;
  getWindowSettings: () => Promise<{ windowWidth: number; windowHeight: number; windowX: number | null; windowY: number | null }>;
  saveWindowSettings: (width: number, height: number, x: number, y: number) => Promise<void>;
  resetWindowSettings: () => Promise<{ windowWidth: number; windowHeight: number; windowX: number | null; windowY: number | null }>;
  deleteFile: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
  selectMusicFolder: () => Promise<{ folderPath: string; files: string[] } | []>;
  scanMusicFolder: (folderPath: string) => Promise<string[]>;
  pathToFileUrl: (filePath: string) => Promise<string>;
  readAudioFile: (filePath: string) => Promise<ArrayBuffer | null>;
  revealInFolder: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
  onWindowResized: (callback: (bounds: { width: number; height: number; x: number; y: number }) => void) => () => void;
  onWindowMoved: (callback: (bounds: { width: number; height: number; x: number; y: number }) => void) => () => void;
};
