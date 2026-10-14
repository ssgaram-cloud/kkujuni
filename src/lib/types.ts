export type SubjectId = 'ACC' | 'CA' | 'TAX' | 'FIN' | 'COM' | 'ETC';
export type StudyType = 'LEC' | 'TXT' | 'PRB' | 'WRG' | 'MOC';

/** 동기화 대상 레코드의 공통 필드 (PRD 10장) */
export interface SyncRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  deviceId: string;
}

export interface Pause {
  from: number;
  to: number;
}

/** 확정된 공부 세션 */
export interface StudySession extends SyncRecord {
  subject: SubjectId;
  type: StudyType;
  startAt: number;
  endAt: number;
  pauses: Pause[];
  netSeconds: number;
  source: 'timer' | 'manual';
  progress: string;
  memo: string;
  solved?: number | null;
  correct?: number | null;
  auto?: boolean;
  edited?: boolean;
}

/** 진행 중인 세션 (기기 간 공유, active.json) */
export interface ActiveSession {
  sessionId: string;
  subject: SubjectId;
  type: StudyType;
  startAt: number;
  pauses: Pause[];
  pausedAt: number | null;
  deviceId: string;
}

export interface ActiveDoc extends SyncRecord {
  session: ActiveSession | null;
}

export interface ImageRef {
  id: string;
  driveId?: string;
}

export type WrongReason = '개념부족' | '계산실수' | '문제오독' | '암기누락' | '시간부족';

export interface Review {
  at: number;
  result: 'correct' | 'wrong';
}

export interface WrongNote extends SyncRecord {
  subject: SubjectId;
  chapter: string;
  sourceRef: string;
  problemImages: ImageRef[];
  answerImages: ImageRef[];
  reasons: WrongReason[];
  memo: string;
  reviews: Review[];
  status: 'active' | 'done';
  nextReviewAt: string | null;
}

export interface Settings extends SyncRecord {
  examDate: string | null;
  dailyGoalMin: number;
  weeklyGoalMin: number;
  minSessionSec: number;
  streakMinMin: number;
  theme: 'system' | 'light' | 'dark';
}

export interface LocalImage {
  id: string;
  blob?: Blob;
  driveId?: string;
  noteId: string;
  uploaded: boolean;
  trashed?: boolean;
}

export interface KV {
  key: string;
  value: unknown;
}
