export {};

declare global {
  interface Window {
    electronAPI: {
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
  }
}
