import type { Pause } from './types';

export const pad = (n: number) => (n < 10 ? '0' : '') + n;

/** 01:23:45 */
export function fmtHMS(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** 3:45 (시:분) */
export function fmtHM(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}`;
}

/** 부호 있는 시:분 (+3:20 / −1:05) */
export function fmtSignedHM(sec: number): string {
  return (sec >= 0 ? '+' : '−') + fmtHM(Math.abs(sec));
}

export function clock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function parseDateKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function addMonths(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return startOfDay(d.getTime());
}

/** 월요일 시작 주 */
export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export function startOfMonth(ts: number): number {
  const d = new Date(startOfDay(ts));
  d.setDate(1);
  return d.getTime();
}

const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const weekdayName = (ts: number) => WD[new Date(ts).getDay()];

/** 10.14 */
export function fmtMD(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

/** 10.14 (수) */
export function fmtMDW(ts: number): string {
  return `${fmtMD(ts)} (${weekdayName(ts)})`;
}

/** 10월 14일 수요일 */
export function fmtLongDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`;
}

/** 오늘 / 어제 / 10.12 */
export function relDay(ts: number, now = Date.now()): string {
  const diff = Math.round((startOfDay(now) - startOfDay(ts)) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  return fmtMD(ts);
}

/** 일시정지를 뺀 실제 공부 구간들 */
export function activeIntervals(startAt: number, endAt: number, pauses: Pause[]): [number, number][] {
  const ps = pauses
    .map((p) => [Math.max(startAt, p.from), Math.min(endAt, p.to)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let cur = startAt;
  for (const [a, b] of ps) {
    if (a > cur) out.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (endAt > cur) out.push([cur, endAt]);
  return out;
}

export function netSeconds(startAt: number, endAt: number, pauses: Pause[]): number {
  return Math.round(activeIntervals(startAt, endAt, pauses).reduce((s, [a, b]) => s + (b - a), 0) / 1000);
}

export function pauseSeconds(pauses: Pause[], now = Date.now()): number {
  return Math.round(pauses.reduce((s, p) => s + ((p.to || now) - p.from), 0) / 1000);
}

/** 자정을 넘긴 세션을 날짜별 초로 분할 (PRD F1-11) */
export function splitByDay(startAt: number, endAt: number, pauses: Pause[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [a, b] of activeIntervals(startAt, endAt, pauses)) {
    let s = a;
    while (s < b) {
      const next = Math.min(b, addDays(startOfDay(s), 1));
      const k = dateKey(s);
      out[k] = (out[k] || 0) + (next - s) / 1000;
      s = next;
    }
  }
  return out;
}

export function toLocalInput(ts: number): string {
  const d = new Date(ts);
  return `${dateKey(ts)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): number {
  return new Date(v).getTime();
}
