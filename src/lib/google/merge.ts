import type { ActiveDoc, ActiveSession, SyncRecord } from '../types';

/** LWW 비교: updatedAt이 늦은 쪽, 같으면 deviceId 사전순으로 결정 (양쪽 기기가 같은 결론을 내도록) */
export function newer<T extends SyncRecord>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return a.deviceId >= b.deviceId ? a : b;
}

export interface MergeResult<T> {
  /** 로컬에 써야 할 레코드 (원격이 더 최신이거나 로컬에 없음) */
  toLocal: T[];
  /** 원격 파일이 로컬보다 뒤처져 있어 다시 올려야 함 */
  remoteStale: boolean;
}

/**
 * 레코드 단위 병합 (PRD F6-07).
 * @param local 이 파일에 속하는 로컬 레코드
 * @param remote 원격 파일의 레코드
 */
export function mergeRecords<T extends SyncRecord>(local: T[], remote: T[]): MergeResult<T> {
  const lm = new Map(local.map((r) => [r.id, r]));
  const rm = new Map(remote.map((r) => [r.id, r]));
  const toLocal: T[] = [];
  let remoteStale = false;
  for (const r of remote) {
    const l = lm.get(r.id);
    if (!l) toLocal.push(r);
    else {
      const w = newer(l, r);
      if (w === r && (r.updatedAt !== l.updatedAt || r.deviceId !== l.deviceId)) toLocal.push(r);
      else if (w === l && (l.updatedAt !== r.updatedAt || l.deviceId !== r.deviceId)) remoteStale = true;
    }
  }
  for (const l of local) if (!rm.has(l.id)) remoteStale = true;
  return { toLocal, remoteStale };
}

export interface ActiveMerge {
  /** 병합 후 로컬에 둘 진행 세션 문서 */
  result: ActiveDoc;
  /** 동시에 시작된 다른 세션 → 자동 종료 처리할 대상과 종료시각 (PRD F6-10) */
  closeLoser: { session: ActiveSession; endAt: number } | null;
  remoteStale: boolean;
}

export function mergeActive(local: ActiveDoc, remote: ActiveDoc): ActiveMerge {
  const ls = local.session;
  const rs = remote.session;
  // 두 기기에서 서로 다른 세션을 진행 중: 나중에 시작한 쪽을 살리고 먼저 시작한 쪽은 그 시각에 자동 종료
  if (ls && rs && ls.sessionId !== rs.sessionId) {
    const keepLocal = ls.startAt > rs.startAt || (ls.startAt === rs.startAt && ls.sessionId > rs.sessionId);
    const keep = keepLocal ? local : remote;
    const lose = keepLocal ? rs : ls;
    const keepSession = keep.session as ActiveSession;
    return {
      result: { ...keep, updatedAt: Math.max(local.updatedAt, remote.updatedAt) + 1 },
      closeLoser: { session: lose, endAt: Math.max(lose.startAt, keepSession.startAt) },
      remoteStale: true
    };
  }
  const w = newer(local, remote);
  const same = local.updatedAt === remote.updatedAt && local.deviceId === remote.deviceId;
  return { result: w, closeLoser: null, remoteStale: !same && w === local };
}
