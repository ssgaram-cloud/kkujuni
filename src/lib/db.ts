import Dexie, { type Table } from 'dexie';
import type { KV, LocalImage, StudySession, WrongNote } from './types';

export class StudyDB extends Dexie {
  sessions!: Table<StudySession, string>;
  notes!: Table<WrongNote, string>;
  images!: Table<LocalImage, string>;
  kv!: Table<KV, string>;

  constructor(name = 'tax-study-tracker') {
    super(name);
    this.version(1).stores({
      sessions: 'id, startAt, subject, updatedAt',
      notes: 'id, subject, updatedAt',
      images: 'id, noteId',
      kv: 'key'
    });
  }
}

export const db = new StudyDB();

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key);
  return row ? (row.value as T) : fallback;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

let deviceIdCache: string | null = null;
export async function getDeviceId(): Promise<string> {
  if (deviceIdCache) return deviceIdCache;
  let id = await kvGet<string | null>('deviceId', null);
  if (!id) {
    id = 'dev-' + uid().slice(0, 8);
    await kvSet('deviceId', id);
  }
  deviceIdCache = id;
  return id;
}
