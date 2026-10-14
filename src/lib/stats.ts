import { SUBJECTS, TYPES } from './constants';
import { addDays, dateKey, parseDateKey, splitByDay, startOfDay, startOfWeek } from './time';
import type { ActiveSession, StudySession, StudyType, SubjectId } from './types';

export interface Agg {
  total: number;
  bySubj: Record<SubjectId, number>;
  byType: Record<StudyType, number>;
  matrix: Record<SubjectId, Record<StudyType, number>>;
  byDay: Record<string, { total: number; bySubj: Record<SubjectId, number> }>;
}

const zeroSubj = () => Object.fromEntries(SUBJECTS.map((s) => [s.id, 0])) as Record<SubjectId, number>;
const zeroType = () => Object.fromEntries(TYPES.map((t) => [t.id, 0])) as Record<StudyType, number>;

export function emptyAgg(): Agg {
  return {
    total: 0,
    bySubj: zeroSubj(),
    byType: zeroType(),
    matrix: Object.fromEntries(SUBJECTS.map((s) => [s.id, zeroType()])) as Agg['matrix'],
    byDay: {}
  };
}

/** 세션 목록(+진행 중 세션)을 [from, to) 범위로 집계. 자정 넘긴 세션은 날짜별 분할 */
export function aggregate(
  sessions: StudySession[],
  from: number,
  to: number,
  active?: ActiveSession | null,
  now = Date.now()
): Agg {
  const agg = emptyAgg();
  const items: { subject: SubjectId; type: StudyType; startAt: number; endAt: number; pauses: StudySession['pauses'] }[] =
    sessions.filter((s) => !s.deleted);
  if (active) {
    const pauses = [...active.pauses];
    if (active.pausedAt) pauses.push({ from: active.pausedAt, to: now });
    items.push({ subject: active.subject, type: active.type, startAt: active.startAt, endAt: now, pauses });
  }
  const fromKey = dateKey(from);
  const toKey = dateKey(to - 1);
  for (const s of items) {
    if (s.endAt <= from || s.startAt >= to) continue;
    const parts = splitByDay(s.startAt, s.endAt, s.pauses);
    for (const [k, sec] of Object.entries(parts)) {
      if (k < fromKey || k > toKey) continue;
      agg.total += sec;
      agg.bySubj[s.subject] += sec;
      agg.byType[s.type] += sec;
      agg.matrix[s.subject][s.type] += sec;
      const d = (agg.byDay[k] ||= { total: 0, bySubj: zeroSubj() });
      d.total += sec;
      d.bySubj[s.subject] += sec;
    }
  }
  return agg;
}

/** 하루 기준(분) 이상 공부한 연속 일수. 오늘 미달이면 어제부터 센다 */
export function streakDays(byDay: Agg['byDay'], minMin: number, today = Date.now()): number {
  const ok = (ts: number) => (byDay[dateKey(ts)]?.total || 0) >= minMin * 60;
  let d = startOfDay(today);
  if (!ok(d)) d = addDays(d, -1);
  let n = 0;
  while (ok(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export type Period = 'day' | 'week' | 'month' | 'all';

/** 주별 합계 (전체 기간 추이용) */
export function weeklyTotals(byDay: Agg['byDay'], from: number, to: number): { label: number; total: number }[] {
  const out: { label: number; total: number }[] = [];
  for (let w = startOfWeek(from); w < to; w = addDays(w, 7)) {
    let t = 0;
    for (let i = 0; i < 7; i++) t += byDay[dateKey(addDays(w, i))]?.total || 0;
    out.push({ label: w, total: t });
  }
  return out;
}

export function earliestStart(sessions: StudySession[]): number | null {
  let m: number | null = null;
  for (const s of sessions) if (!s.deleted && (m === null || s.startAt < m)) m = s.startAt;
  return m;
}

export { parseDateKey };
