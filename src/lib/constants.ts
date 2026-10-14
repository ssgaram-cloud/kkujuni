import type { StudyType, SubjectId, WrongReason } from './types';

export interface SubjectInfo {
  id: SubjectId;
  name: string;
  short: string;
  tag: string;
  color: string;
  soft: string;
}

export const SUBJECTS: SubjectInfo[] = [
  { id: 'FIN', name: '재정학', short: '재정', tag: '필수', color: '#0F766E', soft: '#E3F1EF' },
  { id: 'TAX', name: '세법학개론', short: '세법', tag: '필수', color: '#1E40AF', soft: '#E5EBF8' },
  { id: 'ACC', name: '회계학개론', short: '회계', tag: '필수', color: '#B45309', soft: '#F8EEE2' },
  { id: 'COM', name: '상법', short: '상법', tag: '선택과목', color: '#6D28D9', soft: '#EFE8FB' }
];

export const SUBJECT: Record<SubjectId, SubjectInfo> = Object.fromEntries(SUBJECTS.map((s) => [s.id, s])) as Record<
  SubjectId,
  SubjectInfo
>;

export const TYPES: { id: StudyType; name: string; short: string }[] = [
  { id: 'LEC', name: '강의', short: '강의' },
  { id: 'TXT', name: '기본서', short: '기본서' },
  { id: 'PRB', name: '문제풀이', short: '문풀' },
  { id: 'WRG', name: '오답복습', short: '오답' },
  { id: 'MOC', name: '모의고사', short: '모의' }
];

export const TYPE_NAME: Record<StudyType, string> = Object.fromEntries(TYPES.map((t) => [t.id, t.name])) as Record<
  StudyType,
  string
>;

/** 풀이 결과(문항수/정답수)를 입력하는 유형 */
export const SCORED_TYPES: StudyType[] = ['PRB', 'MOC'];

export const REASONS: WrongReason[] = ['개념부족', '계산실수', '문제오독', '암기누락', '시간부족'];

/** 유형별 차트 색 (명도 차이로 구분) */
export const TYPE_COLORS = ['#15171C', '#464A55', '#767B88', '#A6AAB4', '#CDD0D6'];

/** 오답 복습 간격(일): 등록 후 1·3·7·14일 */
export const REVIEW_GAPS = [1, 3, 7, 14];

export const DRIVE_ROOT_NAME = '꾸준이';
