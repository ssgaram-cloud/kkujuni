import { DRIVE_ROOT_NAME } from '../constants';
import { bus, clearDirty, closeActive, emitChange, getDirty, markDirty, sessionKey } from '../data';
import { db, kvGet, kvSet } from '../db';
import type { ActiveDoc, Settings, StudySession, WrongNote } from '../types';
import { AuthRequired, hasValidToken, isConnected } from './auth';
import * as drive from './drive';
import { mergeActive, mergeRecords, newer } from './merge';

/* ---------------- 상태 (화면 표시용) ---------------- */

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'auth' | 'error';
export interface SyncState {
  status: SyncStatus;
  lastSync: number | null;
  message: string;
  pending: number;
}

let state: SyncState = { status: 'off', lastSync: null, message: '', pending: 0 };
const listeners = new Set<() => void>();
export const getSyncState = () => state;
export function subscribeSync(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function setState(p: Partial<SyncState>) {
  state = { ...state, ...p };
  listeners.forEach((f) => f());
}

/* ---------------- 드라이브 위치 ---------------- */

interface DriveIds {
  root: string;
  data: string;
  images: string;
}
interface FileMeta {
  id: string;
  modifiedTime: string;
}

async function ensureIds(): Promise<DriveIds> {
  const cached = await kvGet<DriveIds | null>('drive.ids', null);
  if (cached) {
    try {
      const m = (await drive.getMeta(cached.root)) as drive.DriveFile & { trashed?: boolean };
      if (!m.trashed) return cached;
    } catch (e) {
      if (!(e instanceof drive.DriveError) || e.status !== 404) throw e;
    }
    await kvSet('drive.files', {});
  }
  const root = await drive.ensureFolder(DRIVE_ROOT_NAME);
  const data = await drive.ensureFolder('data', root);
  const images = await drive.ensureFolder('images', root);
  const ids = { root, data, images };
  await kvSet('drive.ids', ids);
  return ids;
}

/* ---------------- 파일 ↔ 로컬 ---------------- */

const fileName = (key: string) => `${key}.json`;
const keyOf = (name: string) => name.replace(/\.json$/, '');

async function localSessionsFor(key: string): Promise<StudySession[]> {
  const month = key.slice('sessions_'.length);
  const all = await db.sessions.toArray();
  return all.filter((s) => sessionKey(s.startAt) === `sessions_${month}`);
}

async function buildFile(key: string): Promise<object> {
  const base = { app: 'tax-study-tracker', v: 1, key, savedAt: new Date().toISOString() };
  if (key.startsWith('sessions_')) return { ...base, records: await localSessionsFor(key) };
  if (key === 'wrongnotes') return { ...base, records: await db.notes.toArray() };
  if (key === 'settings') return { ...base, record: await kvGet('settings', null) };
  if (key === 'active') return { ...base, record: await kvGet('active', null) };
  return base;
}

/** 원격 파일 내용을 로컬에 병합. 로컬이 더 최신인 부분이 있으면 해당 키를 다시 올리도록 표시 */
async function applyRemote(key: string, json: { records?: unknown[]; record?: unknown }): Promise<void> {
  if (key.startsWith('sessions_')) {
    const remote = (json.records || []) as StudySession[];
    const local = await localSessionsFor(key);
    const ids = remote.map((r) => r.id);
    const extra = (await db.sessions.bulkGet(ids)).filter(Boolean) as StudySession[];
    const localAll = [...new Map([...local, ...extra].map((s) => [s.id, s])).values()];
    const m = mergeRecords(localAll.filter((s) => sessionKey(s.startAt) === key || ids.includes(s.id)), remote);
    if (m.toLocal.length) await db.sessions.bulkPut(m.toLocal);
    const reKeys = new Set<string>();
    for (const r of m.toLocal) reKeys.add(sessionKey(r.startAt));
    reKeys.delete(key);
    if (m.remoteStale) reKeys.add(key);
    if (reKeys.size) await markDirty(...reKeys);
    return;
  }
  if (key === 'wrongnotes') {
    const remote = (json.records || []) as WrongNote[];
    const local = await db.notes.toArray();
    const m = mergeRecords(local, remote);
    if (m.toLocal.length) {
      await db.notes.bulkPut(m.toLocal);
      // 다른 기기에서 지운 오답의 이미지 캐시 정리
      for (const n of m.toLocal.filter((x) => x.deleted)) await db.images.where('noteId').equals(n.id).delete();
    }
    if (m.remoteStale) await markDirty('wrongnotes');
    return;
  }
  if (key === 'settings') {
    const r = json.record as Settings | null;
    const l = await kvGet<Settings | null>('settings', null);
    if (r && (!l || newer(l, r) === r)) await kvSet('settings', r);
    else if (l && (!r || newer(l, r) === l) && (!r || l.updatedAt !== r.updatedAt)) await markDirty('settings');
    return;
  }
  if (key === 'active') {
    const r = json.record as ActiveDoc | null;
    const l = await kvGet<ActiveDoc | null>('active', null);
    if (!r) {
      if (l) await markDirty('active');
      return;
    }
    if (!l) {
      await kvSet('active', await dropIfFinished(r));
      return;
    }
    const m = mergeActive(l, r);
    if (m.closeLoser) {
      await closeActive(m.closeLoser.session, m.closeLoser.endAt, { auto: true, memo: '다른 기기의 START로 자동 종료' });
      const draft = await kvGet<{ sessionId: string } | null>('stopDraft', null);
      if (draft && draft.sessionId === m.closeLoser.session.sessionId) await kvSet('stopDraft', null);
    }
    const res = await dropIfFinished(m.result);
    await kvSet('active', res);
    if (m.remoteStale || res !== m.result) await markDirty('active');
  }
}

/** 이미 확정 저장된 세션이 '진행 중'으로 되살아나지 않게 막는다 */
async function dropIfFinished(doc: ActiveDoc): Promise<ActiveDoc> {
  if (!doc.session) return doc;
  const saved = await db.sessions.get(doc.session.sessionId);
  if (saved && !saved.deleted) return { ...doc, session: null, updatedAt: doc.updatedAt + 1 };
  return doc;
}

/* ---------------- 이미지 ---------------- */

async function pushImages(ids: DriveIds): Promise<void> {
  const all = (await db.images.toArray()).filter((i) => !i.uploaded);
  for (const img of all) {
    if (img.trashed) {
      if (img.driveId) await drive.trashFile(img.driveId).catch(() => undefined);
      await db.images.delete(img.id);
      continue;
    }
    if (!img.blob) continue;
    const ext = img.blob.type === 'image/webp' ? 'webp' : 'jpg';
    const f = await drive.createFile(`${img.id}.${ext}`, ids.images, img.blob, img.blob.type || 'image/jpeg');
    await db.images.put({ ...img, driveId: f.id, uploaded: true });
    const note = await db.notes.get(img.noteId);
    if (note) {
      const fix = (refs: WrongNote['problemImages']) => refs.map((r) => (r.id === img.id ? { ...r, driveId: f.id } : r));
      await db.notes.put({ ...note, problemImages: fix(note.problemImages), answerImages: fix(note.answerImages), updatedAt: Date.now() });
      await markDirty('wrongnotes');
    }
  }
  // 업로드 완료 후 지운 이미지(휴지통 처리)
  for (const img of (await db.images.toArray()).filter((i) => i.trashed && i.uploaded)) {
    if (img.driveId) await drive.trashFile(img.driveId).catch(() => undefined);
    await db.images.delete(img.id);
  }
}

/** 오답 이미지 표시용: 로컬에 없으면 드라이브에서 받아 캐시 (PRD F6-13) */
export async function loadImage(id: string, driveId?: string): Promise<Blob | null> {
  const img = await db.images.get(id);
  if (img?.blob) return img.blob;
  const did = driveId || img?.driveId;
  if (!did || !hasValidToken()) return null;
  try {
    const blob = await (await drive.download(did)).blob();
    const note = img?.noteId || (await findNoteOfImage(id));
    await db.images.put({ id, blob, driveId: did, noteId: note || '', uploaded: true });
    return blob;
  } catch {
    return null;
  }
}

async function findNoteOfImage(id: string): Promise<string | undefined> {
  const notes = await db.notes.toArray();
  return notes.find((n) => [...n.problemImages, ...n.answerImages].some((r) => r.id === id))?.id;
}

/* ---------------- 오래된 삭제표시 정리 (30일) ---------------- */

async function purgeTombstones(): Promise<void> {
  const cut = Date.now() - 30 * 86400000;
  const olds = (await db.sessions.toArray()).filter((s) => s.deleted && s.updatedAt < cut);
  if (olds.length) {
    await db.sessions.bulkDelete(olds.map((s) => s.id));
    await markDirty(...new Set(olds.map((s) => sessionKey(s.startAt))));
  }
  const oldNotes = (await db.notes.toArray()).filter((n) => n.deleted && n.updatedAt < cut);
  if (oldNotes.length) {
    await db.notes.bulkDelete(oldNotes.map((n) => n.id));
    await markDirty('wrongnotes');
  }
}

/* ---------------- 동기화 본체 ---------------- */

let running: Promise<void> | null = null;
let again = false;

export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await runOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function runOnce(): Promise<void> {
  const dirtyNow = await getDirty();
  setState({ pending: Object.keys(dirtyNow).length });
  if (!(await isConnected())) return setState({ status: 'off', message: '' });
  if (typeof navigator !== 'undefined' && !navigator.onLine) return setState({ status: 'offline', message: '오프라인 — 연결되면 자동으로 올립니다' });
  if (!hasValidToken()) return setState({ status: 'auth', message: '구글 연결이 만료되었습니다. 다시 연결을 눌러 주세요' });
  setState({ status: 'syncing', message: '' });
  try {
    const ids = await ensureIds();
    const metas = await kvGet<Record<string, FileMeta>>('drive.files', {});

    // 1) 내려받기: 바뀐 원격 파일만 (진행 세션 파일은 마지막에)
    const remote = (await drive.listFiles(`'${ids.data}' in parents and trashed=false`)).filter((f) => f.name.endsWith('.json'));
    remote.sort((a, b) => (a.name === 'active.json' ? 1 : b.name === 'active.json' ? -1 : 0));
    for (const f of remote) {
      const known = metas[f.name];
      if (known && known.id === f.id && known.modifiedTime === f.modifiedTime) continue;
      if (known && known.id !== f.id) continue; // 같은 이름 중복 파일은 처음 것만 사용
      const json = await (await drive.download(f.id)).json();
      await applyRemote(keyOf(f.name), json);
      metas[f.name] = { id: f.id, modifiedTime: f.modifiedTime };
      await kvSet('drive.files', metas);
    }

    // 2) 이미지 올리기 (오답 레코드에 driveId가 붙으므로 데이터보다 먼저)
    await pushImages(ids);
    await purgeTombstones();

    // 3) 올리기: 변경된 키만, 업로드 직전 원격 수정시각을 다시 확인 (PRD F6-08)
    const dirty = await getDirty();
    const keys = Object.keys(dirty).sort((a, b) => (a === 'active' ? 1 : b === 'active' ? -1 : 0));
    for (const key of keys) {
      const counter = dirty[key];
      const name = fileName(key);
      let meta = metas[name];
      if (meta) {
        const cur = await drive.getMeta(meta.id).catch((e) => {
          if (e instanceof drive.DriveError && e.status === 404) return null;
          throw e;
        });
        if (!cur || (cur as { trashed?: boolean }).trashed) {
          delete metas[name];
          meta = undefined as unknown as FileMeta;
        } else if (cur.modifiedTime !== meta.modifiedTime) {
          const json = await (await drive.download(meta.id)).json();
          await applyRemote(key, json);
          meta = { id: meta.id, modifiedTime: cur.modifiedTime };
        }
      }
      const body = JSON.stringify(await buildFile(key));
      const f = meta
        ? await drive.updateFile(meta.id, body, 'application/json')
        : await drive.createFile(name, ids.data, body, 'application/json');
      metas[name] = { id: f.id, modifiedTime: f.modifiedTime };
      await kvSet('drive.files', metas);
      await clearDirty(key, counter);
    }

    const left = Object.keys(await getDirty()).length;
    const now = Date.now();
    await kvSet('lastSync', now);
    setState({ status: 'idle', lastSync: now, message: '', pending: left });
    emitChange();
    if (left) again = true;
  } catch (e) {
    if (e instanceof AuthRequired) setState({ status: 'auth', message: e.message });
    else setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}

/* ---------------- 자동 동기화 스케줄 (PRD F6-06) ---------------- */

let started = false;
export async function startAutoSync(): Promise<void> {
  if (started) return;
  started = true;
  setState({ lastSync: await kvGet<number | null>('lastSync', null) });
  let timer: ReturnType<typeof setTimeout> | null = null;
  const soon = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), ms);
  };
  bus.addEventListener('change', () => {
    if (!running) soon(5000);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') soon(300);
  });
  window.addEventListener('online', () => soon(300));
  window.addEventListener('offline', () => setState({ status: 'offline', message: '오프라인 — 연결되면 자동으로 올립니다' }));
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 60_000);
  void syncNow();
}
