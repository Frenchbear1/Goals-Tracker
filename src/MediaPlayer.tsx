import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiMusic,
  FiList,
  FiUpload,
  FiX,
  FiSkipBack,
  FiSkipForward,
  FiPlay,
  FiPause,
  FiRepeat,
  FiTrash2,
} from 'react-icons/fi';
import { FaStar } from 'react-icons/fa';
import { FiStar } from 'react-icons/fi';
import { RiShuffleLine } from 'react-icons/ri';
import './MediaPlayer.css';

type RepeatMode = 'none' | 'once' | 'twice' | 'infinite';
type ViewMode = 'list' | 'player';
type TabMode = 'all' | 'fav' | 'default';
type PlaySource = 'user' | 'fav' | 'default';

type Track = {
  key: string;
  name: string;
  path: string;
  file?: File;
  url?: string;
  source?: 'user' | 'default';
};

type MediaPlayerProps = {
  isOpen: boolean;
  onClose: () => void;
  onPlayingChange?: (playing: boolean) => void;
};

let cachedTracks: Track[] = [];
let cachedFavorites: Set<string> | null = null;
let cachedState: {
  view: ViewMode;
  tab: TabMode;
  shuffle: boolean;
  currentIndex: number;
} | null = null;

const STORAGE_PLAYLIST = 'goalsMediaPlaylist';
const STORAGE_FAV = 'goalsMediaFavorites';
const STORAGE_VIEW = 'goalsMediaView';
const STORAGE_TAB = 'goalsMediaTab';
const STORAGE_SHUFFLE = 'goalsMediaShuffle';
const STORAGE_DEFAULT_DELETED = 'goalsMediaDefaultDeleted';

const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'webm', 'mp4']);

const fmtTime = (sec: number) => {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const getFileKey = (file: File) => {
  const fileWithPath = file as File & { webkitRelativePath?: string };
  return fileWithPath.webkitRelativePath || file.name || String(Math.random());
};

const getFilePath = (file: File) => {
  const fileWithPath = file as File & { webkitRelativePath?: string; path?: string };
  return fileWithPath.path || fileWithPath.webkitRelativePath || file.name || file.name;
};

const isAudioFile = (file: File) => {
  const name = (file.name || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() : '';
  if (ext && AUDIO_EXT.has(ext)) return true;
  return (file.type || '').startsWith('audio/');
};

const loadJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const getBaseName = (path: string) => {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
};

const displayTitle = (track: Track) => {
  const base = track.path ? getBaseName(track.path) : track.name;
  return base.replace(/\.mp3$/i, '');
};

const getTrackSource = (track: Track): PlaySource => (track.source ?? 'user') === 'default' ? 'default' : 'user';

const MediaPlayer: React.FC<MediaPlayerProps> = ({ isOpen, onClose, onPlayingChange }) => {
  const [tracks, setTracks] = useState<Track[]>(() => {
    const stored = cachedTracks.length > 0 ? cachedTracks : loadJson<Track[]>(STORAGE_PLAYLIST, []);
    return stored.map(track => ({ ...track, source: track.source ?? 'user' }));
  });
  const [defaultTracks, setDefaultTracks] = useState<Track[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(() => cachedFavorites ?? new Set(loadJson<string[]>(STORAGE_FAV, [])));
  const [view, setView] = useState<ViewMode>(() => cachedState?.view ?? loadJson<ViewMode>(STORAGE_VIEW, 'list'));
  const [tab, setTab] = useState<TabMode>(() => cachedState?.tab ?? loadJson<TabMode>(STORAGE_TAB, 'all'));
  const [shuffle, setShuffle] = useState<boolean>(() => cachedState?.shuffle ?? loadJson<boolean>(STORAGE_SHUFFLE, false));
  const [currentIndex, setCurrentIndex] = useState(cachedState?.currentIndex ?? -1);
  const [playSource, setPlaySource] = useState<PlaySource>('user');
  const [deletedDefault, setDeletedDefault] = useState<Set<string>>(
    () => new Set(loadJson<string[]>(STORAGE_DEFAULT_DELETED, []))
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('none');
  const [repeatRemaining, setRepeatRemaining] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<number[]>([]);
  useEffect(() => {
    const input = folderInputRef.current as (HTMLInputElement & { webkitdirectory?: boolean; directory?: boolean }) | null;
    if (!input) return;
    input.webkitdirectory = true;
    input.directory = true;
  }, []);

  useEffect(() => {
    if (tracks.length > 0 && tracks.every(track => !track.url)) {
      setTracks([]);
      setCurrentIndex(-1);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.scanMusicFolder || !window.electronAPI?.readAudioFile) return;
    let mounted = true;
    const loadDefaults = async () => {
      const files = await window.electronAPI.scanMusicFolder('default music');
      if (!mounted || !Array.isArray(files) || files.length === 0) return;
      const next: Track[] = [];
      for (const filePath of files) {
        const buffer = await window.electronAPI.readAudioFile(filePath);
        if (!buffer) continue;
        const url = URL.createObjectURL(new Blob([buffer]));
        next.push({
          key: filePath,
          name: getBaseName(filePath),
          path: filePath,
          url,
          source: 'default',
        });
      }
      if (!mounted) {
        next.forEach(track => {
          if (track.url?.startsWith('blob:')) {
            URL.revokeObjectURL(track.url);
          }
        });
        return;
      }
      setDefaultTracks(prev => {
        prev.forEach(track => {
          if (track.url?.startsWith('blob:')) {
            URL.revokeObjectURL(track.url);
          }
        });
        return next;
      });
    };
    loadDefaults();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_FAV, JSON.stringify([...favorites]));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(STORAGE_DEFAULT_DELETED, JSON.stringify([...deletedDefault]));
  }, [deletedDefault]);

  useEffect(() => {
    localStorage.setItem(STORAGE_VIEW, view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TAB, tab);
  }, [tab]);

  useEffect(() => {
    localStorage.setItem(STORAGE_SHUFFLE, shuffle ? 'true' : 'false');
  }, [shuffle]);

  useEffect(() => {
    const payload = tracks.map(({ key, name, path }) => ({
      key,
      name,
      path,
    }));
    localStorage.setItem(STORAGE_PLAYLIST, JSON.stringify(payload));
  }, [tracks]);

  useEffect(() => {
    cachedTracks = tracks;
    cachedFavorites = favorites;
    cachedState = {
      view,
      tab,
      shuffle,
      currentIndex,
    };
  }, [tracks, favorites, view, tab, shuffle, currentIndex]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  const defaultVisible = useMemo(
    () => defaultTracks.filter(track => !deletedDefault.has(track.key)),
    [defaultTracks, deletedDefault]
  );

  const favoriteVisible = useMemo(() => {
    const merged = [...tracks, ...defaultVisible];
    return merged.filter(track => favorites.has(track.key));
  }, [tracks, defaultVisible, favorites]);

  const listForTab = useMemo(() => {
    if (tab === 'fav') return favoriteVisible;
    if (tab === 'default') return defaultVisible;
    return tracks;
  }, [tab, tracks, favoriteVisible, defaultVisible]);

  const tabSource: PlaySource = tab === 'all' ? 'user' : tab === 'fav' ? 'fav' : 'default';

  const getTracksForSource = (source: PlaySource) => {
    if (source === 'fav') return favoriteVisible;
    if (source === 'default') return defaultVisible;
    return tracks;
  };

  const activeTracks = useMemo(() => getTracksForSource(playSource), [playSource, tracks, favoriteVisible, defaultVisible]);

  const visibleTracks = useMemo(
    () => listForTab.map((track, index) => ({ track, listIndex: index })),
    [listForTab]
  );

  const currentTrack = currentIndex >= 0 ? activeTracks[currentIndex] : null;

  const resetRepeat = () => {
    setRepeatMode('none');
    setRepeatRemaining(0);
  };

  const syncRepeatForRemaining = (remaining: number) => {
    if (remaining === 2) setRepeatMode('twice');
    else if (remaining === 1) setRepeatMode('once');
    else setRepeatMode('none');
  };

  useEffect(() => {
    if (currentIndex >= 0 && currentIndex >= activeTracks.length) {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      setCurrentIndex(-1);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [activeTracks, currentIndex]);

  const handleFolderSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    tracks.forEach(track => {
      if (!track.url || !track.url.startsWith('blob:')) return;
      try {
        URL.revokeObjectURL(track.url);
      } catch {
        // ignore
      }
    });

    const files = Array.from(event.target.files).filter(isAudioFile);
    const newFileTracks: Track[] = files.map(file => {
      const path = getFilePath(file);
      const cleanName = file.name;
      return {
        key: path || getFileKey(file),
        name: cleanName || 'Unknown',
        path,
        file,
        url: URL.createObjectURL(file),
        source: 'user',
      };
    });
    newFileTracks.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));

    setTracks(newFileTracks);
    setCurrentIndex(-1);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    historyRef.current = [];
    resetRepeat();
    setView('list');
    event.target.value = '';
  };

  const handlePickFolder = () => {
    folderInputRef.current?.click();
  };

  const loadTrack = (index: number, source: PlaySource, autoplay: boolean) => {
    const list = getTracksForSource(source);
    const track = list[index];
    if (!track) return;
    const url = track.url;
    if (!url) return;
    if (source !== playSource) {
      setPlaySource(source);
      historyRef.current = [];
    }
    setCurrentIndex(index);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    resetRepeat();

    const audio = audioRef.current;
    if (audio) {
      audio.src = url;
      audio.load();
      audio.currentTime = 0;
      if (autoplay) {
        audio.play().catch(() => setIsPlaying(false));
      }
    }
  };

  const selectTrack = (index: number, source: PlaySource, autoplay: boolean) => {
    const list = getTracksForSource(source);
    const track = list[index];
    if (!track) return;
    loadTrack(index, source, autoplay);
  };

  const playByIndex = (index: number, source: PlaySource) => {
    const target = getTracksForSource(source)[index];
    if (!target) return;
    if (source === playSource && index === currentIndex) {
      const audio = audioRef.current;
      if (!audio) return;
      if (!audio.src) {
        loadTrack(index, source, true);
        return;
      }
      if (audio.paused) audio.play().catch(() => setIsPlaying(false));
      else audio.pause();
      return;
    }
    if (source === playSource && currentIndex >= 0) {
      historyRef.current.push(currentIndex);
    } else if (source !== playSource) {
      historyRef.current = [];
    }
    selectTrack(index, source, true);
  };

  const pickNextIndex = () => {
    if (activeTracks.length === 0) return -1;
    const currentKey = activeTracks[currentIndex]?.key;
    if (shuffle) {
      if (activeTracks.length === 1) return currentIndex;
      let next = currentIndex;
      while (next === currentIndex) {
        next = Math.floor(Math.random() * activeTracks.length);
      }
      return next;
    }
    const viewIdx = activeTracks.findIndex(track => track.key === currentKey);
    const nextViewIdx = viewIdx < 0 ? 0 : viewIdx + 1;
    if (nextViewIdx >= activeTracks.length) return 0;
    return nextViewIdx;
  };

  const pickPrevIndex = () => {
    if (historyRef.current.length > 0) {
      const prev = historyRef.current.pop();
      return typeof prev === 'number' ? prev : -1;
    }
    if (activeTracks.length === 0) return -1;
    const currentKey = activeTracks[currentIndex]?.key;
    const viewIdx = activeTracks.findIndex(track => track.key === currentKey);
    const prevViewIdx = viewIdx <= 0 ? 0 : viewIdx - 1;
    return prevViewIdx;
  };

  const nextTrack = () => {
    const nextIndex = pickNextIndex();
    if (nextIndex < 0) {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      setIsPlaying(false);
      setCurrentTime(0);
      return;
    }
    if (currentIndex >= 0) historyRef.current.push(currentIndex);
    selectTrack(nextIndex, playSource, true);
  };

  const prevTrack = () => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 2) {
      audio.currentTime = 0;
      return;
    }
    const prevIndex = pickPrevIndex();
    if (prevIndex >= 0) {
      selectTrack(prevIndex, playSource, true);
    }
  };

  const toggleFavorite = (key: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const removeTrack = (track: Track) => {
    if (currentTrack?.key === track.key) {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      setCurrentIndex(-1);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      resetRepeat();
    }
    if (getTrackSource(track) === 'default') {
      setDeletedDefault(prev => {
        const next = new Set(prev);
        next.add(track.key);
        return next;
      });
      return;
    }
    setTracks(prev => {
      const targetIndex = prev.findIndex(entry => entry.key === track.key);
      if (targetIndex < 0) return prev;
      const target = prev[targetIndex];
      if (target?.url) {
        try {
          URL.revokeObjectURL(target.url);
        } catch {
          // ignore
        }
      }
      const next = prev.filter(entry => entry.key !== track.key);
      if (currentIndex >= 0 && playSource === 'user') {
        if (targetIndex === currentIndex) {
          setCurrentIndex(-1);
          setIsPlaying(false);
          setCurrentTime(0);
          setDuration(0);
          resetRepeat();
        } else if (targetIndex < currentIndex) {
          setCurrentIndex(currentIndex - 1);
        }
      }
      return next;
    });
  };

  const handleRepeatToggle = () => {
    const nextMode: RepeatMode =
      repeatMode === 'none' ? 'once' :
      repeatMode === 'once' ? 'twice' :
      repeatMode === 'twice' ? 'infinite' :
      'none';
    setRepeatMode(nextMode);
    setRepeatRemaining(
      nextMode === 'once' ? 1 :
      nextMode === 'twice' ? 2 :
      nextMode === 'infinite' ? Infinity :
      0
    );
  };

  const handleEnded = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (repeatMode === 'infinite') {
      audio.currentTime = 0;
      audio.play().catch(() => setIsPlaying(false));
      return;
    }

    if (repeatRemaining > 0) {
      const nextRemaining = repeatRemaining - 1;
      setRepeatRemaining(nextRemaining);
      syncRepeatForRemaining(nextRemaining);
      audio.currentTime = 0;
      audio.play().catch(() => setIsPlaying(false));
      return;
    }

    nextTrack();
  };

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration || 0);
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime || 0);
  };

  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  return (
    <>
      {isOpen && <div className="music-backdrop" onClick={onClose} />}
      <div
        className={`music-modal ${isOpen ? '' : 'media-player-hidden'}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="media-player">
          <div className="media-player-header">
            <h2 className="media-player-title">Media Player</h2>
            <div className="media-player-header-actions">
              <button
                className={`media-player-btn icon ${view === 'player' ? 'active' : ''}`}
                type="button"
                onClick={() => setView(view === 'list' ? 'player' : 'list')}
                title="Switch view"
              >
                {view === 'list' ? <FiMusic /> : <FiList />}
              </button>
              <div className="media-player-upload">
                <button
                  className="media-player-btn icon"
                  type="button"
                  onClick={handlePickFolder}
                  title="Upload folder"
                >
                  <FiUpload />
                </button>
              </div>
              <button className="media-player-btn icon" type="button" onClick={onClose} title="Close">
                <FiX />
              </button>
              <input
                ref={folderInputRef}
                className="media-player-input"
                type="file"
                multiple
                onChange={handleFolderSelected}
              />
            </div>
          </div>

          {view === 'list' ? (
          <div className="media-player-list-view">
            <div className="media-player-tabs">
              <button
                className={`media-player-tab ${tab === 'all' ? 'active' : ''}`}
                type="button"
                onClick={() => setTab('all')}
              >
                All
              </button>
              <button
                className={`media-player-tab ${tab === 'fav' ? 'active' : ''}`}
                type="button"
                onClick={() => setTab('fav')}
              >
                Favorites
              </button>
              <button
                className={`media-player-tab ${tab === 'default' ? 'active' : ''}`}
                type="button"
                onClick={() => setTab('default')}
              >
                Default
              </button>
            </div>
            <div className="media-player-list">
              {visibleTracks.length === 0 ? (
                <div className="media-player-empty-block">
                  <p className="media-player-empty">
                    {tab === 'default'
                      ? 'No default tracks found.'
                      : tab === 'fav'
                        ? 'No favorites yet.'
                        : 'Upload a folder of mp3 files to begin.'}
                  </p>
                  {tab === 'all' && tracks.length === 0 && (
                    <a
                      className="media-player-empty-link"
                      href="https://ytmp3.gg/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download YouTube videos to MP3
                    </a>
                  )}
                </div>
              ) : (
                visibleTracks.map(({ track, listIndex }) => (
                    <div
                      key={track.key}
                      className={`media-player-row ${playSource === tabSource && listIndex === currentIndex ? 'active' : ''}`}
                    >
                      <button
                        className="media-player-row-main"
                        type="button"
                        onClick={() => playByIndex(listIndex, tabSource)}
                      >
                        <span className="media-player-row-title">
                          {displayTitle(track)}
                        </span>
                      </button>
                      <button
                        className="media-player-trash"
                        type="button"
                        onClick={() => removeTrack(track)}
                        title="Remove"
                      >
                        <FiTrash2 />
                      </button>
                      <button
                        className={`media-player-fav ${favorites.has(track.key) ? 'active' : ''}`}
                        type="button"
                        onClick={() => toggleFavorite(track.key)}
                        title="Favorite"
                      >
                        {favorites.has(track.key) ? <FaStar /> : <FiStar />}
                      </button>
                    </div>
                  ))
                )}
              </div>

            </div>
          ) : (
            <div className="media-player-now-view">
              <div className="media-player-now">
                <div className="media-player-now-title">
                  {currentTrack ? displayTitle(currentTrack) : 'No track selected'}
                </div>
                {!currentTrack && (
                  <div className="media-player-now-sub">
                    Upload a folder to begin
                  </div>
                )}
              </div>

              <>
                <div className="media-player-timeline">
                  <span>{fmtTime(currentTime)}</span>
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    value={duration > 0 ? Math.round((currentTime / duration) * 1000) : 0}
                    onChange={(event) => {
                      const audio = audioRef.current;
                      if (!audio) return;
                      const target = Number(event.target.value);
                      if (duration > 0) {
                        audio.currentTime = (target / 1000) * duration;
                      }
                    }}
                  />
                  <span>{fmtTime(duration)}</span>
                </div>

                <div className="media-player-controls">
                  <button className="media-player-btn icon" type="button" onClick={prevTrack} title="Previous">
                    <FiSkipBack />
                  </button>
                  <button
                    className="media-player-btn primary"
                    type="button"
                    onClick={() => {
                      if (currentIndex < 0 && activeTracks.length > 0) {
                        selectTrack(0, playSource, true);
                        return;
                      }
                      const audio = audioRef.current;
                      if (!audio) return;
                      if (audio.paused) audio.play().catch(() => setIsPlaying(false));
                      else audio.pause();
                    }}
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <FiPause /> : <FiPlay />}
                  </button>
                  <button className="media-player-btn icon" type="button" onClick={nextTrack} title="Next">
                    <FiSkipForward />
                  </button>
                  <button
                    className={`media-player-btn icon ${shuffle ? 'active' : ''}`}
                    type="button"
                    onClick={() => setShuffle(prev => !prev)}
                    title="Shuffle"
                  >
                    <RiShuffleLine />
                  </button>
                  <button
                    className={`media-player-btn icon ${currentTrack && favorites.has(currentTrack.key) ? 'active' : ''}`}
                    type="button"
                    onClick={() => currentTrack && toggleFavorite(currentTrack.key)}
                    title="Favorite"
                  >
                    {currentTrack && favorites.has(currentTrack.key) ? <FaStar /> : <FiStar />}
                  </button>
                  <button
                    className={`media-player-btn icon ${repeatMode !== 'none' ? 'active' : ''}`}
                    type="button"
                    onClick={handleRepeatToggle}
                    title={repeatMode === 'none' ? 'Repeat' : repeatMode === 'once' ? 'Repeat once' : repeatMode === 'twice' ? 'Repeat twice' : 'Repeat infinite'}
                  >
                    {repeatMode === 'none' ? <FiRepeat /> : repeatMode === 'once' ? '1' : repeatMode === 'twice' ? '2' : '∞'}
                  </button>
                </div>

                <div className="media-player-volume">
                  <span>VOL</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(event) => setVolume(Number(event.target.value))}
                  />
                </div>
              </>

            </div>
          )}

        </div>
      </div>
      <audio
        ref={audioRef}
        preload="metadata"
        onEnded={handleEnded}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
    </>
  );
};

export default MediaPlayer;
