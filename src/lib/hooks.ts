import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, getActiveDoc, getLastTypes, getStopDraft, type StopDraft } from './data';
import { db } from './db';
import { getSyncState, subscribeSync } from './google/sync';
import type { ActiveSession, Settings, StudySession, StudyType, SubjectId, WrongNote } from './types';

/** 1초(기본)마다 바뀌는 현재 시각. 타이머 표시용 */
export function useNow(ms = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
  return now;
}

export function useActive(): ActiveSession | null | undefined {
  return useLiveQuery(async () => (await getActiveDoc()).session, []);
}

export function useStopDraft(): StopDraft | null | undefined {
  return useLiveQuery(() => getStopDraft(), []);
}

export function useSettings(): Settings {
  const s = useLiveQuery(() => db.kv.get('settings'), []);
  return { ...DEFAULT_SETTINGS, deviceId: '', ...((s?.value as Partial<Settings>) || {}) } as Settings;
}

export function useLastTypes(): Partial<Record<SubjectId, StudyType>> {
  return useLiveQuery(() => getLastTypes(), []) || {};
}

/** 삭제되지 않은 전체 세션 (시작시각 내림차순) */
export function useSessions(): StudySession[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.sessions.orderBy('startAt').reverse().toArray();
    return all.filter((s) => !s.deleted);
  }, []);
}

export function useNotes(): WrongNote[] | undefined {
  return useLiveQuery(async () => (await db.notes.toArray()).filter((n) => !n.deleted), []);
}

export function useSync() {
  return useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
}

export function useKv<T>(key: string, fallback: T): T {
  const row = useLiveQuery(() => db.kv.get(key), [key]);
  return row ? (row.value as T) : fallback;
}

/** 화면 너비가 PC 레이아웃 기준 이상인지 */
export function useWide(min = 900): boolean {
  const q = `(min-width: ${min}px)`;
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setWide(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [q]);
  return wide;
}
