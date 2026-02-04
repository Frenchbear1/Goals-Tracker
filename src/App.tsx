import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FiCheck, FiTrash2, FiPlus, FiMinus, FiX, FiChevronUp, FiClock, FiPause, FiPlay, FiLink, FiSettings, FiMusic } from 'react-icons/fi';
import './App.css';
import MediaPlayer from './MediaPlayer';

interface Item {
  id: string;
  text: string;
  completed: boolean;
  createdDate: string;
  elapsedSeconds?: number;
  link?: string;
  schedule?: {
    type: 'daily' | 'weekdays' | 'weekends' | 'custom-days' | 'every-other-day' | 'every-3-days' | 'weekly' | 'biweekly' | 'monthly' | 'specific-date';
    daysOfWeek?: number[];
    date?: string;
    anchorDate?: string;
  };
}

type ScheduleType = NonNullable<Item['schedule']>['type'];

interface LogEntry {
  id: string;
  itemId: string;
  itemText: string;
  tab: 'goals' | 'waste';
  startISO: string;
  endISO: string;
  durationSeconds: number;
}

interface TimerState {
  mode: 'countdown' | 'stopwatch';
  seconds: number;
  remainingSeconds?: number;
  totalSeconds?: number;
  elapsedSeconds?: number;
  targetTimeMs?: number;
  isRunning: boolean;
  startSeconds?: number;
  startRemaining?: number;
  itemText: string;
  tab: 'goals' | 'waste';
}

const loadStoredState = (): {
  items: { goals: Item[]; waste: Item[] };
  logs: LogEntry[];
  taskHistory: { goals: string[]; waste: string[] };
} => {
  const emptyState = {
    items: { goals: [], waste: [] },
    logs: [] as LogEntry[],
    taskHistory: { goals: [], waste: [] },
  };
  try {
    const stored = localStorage.getItem('goalsTrackerData');
    const today = new Date().toDateString();
    if (!stored) {
      localStorage.setItem('lastResetDate', today);
      return emptyState;
    }
    const data = JSON.parse(stored);
    const storedItems = data.items ?? data;
    const storedLogs = Array.isArray(data.logs) ? data.logs : [];
    const storedHistory = data.taskHistory;
    const derivedHistory = {
      goals: [
        ...new Set([
          ...storedItems.goals.map((item: Item) => item.text),
          ...storedLogs.filter((entry: LogEntry) => entry.tab === 'goals').map((entry: LogEntry) => entry.itemText),
        ]),
      ],
      waste: [
        ...new Set([
          ...storedItems.waste.map((item: Item) => item.text),
          ...storedLogs.filter((entry: LogEntry) => entry.tab === 'waste').map((entry: LogEntry) => entry.itemText),
        ]),
      ],
    };
    const taskHistory =
      storedHistory && Array.isArray(storedHistory.goals) && Array.isArray(storedHistory.waste)
        ? storedHistory
        : derivedHistory;
    const lastReset = localStorage.getItem('lastResetDate');
    if (lastReset !== today) {
      const resetItems = {
        goals: storedItems.goals.map((item: Item) => ({ ...item, completed: false })),
        waste: storedItems.waste.map((item: Item) => ({ ...item, completed: false })),
      };
      localStorage.setItem('lastResetDate', today);
      return { items: resetItems, logs: storedLogs, taskHistory };
    }
    return { items: storedItems, logs: storedLogs, taskHistory };
  } catch {
    return emptyState;
  }
};

type SkipState = {
  date: string;
  goals: string[];
  waste: string[];
};

const SKIP_KEY = 'goalsSkippedTasks';
const loadSkipState = (): SkipState => {
  const today = new Date().toDateString();
  try {
    const raw = localStorage.getItem(SKIP_KEY);
    if (!raw) {
      return { date: today, goals: [], waste: [] };
    }
    const parsed = JSON.parse(raw) as SkipState;
    if (!parsed || parsed.date !== today) {
      return { date: today, goals: [], waste: [] };
    }
    return {
      date: parsed.date,
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      waste: Array.isArray(parsed.waste) ? parsed.waste : [],
    };
  } catch {
    return { date: today, goals: [], waste: [] };
  }
};

const App: React.FC = () => {
  const [tab, setTab] = useState<'goals' | 'waste' | 'log'>('goals');
  const initialStateRef = useRef(loadStoredState());
  const [items, setItems] = useState<{ goals: Item[]; waste: Item[] }>(() => initialStateRef.current.items);
  const [input, setInput] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [timers, setTimers] = useState<{ [key: string]: TimerState }>({});
  const [logs, setLogs] = useState<LogEntry[]>(() => initialStateRef.current.logs);
  const [taskHistory, setTaskHistory] = useState<{ goals: string[]; waste: string[] }>(
    () => initialStateRef.current.taskHistory
  );
  const [skipState, setSkipState] = useState<SkipState>(() => loadSkipState());
  const [logTaskFilter, setLogTaskFilter] = useState('all');
  const [logTimeFilter, setLogTimeFilter] = useState<
    'all' | 'today' | '7d' | '30d' | '3m' | '6m' | '1y'
  >('all');
  const [showTrends, setShowTrends] = useState(false);
  const [showLogScrollTop, setShowLogScrollTop] = useState(false);
  const [isLogScrollTopHover, setIsLogScrollTopHover] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [timerPopupItemId, setTimerPopupItemId] = useState<string | null>(null);
  const [timerPopupMode, setTimerPopupMode] = useState<'duration' | 'target' | 'stopwatch'>('duration');
  const [timerPopupMinutes, setTimerPopupMinutes] = useState(30);
  const [timerPopupHour, setTimerPopupHour] = useState('12');
  const [timerPopupMinute, setTimerPopupMinute] = useState('00');
  const [timerPopupPeriod, setTimerPopupPeriod] = useState<'AM' | 'PM'>('AM');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showManageTasks, setShowManageTasks] = useState(false);
  const [showStartupHelp, setShowStartupHelp] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: 300, height: 350 });
  const [windowPosition, setWindowPosition] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [savedWindow, setSavedWindow] = useState<{ width: number; height: number; x: number | null; y: number | null }>({
    width: 300,
    height: 350,
    x: null,
    y: null,
  });
  const [showSetConfirm, setShowSetConfirm] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'sand' | 'gray' | 'white'>(() => {
    const storedTheme = localStorage.getItem('goalsTheme');
    if (storedTheme === 'dark' || storedTheme === 'sand' || storedTheme === 'gray' || storedTheme === 'white') {
      return storedTheme;
    }
    return 'dark';
  });
  const [showMusic, setShowMusic] = useState(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const logScrollTimeoutRef = useRef<number | null>(null);
  const logListRef = useRef<HTMLDivElement>(null);
  const lastLogRef = useRef<{ [key: string]: { time: number; duration: number } }>({});

  // Timer interval
  useEffect(() => {
    if (timerIntervalRef.current !== null) {
      return;
    }
    timerIntervalRef.current = window.setInterval(() => {
      const logsToAdd: LogEntry[] = [];
      setTimers(prev => {
        const nowSec = Math.floor(Date.now() / 1000);
        if (nowSec === lastTickRef.current) {
          return prev;
        }
        lastTickRef.current = nowSec;
        const updated = { ...prev };
        Object.keys(updated).forEach(id => {
          const timer = updated[id];
          if (!timer.isRunning) {
            return;
          }
          if (timer.mode === 'countdown') {
            const remaining = Math.max(0, (timer.remainingSeconds ?? 0) - 1);
            timer.remainingSeconds = remaining;
            timer.elapsedSeconds = (timer.elapsedSeconds ?? 0) + 1;
            if (remaining === 0) {
              timer.isRunning = false;
              const duration = timer.elapsedSeconds ?? 0;
              if (duration > 0) {
                logsToAdd.push(buildLogEntryFromFields(id, timer.itemText, timer.tab, duration));
              }
              timer.startRemaining = undefined;
            }
          } else {
            timer.seconds += 1;
          }
        });
        return updated;
      });
      if (logsToAdd.length > 0) {
        setLogs(prev => [...prev, ...logsToAdd]);
      }
    }, 1000);
    return () => {
      if (timerIntervalRef.current !== null) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, []);

  // Focus input when modal opens
  useEffect(() => {
    if (showAddModal) {
      requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
    }
  }, [showAddModal]);

  // Auto-save to localStorage
  useEffect(() => {
    localStorage.setItem('goalsTrackerData', JSON.stringify({ items, logs, taskHistory }));
  }, [items, logs, taskHistory]);

  useEffect(() => {
    localStorage.setItem(SKIP_KEY, JSON.stringify(skipState));
  }, [skipState]);

  useEffect(() => {
    localStorage.setItem('goalsTheme', theme);
  }, [theme]);

  useEffect(() => {
    if (!window.electronAPI?.getWindowSettings) return;
    window.electronAPI.getWindowSettings().then(settings => {
      setWindowSize({ width: settings.windowWidth, height: settings.windowHeight });
      setWindowPosition({ x: settings.windowX, y: settings.windowY });
      setSavedWindow({
        width: settings.windowWidth,
        height: settings.windowHeight,
        x: settings.windowX,
        y: settings.windowY,
      });
    });
  }, []);

  useEffect(() => {
    const unsubscribeResize = window.electronAPI?.onWindowResized?.((bounds) => {
      setWindowSize({ width: bounds.width, height: bounds.height });
      setWindowPosition({ x: bounds.x ?? null, y: bounds.y ?? null });
    });
    const unsubscribeMove = window.electronAPI?.onWindowMoved?.((bounds) => {
      setWindowPosition({ x: bounds.x ?? null, y: bounds.y ?? null });
    });
    return () => {
      if (unsubscribeResize) unsubscribeResize();
      if (unsubscribeMove) unsubscribeMove();
    };
  }, []);

  const isTaskTab = tab === 'goals' || tab === 'waste';

  useEffect(() => {
    if (!isTaskTab) {
      setShowAddModal(false);
      setShowSuggestions(false);
      setShowLinkInput(false);
    }
  }, [isTaskTab]);

  useEffect(() => {
    return () => {
      if (logScrollTimeoutRef.current !== null) {
        window.clearTimeout(logScrollTimeoutRef.current);
        logScrollTimeoutRef.current = null;
      }
    };
  }, []);

  const addItem = () => {
    if (!input.trim()) return;
    if (!isTaskTab) return;

    const normalizedText = input.trim();
    const newItem: Item = {
      id: Date.now().toString(),
      text: normalizedText,
      completed: false,
      createdDate: new Date().toDateString(),
      link: linkInput.trim() || undefined,
      schedule: {
        type: 'daily',
        anchorDate: new Date().toISOString().slice(0, 10),
      },
    };

    const activeTab: 'goals' | 'waste' = tab;
    const newItems = {
      ...items,
      [activeTab]: [...items[activeTab], newItem],
    };

    setItems(newItems);
    setTaskHistory(prev => {
      const existing = new Set(prev[activeTab].map(text => text.toLowerCase()));
      if (existing.has(normalizedText.toLowerCase())) {
        return prev;
      }
      return {
        ...prev,
        [activeTab]: [normalizedText, ...prev[activeTab]],
      };
    });
    setInput('');
    setLinkInput('');
    setShowLinkInput(false);
    setShowAddModal(false);
    setShowSuggestions(false);
  };

  const appendLogEntry = (entry: LogEntry) => {
    const now = Date.now();
    const last = lastLogRef.current[entry.itemId];
    if (last && now - last.time < 1500 && last.duration === entry.durationSeconds) {
      return;
    }
    lastLogRef.current[entry.itemId] = { time: now, duration: entry.durationSeconds };
    setLogs(prev => [...prev, entry]);
  };

  const buildLogEntry = (item: Item, durationSeconds: number, entryTab: 'goals' | 'waste') => {
    const endTime = Date.now();
    const startTime = endTime - durationSeconds * 1000;
    return {
      id: `${endTime}-${item.id}`,
      itemId: item.id,
      itemText: item.text,
      tab: entryTab,
      startISO: new Date(startTime).toISOString(),
      endISO: new Date(endTime).toISOString(),
      durationSeconds,
    };
  };

  const buildLogEntryFromFields = (itemId: string, itemText: string, entryTab: 'goals' | 'waste', durationSeconds: number) => {
    const endTime = Date.now();
    const startTime = endTime - durationSeconds * 1000;
    return {
      id: `${endTime}-${itemId}`,
      itemId,
      itemText,
      tab: entryTab,
      startISO: new Date(startTime).toISOString(),
      endISO: new Date(endTime).toISOString(),
      durationSeconds,
    };
  };

  const getTimerDuration = (timer?: TimerState) => {
    if (!timer) return null;
    if (timer.mode === 'countdown') {
      return timer.elapsedSeconds ?? 0;
    }
    return timer.seconds;
  };

  const toggleComplete = (id: string) => {
    if (!isTaskTab) return;
    const item = items[tab].find(i => i.id === id);
    if (!item) return;

    if (item.completed) {
      completeTask(id);
    } else {
      completeTask(id);
    }
  };

  const completeTask = (id: string) => {
    if (!isTaskTab) return;
    const timer = timers[id];
    const item = items[tab].find(i => i.id === id);
    const entryTab: 'goals' | 'waste' = timer?.tab ?? (tab === 'waste' ? 'waste' : 'goals');
    const willComplete = item ? !item.completed : false;
    if (item && willComplete) {
      const duration = timer ? getTimerDuration(timer) : null;
      if (duration && duration > 0) {
        appendLogEntry(buildLogEntry(item, duration, entryTab));
      } else {
        appendLogEntry(buildLogEntry(item, 0, entryTab));
      }
    }
    const timerSeconds =
      timer?.mode === 'countdown'
        ? timer?.elapsedSeconds
        : timer?.seconds;
    const updatedList = items[tab].map((item) =>
      item.id === id
        ? {
            ...item,
            completed: !item.completed,
            elapsedSeconds: timerSeconds ?? item.elapsedSeconds,
          }
        : item
    );

    const toggledItem = updatedList.find(entry => entry.id === id);
    const rest = updatedList.filter(entry => entry.id !== id);
    const incomplete = rest.filter(entry => !entry.completed);
    const completed = rest.filter(entry => entry.completed);
    if (toggledItem) {
      if (toggledItem.completed) {
        completed.push(toggledItem);
      } else {
        incomplete.push(toggledItem);
      }
    }

    const newItems = { ...items, [tab]: [...incomplete, ...completed] };

    setItems(newItems);
    
    // Clear timer
    setTimers(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  };

  const pauseResumeTimer = (id: string) => {
    if (!isTaskTab) return;
    setTimers(prev => {
      const current = prev[id];
      if (!current) return prev;
      if (current.isRunning) {
        return {
          ...prev,
          [id]: { ...current, isRunning: false, startSeconds: undefined, startRemaining: undefined }
        };
      }
      return {
        ...prev,
        [id]: {
          ...current,
          isRunning:
            current.mode === 'countdown' && typeof current.targetTimeMs === 'number'
              ? Math.max(0, Math.ceil((current.targetTimeMs - Date.now()) / 1000)) > 0
              : true,
          startSeconds: current.mode === 'stopwatch' ? current.seconds : undefined,
          startRemaining: current.mode === 'countdown' ? current.remainingSeconds : undefined,
          remainingSeconds:
            current.mode === 'countdown' && typeof current.targetTimeMs === 'number'
              ? Math.max(0, Math.ceil((current.targetTimeMs - Date.now()) / 1000))
              : current.remainingSeconds,
        }
      };
    });
  };

  const openTimerPopup = (item: Item) => {
    const timer = timers[item.id];
    const defaultMinutes = timer?.mode === 'countdown' && typeof timer.remainingSeconds === 'number'
      ? Math.max(1, Math.ceil(timer.remainingSeconds / 60))
      : 30;
    const now = new Date();
    const target = new Date(now);
    if (now.getMinutes() <= 30) {
      target.setHours(now.getHours() + 1, 0, 0, 0);
    } else {
      target.setHours(now.getHours() + 1, 30, 0, 0);
    }
    const hour12 = target.getHours() % 12 || 12;
    const minute = target.getMinutes();
    setTimerPopupItemId(item.id);
    setTimerPopupMode('duration');
    setTimerPopupMinutes(defaultMinutes);
    setTimerPopupHour(hour12.toString());
    setTimerPopupMinute(minute.toString().padStart(2, '0'));
    setTimerPopupPeriod(target.getHours() >= 12 ? 'PM' : 'AM');
  };

  const closeTimerPopup = () => {
    setTimerPopupItemId(null);
  };

  const clampMinutes = (value: number) => Math.min(24 * 60, Math.max(1, value));

  const applyTimer = () => {
    if (!isTaskTab || !timerPopupItemId) return;
    const item = items[tab].find(i => i.id === timerPopupItemId);
    if (!item || item.completed) return;

    let durationSeconds = 0;
    if (timerPopupMode === 'duration') {
      durationSeconds = clampMinutes(timerPopupMinutes) * 60;
    } else if (timerPopupMode === 'target') {
      const rawHour = parseInt(timerPopupHour, 10);
      const rawMinute = parseInt(timerPopupMinute, 10);
      const hour = Number.isNaN(rawHour) ? 12 : Math.min(12, Math.max(1, rawHour));
      const minute = Number.isNaN(rawMinute) ? 0 : Math.min(59, Math.max(0, rawMinute));
      const hour24 = timerPopupPeriod === 'PM' ? (hour % 12) + 12 : hour % 12;
      const now = new Date();
      const target = new Date(now);
      target.setHours(hour24, minute, 0, 0);
      if (target <= now) {
        target.setDate(target.getDate() + 1);
      }
      durationSeconds = Math.max(60, Math.round((target.getTime() - now.getTime()) / 1000));
      const targetTimeMs = target.getTime();

      setTimers(prev => ({
        ...prev,
        [item.id]: {
          mode: 'countdown',
          seconds: 0,
          remainingSeconds: durationSeconds,
          totalSeconds: durationSeconds,
          elapsedSeconds: 0,
          targetTimeMs,
          isRunning: true,
          startRemaining: durationSeconds,
          itemText: item.text,
          tab,
        },
      }));

      closeTimerPopup();
      return;
    } else {
      setTimers(prev => ({
        ...prev,
        [item.id]: {
          mode: 'stopwatch',
          seconds: 0,
          isRunning: true,
          startSeconds: 0,
          itemText: item.text,
          tab,
        },
      }));
      closeTimerPopup();
      return;
    }

    setTimers(prev => ({
      ...prev,
      [item.id]: {
        mode: 'countdown',
        seconds: 0,
        remainingSeconds: durationSeconds,
        totalSeconds: durationSeconds,
        elapsedSeconds: 0,
        isRunning: true,
        startRemaining: durationSeconds,
        itemText: item.text,
        tab,
      },
    }));

    closeTimerPopup();
  };

  const deleteItem = (id: string) => {
    if (!isTaskTab) return;
    const todayStr = new Date().toDateString();
    setSkipState(prev => {
      const base = prev.date === todayStr ? prev : { date: todayStr, goals: [], waste: [] };
      const ids = new Set(base[tab]);
      ids.add(id);
      return { ...base, [tab]: Array.from(ids) };
    });
    setTimers(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  };

  const deleteTaskPermanently = (tabName: 'goals' | 'waste', id: string, text: string) => {
    setItems(prev => ({
      ...prev,
      [tabName]: prev[tabName].filter(item => item.id !== id),
    }));
    setLogs(prev => prev.filter(entry => entry.itemId !== id));
    setTaskHistory(prev => ({
      ...prev,
      [tabName]: prev[tabName].filter(entry => entry.toLowerCase() !== text.toLowerCase()),
    }));
  };

  const deleteLogEntry = (id: string) => {
    setLogs(prev => prev.filter(entry => entry.id !== id));
  };

  const reorderItems = (activeTab: 'goals' | 'waste', sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setItems(prev => {
      const list = prev[activeTab].slice();
      const source = list.find(item => item.id === sourceId);
      const target = list.find(item => item.id === targetId);
      if (!source || source.completed) return prev;

      const incomplete = list.filter(item => !item.completed && item.id !== sourceId);
      const completed = list.filter(item => item.completed);

      if (!target || target.completed) {
        incomplete.push(source);
        return { ...prev, [activeTab]: [...incomplete, ...completed] };
      }

      const toIndex = incomplete.findIndex(item => item.id === targetId);
      if (toIndex < 0) return prev;
      incomplete.splice(toIndex, 0, source);
      return { ...prev, [activeTab]: [...incomplete, ...completed] };
    });
  };

  const getDateOnly = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const toISODate = (date: Date) => date.toISOString().slice(0, 10);
  const getAnchorDate = (item: Item) => {
    const anchor = item.schedule?.anchorDate;
    if (anchor) return new Date(anchor);
    const parsed = new Date(item.createdDate);
    if (!Number.isNaN(parsed.getTime())) return getDateOnly(parsed);
    return getDateOnly(new Date());
  };
  const isItemScheduledForDate = (item: Item, date: Date) => {
    const schedule = item.schedule;
    if (!schedule) return true;
    const today = getDateOnly(date);
    const anchor = getDateOnly(getAnchorDate(item));
    const diffDays = Math.floor((today.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
    const weekday = today.getDay();

    switch (schedule.type) {
      case 'daily':
        return true;
      case 'weekdays':
        return weekday >= 1 && weekday <= 5;
      case 'weekends':
        return weekday === 0 || weekday === 6;
      case 'custom-days':
        return Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek.includes(weekday) : true;
      case 'every-other-day':
        return diffDays % 2 === 0;
      case 'every-3-days':
        return diffDays % 3 === 0;
      case 'weekly': {
        const days = schedule.daysOfWeek ?? [anchor.getDay()];
        const weeks = Math.floor(diffDays / 7);
        return weeks >= 0 && days.includes(weekday);
      }
      case 'biweekly': {
        const days = schedule.daysOfWeek ?? [anchor.getDay()];
        const weeks = Math.floor(diffDays / 7);
        return weeks >= 0 && weeks % 2 === 0 && days.includes(weekday);
      }
      case 'monthly': {
        const targetDate = schedule.date ? new Date(schedule.date) : anchor;
        return today.getDate() === targetDate.getDate();
      }
      case 'specific-date':
        return schedule.date ? schedule.date === toISODate(today) : false;
      default:
        return true;
    }
  };

  const today = new Date();
  const todayStr = today.toDateString();
  const isSkippedToday = (id: string, activeTab: 'goals' | 'waste') =>
    skipState.date === todayStr && skipState[activeTab].includes(id);
  const currentItems = isTaskTab
    ? items[tab].filter(item => isItemScheduledForDate(item, today) && !isSkippedToday(item.id, tab))
    : [];

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getHoursMinutes = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return { hrs, mins };
  };


  const formatDurationShort = (seconds: number) => {
    if (seconds < 60) return `${Math.max(0, Math.round(seconds))} sec`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')} hrs`;
  };

  const formatLogDateTime = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .format(date)
      .replace(',', ' -');
  };

  const formatPercent = (value: number) => {
    const rounded = Math.round(Math.abs(value));
    return `${rounded}%`;
  };

  const filteredLogs = (() => {
    let result = logs;
    if (logTaskFilter !== 'all') {
      if (logTaskFilter === 'goals') {
        result = result.filter(entry => entry.tab === 'goals');
      } else if (logTaskFilter === 'waste') {
        result = result.filter(entry => entry.tab === 'waste');
      } else {
        result = result.filter(entry => entry.itemId === logTaskFilter);
      }
    }
    if (logTimeFilter !== 'all') {
      const now = new Date();
      let cutoff = new Date(0);
      if (logTimeFilter === 'today') {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (logTimeFilter === '7d') {
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (logTimeFilter === '30d') {
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (logTimeFilter === '3m') {
        cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      } else if (logTimeFilter === '6m') {
        cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      } else if (logTimeFilter === '1y') {
        cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      }
      result = result.filter(entry => new Date(entry.endISO) >= cutoff);
    }
    return result;
  })();

  const buildTrendSummary = useMemo(() => {
    const now = new Date();
    const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const getWeekStartMonday = (date: Date) => {
      const day = date.getDay(); // 0=Sun, 1=Mon
      const diff = day === 0 ? -6 : 1 - day;
      return startOfDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() + diff));
    };
    const weekStart = getWeekStartMonday(now);
    const prevWeekStart = startOfDay(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7));

    const summarizeTab = (tabName: 'goals' | 'waste') => {
      const entries = filteredLogs.filter(entry => entry.tab === tabName);
      const totalSeconds = entries.reduce((sum, entry) => sum + entry.durationSeconds, 0);
      const dayKeys = new Set(entries.map(entry => {
        const date = new Date(entry.endISO);
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      }));
      const activeDays = dayKeys.size;
      const avgPerDaySeconds = activeDays > 0 ? totalSeconds / activeDays : 0;

      const currentWeekSeconds = entries.reduce((sum, entry) => {
        const end = new Date(entry.endISO);
        return end >= weekStart ? sum + entry.durationSeconds : sum;
      }, 0);

      const prevWeekSeconds = entries.reduce((sum, entry) => {
        const end = new Date(entry.endISO);
        if (end >= prevWeekStart && end < weekStart) {
          return sum + entry.durationSeconds;
        }
        return sum;
      }, 0);

      const currentWeekDayKeys = new Set(entries.filter(entry => new Date(entry.endISO) >= weekStart).map(entry => {
        const date = new Date(entry.endISO);
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      }));

      return {
        totalSeconds,
        avgPerDaySeconds,
        activeDays,
        currentWeekSeconds,
        prevWeekSeconds,
        currentWeekActiveDays: currentWeekDayKeys.size,
      };
    };

    const goalsStats = summarizeTab('goals');
    const wasteStats = summarizeTab('waste');

    const makeDelta = (current: number, previous: number) => {
      if (previous <= 0) return null;
      return ((current - previous) / previous) * 100;
    };

    const goalsDelta = makeDelta(goalsStats.currentWeekSeconds, goalsStats.prevWeekSeconds);
    const wasteDelta = makeDelta(wasteStats.currentWeekSeconds, wasteStats.prevWeekSeconds);

    const goalsPros: string[] = [];
    const goalsCons: string[] = [];
    const wastePros: string[] = [];
    const wasteCons: string[] = [];

    if (goalsStats.totalSeconds === 0) {
      goalsCons.push('No goal sessions logged for the current filters.');
    } else {
      goalsPros.push(`Avg goal time: ${formatDurationShort(goalsStats.avgPerDaySeconds)} per active day.`);
      if (goalsDelta !== null) {
        if (goalsDelta > 0) {
          goalsPros.push(`Goal time up ${formatPercent(goalsDelta)} vs last week.`);
        } else if (goalsDelta < 0) {
          goalsCons.push(`Goal time down ${formatPercent(goalsDelta)} vs last week.`);
        }
      } else if (goalsStats.currentWeekSeconds > 0) {
        goalsPros.push(`Goal time started this week: ${formatDurationShort(goalsStats.currentWeekSeconds)} logged.`);
      }

      if (goalsStats.currentWeekActiveDays > 0) {
        goalsPros.push(`Logged ${goalsStats.currentWeekActiveDays} day${goalsStats.currentWeekActiveDays === 1 ? '' : 's'} this week.`);
      }
    }

    if (wasteStats.totalSeconds === 0) {
      wastePros.push('No waste sessions logged for the current filters.');
    } else {
      wastePros.push(`Avg waste time: ${formatDurationShort(wasteStats.avgPerDaySeconds)} per active day.`);
      if (wasteDelta !== null) {
        if (wasteDelta < 0) {
          wastePros.push(`Waste time down ${formatPercent(wasteDelta)} vs last week.`);
        } else if (wasteDelta > 0) {
          wasteCons.push(`Waste time up ${formatPercent(wasteDelta)} vs last week.`);
        }
      } else if (wasteStats.currentWeekSeconds > 0) {
        wasteCons.push(`Waste time started this week: ${formatDurationShort(wasteStats.currentWeekSeconds)} logged.`);
      }
    }

    const totalDelta = goalsStats.totalSeconds - wasteStats.totalSeconds;
    if (goalsStats.totalSeconds > 0 || wasteStats.totalSeconds > 0) {
      if (totalDelta >= 0) {
        goalsPros.push(`Goals outweigh waste by ${formatDurationShort(totalDelta)} total.`);
      } else {
        wasteCons.push(`Waste outweighs goals by ${formatDurationShort(Math.abs(totalDelta))} total.`);
      }
    }

    if (goalsStats.totalSeconds > 0 && wasteStats.totalSeconds > 0) {
      const ratio = goalsStats.totalSeconds / wasteStats.totalSeconds;
      const rounded = ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10;
      if (ratio >= 1) {
        goalsPros.push(`Goal-to-waste ratio: ${rounded}x.`);
      } else {
        const inv = wasteStats.totalSeconds / goalsStats.totalSeconds;
        const invRounded = inv >= 10 ? Math.round(inv) : Math.round(inv * 10) / 10;
        wasteCons.push(`Waste-to-goal ratio: ${invRounded}x.`);
      }
    }

    return {
      goals: { pros: goalsPros, cons: goalsCons },
      waste: { pros: wastePros, cons: wasteCons },
    };
  }, [filteredLogs]);

  const taskOptions = useMemo(() => {
    const map = new Map<string, string>();
    items.goals.forEach(item => map.set(item.id, `${item.text} • Goals`));
    items.waste.forEach(item => map.set(item.id, `${item.text} • Waste`));
    logs.forEach(entry => {
      if (!map.has(entry.itemId)) {
        const label = `${entry.itemText} • ${entry.tab === 'goals' ? 'Goals' : 'Waste'}`;
        map.set(entry.itemId, label);
      }
    });
    return [
      { id: 'goals', label: 'All Goals' },
      { id: 'waste', label: 'All Waste' },
      ...Array.from(map.entries()).map(([id, label]) => ({ id, label })),
    ];
  }, [items, logs]);

  

  const logSummary = (() => {
    const totalSeconds = filteredLogs.reduce((sum, entry) => sum + entry.durationSeconds, 0);
    const completedCount = filteredLogs.length;
    const completionLabel = (() => {
      if (logTaskFilter === 'all') return 'Tasks completed';
      if (logTaskFilter === 'goals') return 'Goals completed';
      if (logTaskFilter === 'waste') return 'Waste completed';
      const matchGoal = items.goals.find(item => item.id === logTaskFilter);
      const matchWaste = items.waste.find(item => item.id === logTaskFilter);
      const match = matchGoal ?? matchWaste;
      if (match) {
        const words = match.text.trim().split(/\\s+/);
        const prefix = words.slice(0, 2).join(' ');
        return `${prefix}... completed`;
      }
      return 'Tasks completed';
    })();
    return {
      totalSeconds,
      completedCount,
      completionLabel,
    };
  })();

  const suggestions = useMemo(() => {
    if (!isTaskTab) return [];
    const activeTab: 'goals' | 'waste' = tab;
    const currentSet = new Set(items[activeTab].map(item => item.text.toLowerCase()));
    const base = taskHistory[activeTab].filter(text => !currentSet.has(text.toLowerCase()));
    if (!input.trim()) return base;
    const needle = input.trim().toLowerCase();
    return base.filter(text => text.toLowerCase().includes(needle));
  }, [isTaskTab, tab, items, taskHistory, input]);

  const isTimerPopupOpen = timerPopupItemId !== null;

  return (
    <div className={`app theme-${theme}${isTimerPopupOpen ? ' timer-popup-open' : ''}`}>
      <div className="header">
        <h1 className="title">
          {tab === 'goals' ? 'Goals' : tab === 'waste' ? 'Waste' : 'Log'}
        </h1>
        <button
          className="settings-btn"
          onClick={() => setShowSettings(true)}
          title="Settings"
        >
          <FiSettings />
        </button>
        {isTaskTab && (
          <button 
            className="add-btn-header add-btn-offset"
            onClick={() => setShowAddModal(true)}
            title="Add new item"
          >
            <FiPlus />
          </button>
        )}
        <div className="window-controls">
          <button 
            className="window-btn minimize-btn"
            onClick={() => window.electronAPI?.minimizeWindow()}
            title="Minimize"
          >
            <FiMinus />
          </button>
          <button 
            className="window-btn close-btn"
            onClick={() => window.electronAPI?.closeWindow()}
            title="Close"
          >
            <FiX />
          </button>
        </div>
      </div>

      <div className={`content${isTimerPopupOpen ? ' no-scroll' : ''}`}>
        {isTaskTab ? (
          <div className="items-list">
            {currentItems.length === 0 ? (
              <div className="empty-state">
                <p>No {tab} yet</p>
                <p className="empty-hint">Add one to get started</p>
              </div>
            ) : (
              currentItems.map((item) => (
              <div
                key={item.id}
                className={`item-card ${item.completed ? 'completed' : ''}${dragOverId === item.id ? ' drag-over' : ''}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', item.id);
                  event.dataTransfer.effectAllowed = 'move';
                  setDraggingId(item.id);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverId(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (draggingId && draggingId !== item.id && !item.completed) {
                    setDragOverId(item.id);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverId === item.id) {
                    setDragOverId(null);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceId = event.dataTransfer.getData('text/plain');
                  if (sourceId) {
                    const activeTab: 'goals' | 'waste' = tab === 'waste' ? 'waste' : 'goals';
                    reorderItems(activeTab, sourceId, item.id);
                  }
                  setDragOverId(null);
                }}
              >
                <button
                  className="check-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleComplete(item.id);
                  }}
                  title={item.completed ? 'Mark incomplete' : 'Start / Complete'}
                >
                  {item.completed ? <FiCheck /> : <div className="unchecked" />}
                </button>
                {item.link ? (
                  <button
                    className="item-text item-link"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      window.open(item.link as string, '_blank', 'noopener,noreferrer');
                    }}
                    title={item.link}
                  >
                    <span className="item-text-inner">{item.text}</span>
                  </button>
                ) : (
                  <span className="item-text">
                    <span className="item-text-inner">{item.text}</span>
                  </span>
                )}
                <div className="item-actions">
                  <button
                    className="timer-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (timers[item.id]) {
                        pauseResumeTimer(item.id);
                      } else {
                        openTimerPopup(item);
                      }
                    }}
                    title={timers[item.id] ? (timers[item.id].isRunning ? 'Pause' : 'Resume') : 'Set timer'}
                  >
                    {timers[item.id]
                      ? (timers[item.id].isRunning ? <FiPause /> : <FiPlay />)
                      : <FiClock />
                    }
                  </button>
                  {timers[item.id] ? (
                    <div
                      className="timer-display"
                      title={timers[item.id].isRunning ? 'Running' : 'Paused'}
                    >
                      {timers[item.id].mode === 'countdown'
                        ? formatTime(timers[item.id].remainingSeconds ?? 0)
                        : formatTime(timers[item.id].seconds)}
                    </div>
                  ) : (
                    <button
                      className="delete-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteItem(item.id);
                      }}
                      title="Delete"
                    >
                      <FiTrash2 />
                    </button>
                  )}
                </div>
                {timerPopupItemId === item.id && (
                  <div
                    className="timer-popup"
                    role="dialog"
                    aria-modal="true"
                    onClick={(event) => event.stopPropagation()}
                    onWheel={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    <div className="timer-popup-header">
                      <span>Timer</span>
                      <button className="timer-popup-close" onClick={closeTimerPopup} title="Close">
                        <FiX />
                      </button>
                    </div>
                    <div className="timer-mode-toggle">
                      <button
                        className={`timer-mode-btn ${timerPopupMode === 'duration' ? 'active' : ''}`}
                        type="button"
                        onClick={() => setTimerPopupMode('duration')}
                      >
                        Duration
                      </button>
                      <button
                        className={`timer-mode-btn ${timerPopupMode === 'target' ? 'active' : ''}`}
                        type="button"
                        onClick={() => setTimerPopupMode('target')}
                      >
                        Target time
                      </button>
                      <button
                        className={`timer-mode-btn ${timerPopupMode === 'stopwatch' ? 'active' : ''}`}
                        type="button"
                        onClick={() => setTimerPopupMode('stopwatch')}
                      >
                        Stopwatch
                      </button>
                    </div>
                    {timerPopupMode === 'duration' ? (
                      <div className="timer-duration">
                        <div
                          className="timer-minutes"
                          onWheel={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const delta = event.deltaY < 0 ? 1 : -1;
                            setTimerPopupMinutes(prev => clampMinutes(prev + delta));
                          }}
                        >
                          <span className="timer-minutes-value">{timerPopupMinutes}</span>
                          <span className="timer-minutes-label">min</span>
                        </div>
                        <p className="timer-wheel-hint">Scroll to adjust</p>
                      </div>
                    ) : timerPopupMode === 'target' ? (
                      <div className="timer-target">
                        <div className="timer-target-row">
                          <input
                            className="timer-target-input"
                            type="number"
                            min={1}
                            max={12}
                            value={timerPopupHour}
                            onChange={(event) => setTimerPopupHour(event.target.value)}
                            onWheel={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const current = parseInt(timerPopupHour, 10);
                              const safeCurrent = Number.isNaN(current) ? 12 : current;
                              const delta = event.deltaY < 0 ? 1 : -1;
                              let next = safeCurrent + delta;
                              if (next > 12) next = 1;
                              if (next < 1) next = 12;
                              if (
                                (safeCurrent === 11 && next === 12 && delta === 1) ||
                                (safeCurrent === 12 && next === 11 && delta === -1)
                              ) {
                                setTimerPopupPeriod(prev => (prev === 'AM' ? 'PM' : 'AM'));
                              }
                              setTimerPopupHour(next.toString());
                            }}
                          />
                          <span className="timer-target-sep">:</span>
                          <input
                            className="timer-target-input"
                            type="number"
                            min={0}
                            max={59}
                            value={timerPopupMinute}
                            onChange={(event) => setTimerPopupMinute(event.target.value)}
                            onWheel={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const current = parseInt(timerPopupMinute, 10);
                              const safeCurrent = Number.isNaN(current) ? 0 : current;
                              const delta = event.deltaY < 0 ? 1 : -1;
                              let next = safeCurrent + delta;
                              if (next > 59) next = 0;
                              if (next < 0) next = 59;
                              setTimerPopupMinute(next.toString().padStart(2, '0'));
                            }}
                          />
                          <div className="timer-target-period">
                            <button
                              className={`timer-period-btn ${timerPopupPeriod === 'AM' ? 'active' : ''}`}
                              type="button"
                              onClick={() => setTimerPopupPeriod('AM')}
                            >
                              AM
                            </button>
                            <button
                              className={`timer-period-btn ${timerPopupPeriod === 'PM' ? 'active' : ''}`}
                              type="button"
                              onClick={() => setTimerPopupPeriod('PM')}
                            >
                              PM
                            </button>
                          </div>
                        </div>
                        <p className="timer-wheel-hint">Counts down to the next matching time</p>
                      </div>
                    ) : (
                      <div className="timer-duration">
                        <div className="timer-minutes">
                          <span className="timer-minutes-value">00</span>
                          <span className="timer-minutes-label">sec</span>
                        </div>
                        <p className="timer-wheel-hint">Starts a stopwatch</p>
                      </div>
                    )}
                    <div className="timer-popup-actions">
                      <button className="timer-popup-cancel" type="button" onClick={closeTimerPopup}>
                        Cancel
                      </button>
                      <button className="timer-popup-start" type="button" onClick={applyTimer}>
                        Start
                      </button>
                    </div>
                  </div>
                )}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="log-view">
            <div
              className="log-list"
              ref={logListRef}
              onScroll={() => {
                setShowLogScrollTop(true);
                if (logScrollTimeoutRef.current !== null) {
                  window.clearTimeout(logScrollTimeoutRef.current);
                }
                logScrollTimeoutRef.current = window.setTimeout(() => {
                  if (!isLogScrollTopHover) {
                    setShowLogScrollTop(false);
                  }
                }, 1000);
              }}
            >
              <div className="log-controls">
                <select
                  className="log-select"
                  value={logTaskFilter}
                  onChange={(e) => setLogTaskFilter(e.target.value)}
                >
                  <option value="all">All tasks</option>
                  <option value="goals">Goals</option>
                  <option value="waste">Waste</option>
                  {taskOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  className="log-select"
                  value={logTimeFilter}
                  onChange={(e) =>
                    setLogTimeFilter(e.target.value as 'all' | 'today' | '7d' | '30d' | '3m' | '6m' | '1y')
                  }
                >
                  <option value="all">All time</option>
                  <option value="today">Today</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="3m">Last 3 months</option>
                  <option value="6m">Last 6 months</option>
                  <option value="1y">Last 1 year</option>
                </select>
              </div>

              <div className="log-summary">
                <div className="log-summary-item">
                  <span className="log-summary-label">Total time</span>
                  <span className="log-summary-value">
                    <span className="summary-line">{getHoursMinutes(logSummary.totalSeconds).hrs} hrs</span>
                    <span className="summary-line">{getHoursMinutes(logSummary.totalSeconds).mins} min</span>
                  </span>
                </div>
                <div className="log-summary-item">
                  <span className="log-summary-label">{logSummary.completionLabel}</span>
                  <span className="log-summary-value">{logSummary.completedCount}</span>
                </div>
              </div>

              <div className="log-trends-row">
                <button
                  className="trends-btn"
                  type="button"
                  onClick={() => setShowTrends(true)}
                >
                  Trends
                </button>
              </div>
              {filteredLogs.length === 0 ? (
                <div className="empty-state">
                  <p>No sessions yet</p>
                  <p className="empty-hint">Start a timer to see logs here</p>
                </div>
              ) : (
                filteredLogs
                  .slice()
                  .reverse()
                  .map(entry => (
                    <div key={entry.id} className="log-entry">
                      <div className="log-entry-main">
                        <span className="log-entry-title">{entry.itemText}</span>
                        <span className="log-entry-meta">
                          {entry.tab === 'goals' ? 'Goals' : 'Waste'} •{' '}
                          {formatLogDateTime(entry.endISO)}
                        </span>
                      </div>
                      <div className="log-entry-actions">
                        <button
                          className="log-entry-delete"
                          onClick={() => deleteLogEntry(entry.id)}
                          title="Delete log"
                        >
                          <FiTrash2 />
                        </button>
                        <span className="log-entry-duration">{formatDuration(entry.durationSeconds)}</span>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
      </div>

      {tab === 'log' && showTrends && (
        <>
          <div className="trends-backdrop" onClick={() => setShowTrends(false)} />
          <div className="trends-modal" role="dialog" aria-modal="true">
            <div className="trends-header">
              <h2>Trends</h2>
              <button
                className="trends-close"
                type="button"
                onClick={() => setShowTrends(false)}
                title="Close"
              >
                <FiX />
              </button>
            </div>
            <div className="trends-section">
              <h3>Goals</h3>
              <div className="trends-columns">
                <div>
                  <p className="trends-label pros">Pros</p>
                  <ul className="trends-list pros">
                    {buildTrendSummary.goals.pros.map(item => (
                      <li key={`goal-pro-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="trends-label cons">Cons</p>
                  <ul className="trends-list cons">
                    {buildTrendSummary.goals.cons.length === 0 ? (
                      <li>Nothing negative stands out.</li>
                    ) : (
                      buildTrendSummary.goals.cons.map(item => (
                        <li key={`goal-con-${item}`}>{item}</li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>

            <div className="trends-section">
              <h3>Waste</h3>
              <div className="trends-columns">
                <div>
                  <p className="trends-label pros">Pros</p>
                  <ul className="trends-list pros">
                    {buildTrendSummary.waste.pros.map(item => (
                      <li key={`waste-pro-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="trends-label cons">Cons</p>
                  <ul className="trends-list cons">
                    {buildTrendSummary.waste.cons.length === 0 ? (
                      <li>Nothing negative stands out.</li>
                    ) : (
                      buildTrendSummary.waste.cons.map(item => (
                        <li key={`waste-con-${item}`}>{item}</li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>
            <p className="trends-note">* Weeks start on Monday.</p>
          </div>
        </>
      )}

      {isTaskTab && (
        <>
          {timerPopupItemId && (
            <div
              className="timer-popup-backdrop"
              onClick={closeTimerPopup}
              onWheel={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onWheelCapture={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            />
          )}
          <div className={`add-modal ${showAddModal ? 'visible' : ''}`}>
            {showLinkInput && (
              <div className="modal-link-row">
                <input
                  type="text"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="Paste a link..."
                  className="modal-input modal-link-input"
                />
              </div>
            )}
            <div className="modal-input-row">
              <div className="modal-input-wrap">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    if (!showSuggestions) {
                      setShowSuggestions(true);
                    }
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') addItem();
                    if (e.key === 'Escape') {
                      setShowAddModal(false);
                      setInput('');
                      setShowSuggestions(false);
                      setShowLinkInput(false);
                      setLinkInput('');
                    }
                  }}
                  placeholder={`Add a new ${tab === 'goals' ? 'goal' : 'waste activity'}...`}
                  className="modal-input"
                />
                <button
                  className="history-toggle inside"
                  type="button"
                  onClick={() => setShowSuggestions((prev) => !prev)}
                  title="Task history"
                >
                  <FiChevronUp />
                </button>
              </div>
              <button
                className="link-toggle"
                type="button"
                onClick={() => setShowLinkInput((prev) => !prev)}
                title="Add link"
              >
                <FiLink />
              </button>
              {showSuggestions && suggestions.length > 0 && (
                <div className="history-dropdown">
                  {suggestions.map(text => (
                    <button
                      key={text}
                      className="history-option"
                      onClick={() => {
                        setInput(text);
                        setShowSuggestions(false);
                        inputRef.current?.focus({ preventScroll: true });
                      }}
                      type="button"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {showAddModal && (
            <div 
              className="modal-backdrop"
              onClick={() => {
                setShowAddModal(false);
                setInput('');
                setShowSuggestions(false);
                setShowLinkInput(false);
                setLinkInput('');
              }}
            />
          )}
        </>
      )}

      <MediaPlayer
        isOpen={showMusic}
        onClose={() => setShowMusic(false)}
        onPlayingChange={setIsMusicPlaying}
      />

      {showSettings && (
        <>
          <div className="settings-backdrop" onClick={() => setShowSettings(false)} />
          <div className="settings-modal" role="dialog" aria-modal="true">
            <div className="settings-header">
              <h2>Settings</h2>
              <button className="settings-close" onClick={() => setShowSettings(false)} title="Close">
                <FiX />
              </button>
            </div>
            <button
              className="settings-manage"
              type="button"
              onClick={() => setShowManageTasks(true)}
            >
              Manage tasks
            </button>
            <div className="settings-section">
              <h3>Theme</h3>
              <div className="theme-grid">
                {(['dark', 'sand', 'gray', 'white'] as const).map(option => (
                  <button
                    key={option}
                    className={`theme-chip ${theme === option ? 'active' : ''}`}
                    type="button"
                    onClick={() => setTheme(option)}
                  >
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-section">
              <h3>Window</h3>
              <div className="settings-row">
                <span className="settings-label">Current size</span>
                <span className="settings-value">{windowSize.width} x {windowSize.height}</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Current position</span>
                <span className="settings-value">
                  {windowPosition.x !== null && windowPosition.y !== null
                    ? `${windowPosition.x}, ${windowPosition.y}`
                    : 'Not set'}
                </span>
              </div>
              <div className="settings-actions">
                <button
                  className="settings-btn-primary"
                  type="button"
                  onClick={() => {
                    const x = windowPosition.x ?? 0;
                    const y = windowPosition.y ?? 0;
                    window.electronAPI?.saveWindowSettings?.(windowSize.width, windowSize.height, x, y);
                    setSavedWindow({ width: windowSize.width, height: windowSize.height, x, y });
                    setShowSetConfirm(true);
                    window.setTimeout(() => setShowSetConfirm(false), 1000);
                  }}
                >
                    {showSetConfirm ? <FiCheck /> : 'Set'}
                </button>
              </div>
            </div>
            <div className="settings-section">
              <h3>Startup</h3>
              <button
                className="settings-btn-secondary settings-startup-btn"
                type="button"
                onClick={() => setShowStartupHelp(true)}
              >
                Automatically open on startup + login
              </button>
            </div>
          </div>
        </>
      )}

      {showStartupHelp && (
        <>
          <div className="settings-backdrop" onClick={() => setShowStartupHelp(false)} />
          <div className="startup-modal" role="dialog" aria-modal="true">
            <div className="settings-header">
              <h2>Auto-launch setup</h2>
              <button className="settings-close" onClick={() => setShowStartupHelp(false)} title="Close">
                <FiX />
              </button>
            </div>
            <p className="startup-note">Use Task Scheduler to launch the app at startup, log on, and unlock.</p>
            <ol className="startup-steps">
              <li>Press Win + R, type <strong>taskschd.msc</strong>, then press Enter.</li>
              <li>In the right panel, click <strong>Create Task...</strong> (not Basic Task).</li>
              <li>On the <strong>General</strong> tab, name it (ex: Goals Tracker), choose <strong>Run only when user is logged on</strong>, and check <strong>Run with highest privileges</strong>.</li>
              <li>Open the <strong>Triggers</strong> tab and add three triggers:
                <ul>
                  <li><strong>At startup</strong></li>
                  <li><strong>At log on</strong> (select your user)</li>
                  <li><strong>On workstation unlock</strong> (select your user)</li>
                </ul>
              </li>
              <li>On the <strong>Actions</strong> tab, choose your installed app .exe in <strong>Program/script</strong>.</li>
              <li>Optional: On <strong>Conditions</strong>, uncheck “Start the task only if the computer is on AC power.”</li>
              <li>Click <strong>OK</strong> to save.</li>
              <li>Bonus: If you didn’t know Task Scheduler existed, have fun with it.</li>
            </ol>
          </div>
        </>
      )}

      {showManageTasks && (
        <>
          <div className="settings-backdrop" onClick={() => setShowManageTasks(false)} />
          <div className="manage-modal" role="dialog" aria-modal="true">
            <div className="settings-header">
              <h2>Manage tasks</h2>
              <button className="settings-close" onClick={() => setShowManageTasks(false)} title="Close">
                <FiX />
              </button>
            </div>
            <div className="manage-section">
              <h3>Goals</h3>
              {items.goals.length === 0 ? (
                <p className="manage-empty">No goals yet.</p>
              ) : (
                items.goals.map(item => (
                  <div key={`manage-${item.id}`} className="manage-row">
                    <div className="manage-main">
                      <span className="manage-title">{item.text}</span>
                      <div className="manage-controls">
                        <select
                          className="manage-select"
                          value={item.schedule?.type ?? 'daily'}
                          onChange={(event) => {
                            const type = event.target.value as ScheduleType;
                            const anchorDate = item.schedule?.anchorDate ?? new Date().toISOString().slice(0, 10);
                            const daysOfWeek = item.schedule?.daysOfWeek ?? [getAnchorDate(item).getDay()];
                            const date = item.schedule?.date ?? anchorDate;
                            setItems(prev => ({
                              ...prev,
                              goals: prev.goals.map(goal => goal.id === item.id
                                ? { ...goal, schedule: { type, anchorDate, daysOfWeek, date } }
                                : goal),
                            }));
                          }}
                        >
                          <option value="daily">Every day</option>
                          <option value="weekdays">Weekdays</option>
                          <option value="weekends">Weekends</option>
                          <option value="custom-days">Specific days</option>
                          <option value="every-other-day">Every other day</option>
                          <option value="every-3-days">Every 3 days</option>
                          <option value="weekly">Once a week</option>
                          <option value="biweekly">Every 2 weeks</option>
                          <option value="monthly">Monthly</option>
                          <option value="specific-date">Specific date</option>
                        </select>
                        {(item.schedule?.type === 'custom-days' ||
                          item.schedule?.type === 'weekly' ||
                          item.schedule?.type === 'biweekly') && (
                          <div className="manage-days">
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, idx) => (
                              <button
                                key={`${item.id}-day-${idx}`}
                                className={`day-chip ${item.schedule?.daysOfWeek?.includes(idx) ? 'active' : ''}`}
                                type="button"
                                onClick={() => {
                                  const current = item.schedule?.daysOfWeek ?? [];
                                  const next = current.includes(idx)
                                    ? current.filter(day => day !== idx)
                                    : [...current, idx];
                                  setItems(prev => ({
                                    ...prev,
                                    goals: prev.goals.map(goal => goal.id === item.id
                                      ? {
                                          ...goal,
                                          schedule: {
                                            ...(goal.schedule ?? { type: 'custom-days' }),
                                            type: item.schedule?.type ?? 'custom-days',
                                            daysOfWeek: next,
                                            anchorDate: goal.schedule?.anchorDate ?? new Date().toISOString().slice(0, 10),
                                          },
                                        }
                                      : goal),
                                  }));
                                }}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                        {(item.schedule?.type === 'monthly' || item.schedule?.type === 'specific-date') && (
                          <input
                            className="manage-date"
                            type="date"
                            value={item.schedule?.date ?? toISODate(new Date())}
                            onChange={(event) => {
                              const date = event.target.value;
                              setItems(prev => ({
                                ...prev,
                                goals: prev.goals.map(goal => goal.id === item.id
                                  ? {
                                      ...goal,
                                      schedule: {
                                        ...(goal.schedule ?? { type: 'monthly' }),
                                        type: item.schedule?.type ?? 'monthly',
                                        date,
                                        anchorDate: goal.schedule?.anchorDate ?? new Date().toISOString().slice(0, 10),
                                      },
                                    }
                                  : goal),
                              }));
                            }}
                          />
                        )}
                      </div>
                    </div>
                    <button
                      className="manage-delete"
                      type="button"
                      onClick={() => deleteTaskPermanently('goals', item.id, item.text)}
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="manage-section">
              <h3>Waste</h3>
              {items.waste.length === 0 ? (
                <p className="manage-empty">No waste tasks yet.</p>
              ) : (
                items.waste.map(item => (
                  <div key={`manage-${item.id}`} className="manage-row">
                    <div className="manage-main">
                      <span className="manage-title">{item.text}</span>
                      <div className="manage-controls">
                        <select
                          className="manage-select"
                          value={item.schedule?.type ?? 'daily'}
                          onChange={(event) => {
                            const type = event.target.value as ScheduleType;
                            const anchorDate = item.schedule?.anchorDate ?? new Date().toISOString().slice(0, 10);
                            const daysOfWeek = item.schedule?.daysOfWeek ?? [getAnchorDate(item).getDay()];
                            const date = item.schedule?.date ?? anchorDate;
                            setItems(prev => ({
                              ...prev,
                              waste: prev.waste.map(wasteItem => wasteItem.id === item.id
                                ? { ...wasteItem, schedule: { type, anchorDate, daysOfWeek, date } }
                                : wasteItem),
                            }));
                          }}
                        >
                          <option value="daily">Every day</option>
                          <option value="weekdays">Weekdays</option>
                          <option value="weekends">Weekends</option>
                          <option value="custom-days">Specific days</option>
                          <option value="every-other-day">Every other day</option>
                          <option value="every-3-days">Every 3 days</option>
                          <option value="weekly">Once a week</option>
                          <option value="biweekly">Every 2 weeks</option>
                          <option value="monthly">Monthly</option>
                          <option value="specific-date">Specific date</option>
                        </select>
                        {(item.schedule?.type === 'custom-days' ||
                          item.schedule?.type === 'weekly' ||
                          item.schedule?.type === 'biweekly') && (
                          <div className="manage-days">
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, idx) => (
                              <button
                                key={`${item.id}-day-${idx}`}
                                className={`day-chip ${item.schedule?.daysOfWeek?.includes(idx) ? 'active' : ''}`}
                                type="button"
                                onClick={() => {
                                  const current = item.schedule?.daysOfWeek ?? [];
                                  const next = current.includes(idx)
                                    ? current.filter(day => day !== idx)
                                    : [...current, idx];
                                  setItems(prev => ({
                                    ...prev,
                                    waste: prev.waste.map(wasteItem => wasteItem.id === item.id
                                      ? {
                                          ...wasteItem,
                                          schedule: {
                                            ...(wasteItem.schedule ?? { type: 'custom-days' }),
                                            type: item.schedule?.type ?? 'custom-days',
                                            daysOfWeek: next,
                                            anchorDate: wasteItem.schedule?.anchorDate ?? new Date().toISOString().slice(0, 10),
                                          },
                                        }
                                      : wasteItem),
                                  }));
                                }}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                        {(item.schedule?.type === 'monthly' || item.schedule?.type === 'specific-date') && (
                          <input
                            className="manage-date"
                            type="date"
                            value={item.schedule?.date ?? toISODate(new Date())}
                            onChange={(event) => {
                              const date = event.target.value;
                              setItems(prev => ({
                                ...prev,
                                waste: prev.waste.map(wasteItem => wasteItem.id === item.id
                                  ? {
                                      ...wasteItem,
                                      schedule: {
                                        ...(wasteItem.schedule ?? { type: 'monthly' }),
                                        type: item.schedule?.type ?? 'monthly',
                                        date,
                                        anchorDate: wasteItem.schedule?.anchorDate ?? new Date().toISOString().slice(0, 10),
                                      },
                                    }
                                  : wasteItem),
                              }));
                            }}
                          />
                        )}
                      </div>
                    </div>
                    <button
                      className="manage-delete"
                      type="button"
                      onClick={() => deleteTaskPermanently('waste', item.id, item.text)}
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      <div className="footer">
        <div className="footer-controls">
          <button
            className={`music-launch ${showMusic ? 'active' : ''}`}
            type="button"
            onClick={() => setShowMusic(prev => !prev)}
            title="Music player"
          >
            <FiMusic className={isMusicPlaying ? 'music-launch-icon playing' : 'music-launch-icon'} />
          </button>
          <div className="toggle-container">
          <button
            className={`tab-btn ${tab === 'goals' ? 'active' : ''}`}
            onClick={() => setTab('goals')}
          >
            Goals
          </button>
          <button
            className={`tab-btn ${tab === 'waste' ? 'active' : ''}`}
            onClick={() => setTab('waste')}
          >
            Waste
          </button>
          <button
            className={`tab-btn ${tab === 'log' ? 'active' : ''}`}
            onClick={() => setTab('log')}
          >
            Log
          </button>
          </div>
        </div>
        {isTaskTab && (
          <p className="status">
            {currentItems.filter((i) => !i.completed).length} active •{' '}
            {currentItems.filter((i) => i.completed).length} done
          </p>
        )}
      </div>
    </div>
  );
};

export default App;

