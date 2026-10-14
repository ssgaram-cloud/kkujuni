import { useEffect, useMemo, useState } from 'react';
import { SCORED_TYPES, SUBJECT, TYPE_NAME } from '../lib/constants';
import { cancelStop, saveStop, updateStopDraft } from '../lib/data';
import { useActive, useSessions, useStopDraft } from '../lib/hooks';
import { clock, fmtHMS, netSeconds, relDay } from '../lib/time';
import { Sheet, useToast } from './ui';

/** STOP 후 진도 메모 시트 (PRD 2.1) */
export function StopSheet() {
  const draft = useStopDraft();
  const active = useActive();
  const sessions = useSessions();
  const toast = useToast();
  const [f, setF] = useState({ progress: '', memo: '', solved: '', correct: '' });
  const [busy, setBusy] = useState(false);

  // 시트가 열릴 때 임시저장된 값을 불러온다 (앱을 껐다 켜도 유지)
  const sid = draft?.sessionId;
  useEffect(() => {
    if (draft) setF({ progress: draft.progress, memo: draft.memo, solved: draft.solved, correct: draft.correct });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid]);

  const last = useMemo(() => {
    if (!active || !sessions) return null;
    return sessions.find((s) => s.subject === active.subject && s.progress && !s.auto) || null;
  }, [active, sessions]);

  if (!draft || !active || draft.sessionId !== active.sessionId) return null;

  const subj = SUBJECT[active.subject];
  const pauses = [...active.pauses];
  if (active.pausedAt) pauses.push({ from: active.pausedAt, to: draft.stopAt });
  const net = netSeconds(active.startAt, draft.stopAt, pauses);
  const pauseMin = Math.round(pauses.reduce((s, p) => s + (Math.min(p.to, draft.stopAt) - p.from), 0) / 60000);
  const scored = SCORED_TYPES.includes(active.type);

  const set = (k: keyof typeof f, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    void updateStopDraft({ [k]: v });
  };

  const onSave = async () => {
    setBusy(true);
    await updateStopDraft(f);
    const r = await saveStop();
    setBusy(false);
    toast(r === 'short' ? '1분 미만이라 기록하지 않았어요' : `${subj.name} ${fmtHMS(net)} 저장했어요`);
  };

  return (
    <Sheet title="공부 종료 · 진도 메모">
      <div className="stop-tag" style={{ background: subj.color }}>
        {subj.name} · {TYPE_NAME[active.type]}
      </div>
      <div className="stop-summary">
        <div>
          <span>순공부시간</span>
          <b className="mono">{fmtHMS(net)}</b>
        </div>
        <div>
          <span>시간대</span>
          <b className="mono">
            {clock(active.startAt)}–{clock(draft.stopAt)}
          </b>
        </div>
        <div>
          <span>일시정지</span>
          <b className="mono">{pauseMin}분</b>
        </div>
      </div>
      <div className="last-progress">
        <b>지난 진도</b>
        <span>
          {last
            ? `${relDay(last.endAt)} ${clock(last.endAt)} · ${TYPE_NAME[last.type]} · ${last.progress}`
            : '이 과목의 이전 진도 기록이 없습니다'}
        </span>
      </div>
      <label className="field">
        <span>진도 범위</span>
        <input
          type="text"
          value={f.progress}
          onChange={(e) => set('progress', e.target.value)}
          placeholder="예: 기본서 p.120–158 / 인강 15강"
          enterKeyHint="next"
        />
      </label>
      <label className="field">
        <span>메모</span>
        <textarea
          rows={3}
          value={f.memo}
          onChange={(e) => set('memo', e.target.value)}
          placeholder="예: 3장 리스 끝. 리스변경 회계처리 다시 볼 것"
        />
      </label>
      {scored && (
        <div className="grid2">
          <label className="field">
            <span>풀이 문항수</span>
            <input type="number" inputMode="numeric" min={0} value={f.solved} onChange={(e) => set('solved', e.target.value)} placeholder="0" />
          </label>
          <label className="field">
            <span>정답수</span>
            <input type="number" inputMode="numeric" min={0} value={f.correct} onChange={(e) => set('correct', e.target.value)} placeholder="0" />
          </label>
        </div>
      )}
      <div className="grid2 sheet-actions">
        <button type="button" className="btn outline" onClick={() => void cancelStop()} disabled={busy}>
          계속 공부하기
        </button>
        <button type="button" className="btn primary" onClick={() => void onSave()} disabled={busy}>
          저장하고 종료
        </button>
      </div>
    </Sheet>
  );
}
