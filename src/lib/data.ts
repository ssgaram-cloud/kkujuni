import { REVIEW_GAPS } from './constants';
import { db, getDeviceId, kvGet, kvSet, uid } from './db';
import { addDays, dateKey, monthKey, netSeconds } from './time';
import type {
  ActiveDoc,
  ActiveSession,
  Settings,
  StudySession,
  StudyType,
  SubjectId,
  WrongNote
} from './types';

/* ---------------- 변경 알림 · 동기화 대상 표시 ---------------- */

export const bus = new EventTarget();
export const emitChange = () => bus.dispatchEvent(new Event('change'));

/** 동기화가 필요한 파일 키 → 변경 카운터 (업로드 중 생긴 변경을 놓치지 않기 위해 카운터로 관리) */
export async function markDirty(...keys: string[]): Promise<void> {
  await db.transaction('rw', db.kv, async () => {
    const cur = await kvGet<Record<string, number>>('dirty', {});
    for (const k of keys) cur[k] = (cur[k] || 0) + 1;
    await kvSet('dirty', cur);
  });
  emitChange();
}

export async function getDirty(): Promise<Record<string, number>> {
  return kvGet<Record<string, number>>('dirty', {});
}

/** 업로드 시점의 카운터와 같을 때만 해제 */
export async function clearDirty(key: string, counter: number): Promise<void> {
  await db.transaction('rw', db.kv, async () => {
    const cur = await kvGet<Record<string, number>>('dirty', {});
    if (cur[key] === counter) {
      delete cur[key];
      await kvSet('dirty', cur);
    }
  });
}

export const sessionKey = (startAt: number) => `sessions_${monthKey(startAt)}`;

/* ---------------- 설정 ---------------- */

export const DEFAULT_SETTINGS: Omit<Settings, 'deviceId'> = {
  id: 'settings',
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
  examDate: null,
  dailyGoalMin: 480,
  weeklyGoalMin: 2400,
  minSessionSec: 60,
  streakMinMin: 30,
  theme: 'system'
};

export async function getSettings(): Promise<Settings> {
  const s = await kvGet<Settings | null>('settings', null);
  return { ...DEFAULT_SETTINGS, deviceId: '', ...(s || {}) } as Settings;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  const now = Date.now();
  await kvSet('settings', { ...cur, ...patch, updatedAt: now, createdAt: cur.createdAt || now, deviceId: await getDeviceId() });
  await markDirty('settings');
}

/* ---------------- 진행 중 세션 ---------------- */

export async function getActiveDoc(): Promise<ActiveDoc> {
  return kvGet<ActiveDoc>('active', { id: 'active', createdAt: 0, updatedAt: 0, deleted: false, deviceId: '', session: null });
}

async function setActive(session: ActiveSession | null): Promise<void> {
  const cur = await getActiveDoc();
  const now = Date.now();
  await kvSet('active', { ...cur, session, updatedAt: Math.max(now, cur.updatedAt + 1), deviceId: await getDeviceId() });
  await markDirty('active');
}

export async function getLastTypes(): Promise<Partial<Record<SubjectId, StudyType>>> {
  return kvGet('lastType', {});
}

export async function setLastType(subject: SubjectId, type: StudyType): Promise<void> {
  const cur = await getLastTypes();
  await kvSet('lastType', { ...cur, [subject]: type });
  emitChange();
}

/** 진행 중 세션의 경과(순) 초 */
export function activeElapsed(a: ActiveSession, now = Date.now()): number {
  const end = a.pausedAt ?? now;
  return netSeconds(a.startAt, end, a.pauses);
}

/** 진행 중 세션을 확정 세션으로 저장 (자동 종료 등) */
export async function closeActive(
  a: ActiveSession,
  endAt: number,
  extra: Partial<StudySession> = {}
): Promise<StudySession | null> {
  const pauses = [...a.pauses];
  if (a.pausedAt) pauses.push({ from: a.pausedAt, to: Math.max(a.pausedAt, endAt) });
  const net = netSeconds(a.startAt, endAt, pauses);
  const settings = await getSettings();
  if (net < settings.minSessionSec) return null;
  const now = Date.now();
  const s: StudySession = {
    id: a.sessionId,
    createdAt: now,
    updatedAt: now,
    deleted: false,
    deviceId: await getDeviceId(),
    subject: a.subject,
    type: a.type,
    startAt: a.startAt,
    endAt,
    pauses,
    netSeconds: net,
    source: 'timer',
    progress: '',
    memo: '',
    ...extra
  };
  await db.sessions.put(s);
  await markDirty(sessionKey(s.startAt));
  return s;
}

export async function startSession(subject: SubjectId, type: StudyType): Promise<{ autoClosed: boolean }> {
  const doc = await getActiveDoc();
  const now = Date.now();
  let autoClosed = false;
  if (doc.session) {
    await closeActive(doc.session, now, { auto: true, memo: '다른 과목 START로 자동 종료' });
    autoClosed = true;
    await kvSet('stopDraft', null);
  }
  await setLastType(subject, type);
  await setActive({ sessionId: uid(), subject, type, startAt: now, pauses: [], pausedAt: null, deviceId: await getDeviceId() });
  return { autoClosed };
}

export async function pauseActive(at = Date.now()): Promise<void> {
  const { session } = await getActiveDoc();
  if (!session || session.pausedAt) return;
  await setActive({ ...session, pausedAt: at });
}

export async function continueActive(): Promise<void> {
  const { session } = await getActiveDoc();
  if (!session || !session.pausedAt) return;
  const now = Date.now();
  await setActive({ ...session, pauses: [...session.pauses, { from: session.pausedAt, to: now }], pausedAt: null });
}

export async function changeActiveType(type: StudyType): Promise<void> {
  const { session } = await getActiveDoc();
  if (!session) return;
  await setLastType(session.subject, type);
  await setActive({ ...session, type });
}

/* ---------------- STOP · 진도 메모 시트 ---------------- */

export interface StopDraft {
  sessionId: string;
  stopAt: number;
  wasPaused: boolean;
  progress: string;
  memo: string;
  solved: string;
  correct: string;
}

export async function getStopDraft(): Promise<StopDraft | null> {
  return kvGet<StopDraft | null>('stopDraft', null);
}

export async function updateStopDraft(patch: Partial<StopDraft>): Promise<void> {
  const d = await getStopDraft();
  if (!d) return;
  await kvSet('stopDraft', { ...d, ...patch });
  emitChange();
}

/** STOP: 종료시각을 확정하고 타이머를 멈춘 뒤 메모 시트를 연다 */
export async function requestStop(): Promise<void> {
  const { session } = await getActiveDoc();
  if (!session) return;
  const now = Date.now();
  // '계속 공부하기'로 닫았던 메모가 있으면 이어서 쓴다
  const carry = await kvGet<StopDraft | null>('stopCarry', null);
  const keep = carry && carry.sessionId === session.sessionId ? carry : null;
  await kvSet('stopDraft', {
    sessionId: session.sessionId,
    stopAt: now,
    wasPaused: !!session.pausedAt,
    progress: keep?.progress || '',
    memo: keep?.memo || '',
    solved: keep?.solved || '',
    correct: keep?.correct || ''
  } satisfies StopDraft);
  if (!session.pausedAt) await setActive({ ...session, pausedAt: now });
  else emitChange();
}

/** 계속 공부하기: 시트를 닫고 재개 (원래 일시정지였으면 일시정지 유지) */
export async function cancelStop(): Promise<void> {
  const d = await getStopDraft();
  await kvSet('stopCarry', d);
  await kvSet('stopDraft', null);
  if (d && !d.wasPaused) await continueActive();
  else emitChange();
}

/** 저장하고 종료 */
export async function saveStop(): Promise<'saved' | 'short'> {
  const d = await getStopDraft();
  const { session } = await getActiveDoc();
  await kvSet('stopDraft', null);
  await kvSet('stopCarry', null);
  if (!session) {
    emitChange();
    return 'saved';
  }
  const endAt = d && d.sessionId === session.sessionId ? d.stopAt : session.pausedAt ?? Date.now();
  const solved = d?.solved ? Number(d.solved) : null;
  const correct = d?.correct ? Number(d.correct) : null;
  const saved = await closeActive(session, endAt, {
    progress: d?.progress.trim() || '',
    memo: d?.memo.trim() || '',
    solved: Number.isFinite(solved as number) ? solved : null,
    correct: Number.isFinite(correct as number) ? correct : null
  });
  await setActive(null);
  return saved ? 'saved' : 'short';
}

/* ---------------- 세션 기록 관리 ---------------- */

export async function upsertSession(s: StudySession, prevStartAt?: number): Promise<void> {
  const now = Date.now();
  const rec: StudySession = {
    ...s,
    netSeconds: netSeconds(s.startAt, s.endAt, s.pauses),
    updatedAt: now,
    createdAt: s.createdAt || now,
    deviceId: await getDeviceId()
  };
  await db.sessions.put(rec);
  const keys = [sessionKey(rec.startAt)];
  if (prevStartAt && sessionKey(prevStartAt) !== keys[0]) keys.push(sessionKey(prevStartAt));
  await markDirty(...keys);
}

export async function newManualSession(p: {
  subject: SubjectId;
  type: StudyType;
  startAt: number;
  endAt: number;
  progress: string;
  memo: string;
}): Promise<void> {
  await upsertSession({
    id: uid(),
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    deviceId: '',
    pauses: [],
    netSeconds: 0,
    source: 'manual',
    ...p
  });
}

export async function deleteSession(id: string): Promise<void> {
  const s = await db.sessions.get(id);
  if (!s) return;
  await db.sessions.put({ ...s, deleted: true, updatedAt: Date.now(), deviceId: await getDeviceId() });
  await markDirty(sessionKey(s.startAt));
}

/* ---------------- 오답노트 ---------------- */

export async function saveNote(n: WrongNote): Promise<void> {
  const now = Date.now();
  await db.notes.put({ ...n, updatedAt: now, createdAt: n.createdAt || now, deviceId: await getDeviceId() });
  await markDirty('wrongnotes');
}

export function emptyNote(subject: SubjectId): WrongNote {
  return {
    id: uid(),
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    deviceId: '',
    subject,
    chapter: '',
    sourceRef: '',
    problemImages: [],
    answerImages: [],
    reasons: [],
    memo: '',
    reviews: [],
    status: 'active',
    nextReviewAt: dateKey(addDays(Date.now(), REVIEW_GAPS[0]))
  };
}

export function correctStreak(n: WrongNote): number {
  let k = 0;
  for (let i = n.reviews.length - 1; i >= 0 && n.reviews[i].result === 'correct'; i--) k++;
  return k;
}

export async function addReview(id: string, result: 'correct' | 'wrong'): Promise<void> {
  const n = await db.notes.get(id);
  if (!n) return;
  const now = Date.now();
  const reviews = [...n.reviews, { at: now, result }];
  const tmp = { ...n, reviews };
  const streak = correctStreak(tmp);
  const done = streak >= 3;
  const gap = result === 'wrong' ? REVIEW_GAPS[0] : REVIEW_GAPS[Math.min(streak, REVIEW_GAPS.length - 1)];
  await saveNote({
    ...tmp,
    status: done ? 'done' : 'active',
    nextReviewAt: done ? null : dateKey(addDays(now, gap))
  });
}

export async function deleteNote(id: string): Promise<void> {
  const n = await db.notes.get(id);
  if (!n) return;
  for (const ref of [...n.problemImages, ...n.answerImages]) {
    const img = await db.images.get(ref.id);
    if (img) await db.images.put({ ...img, trashed: true, blob: undefined });
  }
  await saveNote({ ...n, deleted: true });
}

export async function storeImage(noteId: string, blob: Blob): Promise<string> {
  const id = uid();
  await db.images.put({ id, noteId, blob, uploaded: false });
  return id;
}

/* ---------------- 백업 ---------------- */

export async function exportAll(): Promise<object> {
  return {
    app: 'tax-study-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions: await db.sessions.toArray(),
    notes: await db.notes.toArray(),
    settings: await getSettings()
  };
}

export async function importAll(data: { sessions?: StudySession[]; notes?: WrongNote[] }): Promise<number> {
  let n = 0;
  const keys = new Set<string>();
  for (const s of data.sessions || []) {
    const cur = await db.sessions.get(s.id);
    if (!cur || cur.updatedAt < s.updatedAt) {
      await db.sessions.put(s);
      keys.add(sessionKey(s.startAt));
      n++;
    }
  }
  for (const x of data.notes || []) {
    const cur = await db.notes.get(x.id);
    if (!cur || cur.updatedAt < x.updatedAt) {
      await db.notes.put(x);
      keys.add('wrongnotes');
      n++;
    }
  }
  if (keys.size) await markDirty(...keys);
  return n;
}
