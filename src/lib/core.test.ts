import { describe, expect, it } from 'vitest';
import { mergeActive, mergeRecords } from './google/merge';
import { aggregate } from './stats';
import { netSeconds, splitByDay } from './time';
import type { ActiveDoc, StudySession } from './types';

const at = (d: string) => new Date(d).getTime();

const sess = (p: Partial<StudySession>): StudySession => ({
  id: 's1',
  createdAt: 1,
  updatedAt: 1,
  deleted: false,
  deviceId: 'A',
  subject: 'ACC',
  type: 'PRB',
  startAt: at('2026-10-14T09:00:00'),
  endAt: at('2026-10-14T10:00:00'),
  pauses: [],
  netSeconds: 3600,
  source: 'timer',
  progress: '',
  memo: '',
  ...p
});

describe('시간 계산', () => {
  it('일시정지를 뺀 순공부시간', () => {
    const s = at('2026-10-14T09:00:00');
    expect(netSeconds(s, s + 3600_000, [{ from: s + 600_000, to: s + 900_000 }])).toBe(3300);
  });
  it('자정을 넘긴 세션은 날짜별로 나눈다', () => {
    const r = splitByDay(at('2026-10-14T23:30:00'), at('2026-10-15T00:45:00'), []);
    expect(Math.round(r['2026-10-14'])).toBe(1800);
    expect(Math.round(r['2026-10-15'])).toBe(2700);
  });
});

describe('통계 집계', () => {
  it('기간 안의 과목·유형별 합계', () => {
    const a = aggregate(
      [sess({}), sess({ id: 's2', subject: 'TAX', type: 'LEC', startAt: at('2026-10-14T11:00:00'), endAt: at('2026-10-14T11:30:00') })],
      at('2026-10-14T00:00:00'),
      at('2026-10-15T00:00:00')
    );
    expect(a.total).toBe(5400);
    expect(a.bySubj.ACC).toBe(3600);
    expect(a.matrix.TAX.LEC).toBe(1800);
  });
  it('삭제한 세션은 빼고 계산', () => {
    const a = aggregate([sess({ deleted: true })], at('2026-10-14T00:00:00'), at('2026-10-15T00:00:00'));
    expect(a.total).toBe(0);
  });
});

describe('동기화 병합', () => {
  it('updatedAt이 늦은 쪽을 쓴다', () => {
    const local = [sess({ updatedAt: 5, progress: 'PC' })];
    const remote = [sess({ updatedAt: 9, progress: '모바일', deviceId: 'B' })];
    const m = mergeRecords(local, remote);
    expect(m.toLocal[0].progress).toBe('모바일');
    expect(m.remoteStale).toBe(false);
  });
  it('로컬에만 있는 기록이 있으면 다시 올린다', () => {
    const m = mergeRecords([sess({ id: 'only-local' })], []);
    expect(m.remoteStale).toBe(true);
  });
  it('두 기기에서 동시에 START하면 먼저 시작한 쪽을 자동 종료', () => {
    const doc = (id: string, start: number, dev: string): ActiveDoc => ({
      id: 'active',
      createdAt: 0,
      updatedAt: start,
      deleted: false,
      deviceId: dev,
      session: { sessionId: id, subject: 'ACC', type: 'TXT', startAt: start, pauses: [], pausedAt: null, deviceId: dev }
    });
    const m = mergeActive(doc('pc', 1000, 'A'), doc('mobile', 5000, 'B'));
    expect(m.result.session?.sessionId).toBe('mobile');
    expect(m.closeLoser?.session.sessionId).toBe('pc');
    expect(m.closeLoser?.endAt).toBe(5000);
  });
});
