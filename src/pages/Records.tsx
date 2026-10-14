import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Chip, Dot, Empty, Sheet, confirmAsk, go, useToast } from '../components/ui';
import { SCORED_TYPES, SUBJECTS, SUBJECT, TYPES, TYPE_NAME } from '../lib/constants';
import { deleteSession, newManualSession, upsertSession } from '../lib/data';
import { useSessions } from '../lib/hooks';
import { addDays, clock, dateKey, fmtHM, fmtMDW, fromLocalInput, parseDateKey, startOfDay, toLocalInput } from '../lib/time';
import type { StudySession, StudyType, SubjectId } from '../lib/types';
import { sessionMemoLine } from './Home';

/** 기록 관리 (PRD F3): 날짜별 목록 · 수정 · 삭제 · 수동 추가 */
export function Records({ date, openId }: { date?: string; openId?: string }) {
  const sessions = useSessions();
  const day = date ? parseDateKey(date) : startOfDay(Date.now());
  const key = dateKey(day);
  const list = (sessions || []).filter((s) => s.startAt < addDays(day, 1) && s.endAt > day).sort((a, b) => a.startAt - b.startAt);
  const total = list.reduce((t, s) => t + s.netSeconds, 0);
  const editing = openId ? (sessions || []).find((s) => s.id === openId) : undefined;
  const [adding, setAdding] = useState(false);

  const close = () => go('records/' + key);

  return (
    <div className="page">
      <header className="row between">
        <h1 className="page-title">기록 관리</h1>
        <button type="button" className="btn dark compact" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} stroke={2.2} />
          수동 추가
        </button>
      </header>
      <div className="row between">
        <button type="button" className="icon-btn boxed" aria-label="전날" onClick={() => go('records/' + dateKey(addDays(day, -1)))}>
          <Icon name="left" />
        </button>
        <label className="date-pick">
          <span className="period-label">{fmtMDW(day)}</span>
          <input type="date" aria-label="날짜 선택" value={key} onChange={(e) => e.target.value && go('records/' + e.target.value)} />
        </label>
        <button type="button" className="icon-btn boxed" aria-label="다음날" onClick={() => go('records/' + dateKey(addDays(day, 1)))} disabled={day >= startOfDay(Date.now())}>
          <Icon name="right" />
        </button>
      </div>
      <div className="card row between">
        <span className="muted small">이 날 순공부시간</span>
        <span className="mono strong">{fmtHM(total)}</span>
      </div>
      {list.length === 0 ? (
        <Empty>이 날의 기록이 없습니다. 타이머 없이 공부했다면 '수동 추가'로 넣으세요.</Empty>
      ) : (
        <div className="card list">
          {list.map((r) => (
            <button type="button" key={r.id} className="rec" onClick={() => go(`records/${key}/${r.id}`)}>
              <div className="row between gap8">
                <span className="rec-title">
                  <Dot color={SUBJECT[r.subject].color} />
                  {SUBJECT[r.subject].name} · {TYPE_NAME[r.type]}
                  {(r.source === 'manual' || r.edited) && <span className="mini-tag">{r.source === 'manual' ? '수동' : '수정됨'}</span>}
                </span>
                <span className="mono muted xsmall nowrap">
                  {clock(r.startAt)}–{clock(r.endAt)} · {fmtHM(r.netSeconds)}
                </span>
              </div>
              {r.progress ? <span className="rec-progress">{r.progress}</span> : <span className="rec-progress muted">진도 미입력</span>}
              {sessionMemoLine(r) && <span className="rec-memo">{sessionMemoLine(r)}</span>}
            </button>
          ))}
        </div>
      )}
      {editing && <SessionEditor key={editing.id} session={editing} all={sessions || []} onClose={close} />}
      {adding && <SessionEditor day={day} all={sessions || []} onClose={() => setAdding(false)} />}
    </div>
  );
}

function SessionEditor({ session, day, all, onClose }: { session?: StudySession; day?: number; all: StudySession[]; onClose: () => void }) {
  const toast = useToast();
  const base = day ?? Date.now();
  const defStart = new Date(base);
  defStart.setHours(9, 0, 0, 0);
  const [subject, setSubject] = useState<SubjectId>(session?.subject || 'ACC');
  const [type, setType] = useState<StudyType>(session?.type || 'TXT');
  const [start, setStart] = useState(toLocalInput(session?.startAt ?? defStart.getTime()));
  const [end, setEnd] = useState(toLocalInput(session?.endAt ?? defStart.getTime() + 3600000));
  const [progress, setProgress] = useState(session?.progress || '');
  const [memo, setMemo] = useState(session?.memo || '');
  const [solved, setSolved] = useState(session?.solved != null ? String(session.solved) : '');
  const [correct, setCorrect] = useState(session?.correct != null ? String(session.correct) : '');

  const save = async () => {
    const a = fromLocalInput(start);
    const b = fromLocalInput(end);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
      toast('종료 시각이 시작 시각보다 늦어야 해요');
      return;
    }
    const overlap = all.find((x) => x.id !== session?.id && x.startAt < b && x.endAt > a);
    if (overlap && !confirmAsk(`${SUBJECT[overlap.subject].name} ${clock(overlap.startAt)}–${clock(overlap.endAt)} 기록과 시간이 겹칩니다. 그래도 저장할까요?`)) return;
    const nums = SCORED_TYPES.includes(type) ? { solved: solved ? Number(solved) : null, correct: correct ? Number(correct) : null } : { solved: null, correct: null };
    if (session) {
      // 시간이 바뀌면 그 범위를 벗어난 일시정지는 잘라낸다
      const pauses = session.pauses.map((p) => ({ from: Math.max(a, p.from), to: Math.min(b, p.to) })).filter((p) => p.to > p.from);
      await upsertSession({ ...session, subject, type, startAt: a, endAt: b, pauses, progress: progress.trim(), memo: memo.trim(), edited: true, ...nums }, session.startAt);
      toast('수정했어요');
    } else {
      await newManualSession({ subject, type, startAt: a, endAt: b, progress: progress.trim(), memo: memo.trim() });
      toast('기록을 추가했어요');
    }
    onClose();
  };

  return (
    <Sheet title={session ? '기록 수정' : '기록 수동 추가'} onClose={onClose}>
      <div className="chips">
        {SUBJECTS.map((s) => (
          <Chip key={s.id} on={subject === s.id} color={s.color} onClick={() => setSubject(s.id)}>
            {s.name}
          </Chip>
        ))}
      </div>
      <div className="chips">
        {TYPES.map((t) => (
          <Chip key={t.id} small on={type === t.id} onClick={() => setType(t.id)}>
            {t.name}
          </Chip>
        ))}
      </div>
      <div className="grid2">
        <label className="field">
          <span>시작</span>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span>종료</span>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>진도 범위</span>
        <input value={progress} onChange={(e) => setProgress(e.target.value)} placeholder="예: 기본서 p.120–158" />
      </label>
      <label className="field">
        <span>메모</span>
        <textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </label>
      {SCORED_TYPES.includes(type) && (
        <div className="grid2">
          <label className="field">
            <span>풀이 문항수</span>
            <input type="number" inputMode="numeric" min={0} value={solved} onChange={(e) => setSolved(e.target.value)} />
          </label>
          <label className="field">
            <span>정답수</span>
            <input type="number" inputMode="numeric" min={0} value={correct} onChange={(e) => setCorrect(e.target.value)} />
          </label>
        </div>
      )}
      <div className={session ? 'grid3 sheet-actions' : 'grid2 sheet-actions'}>
        {session && (
          <button
            type="button"
            className="btn outline danger"
            onClick={async () => {
              if (!confirmAsk('이 기록을 삭제할까요?')) return;
              await deleteSession(session.id);
              toast('삭제했어요');
              onClose();
            }}
          >
            삭제
          </button>
        )}
        <button type="button" className="btn outline" onClick={onClose}>
          취소
        </button>
        <button type="button" className="btn primary" onClick={() => void save()}>
          저장
        </button>
      </div>
    </Sheet>
  );
}
