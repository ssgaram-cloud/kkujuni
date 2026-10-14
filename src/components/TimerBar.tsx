import { useEffect } from 'react';
import { SUBJECT, TYPE_NAME } from '../lib/constants';
import { activeElapsed, continueActive, pauseActive, requestStop } from '../lib/data';
import { useActive, useNow, useStopDraft } from '../lib/hooks';
import { clock, fmtHMS } from '../lib/time';
import { Icon } from './Icon';

/** 하단 고정 타이머 바 (PRD F2) */
export function TimerBar() {
  const active = useActive();
  const draft = useStopDraft();
  const now = useNow(1000, !!active);
  const elapsed = active ? activeElapsed(active, now) : 0;

  // 브라우저 탭 제목에 경과시간 표시 (F2-06)
  useEffect(() => {
    if (!active) {
      document.title = '꾸준이';
      return;
    }
    document.title = `${active.pausedAt ? '⏸' : '⏱'} ${fmtHMS(elapsed)} ${SUBJECT[active.subject].name}`;
  }, [active, elapsed]);

  if (!active) return null;
  const subj = SUBJECT[active.subject];
  const paused = !!active.pausedAt;
  const stopping = !!draft;

  return (
    <div className="timerbar" style={{ background: subj.color }} role="region" aria-label="진행 중인 공부">
      <div className="tb-top">
        <div className="tb-info">
          <span className="tb-name">
            {subj.name} · {TYPE_NAME[active.type]}
          </span>
          {paused ? <span className="tb-badge">일시정지 중</span> : <span className="tb-sub">{clock(active.startAt)} 시작</span>}
        </div>
        <span className={'tb-time mono' + (paused && !stopping ? ' blink' : '')} aria-live="off">
          {fmtHMS(elapsed)}
        </span>
      </div>
      <div className="tb-actions">
        <button type="button" className={'tb-btn ghost' + (paused ? ' when-wide-dim' : '')} onClick={() => void pauseActive()} disabled={paused}>
          <Icon name="pause" size={14} />
          PAUSE
        </button>
        <button
          type="button"
          className={'tb-btn light' + (!paused ? ' when-wide-dim' : '')}
          style={{ color: subj.color }}
          onClick={() => void continueActive()}
          disabled={!paused}
        >
          <Icon name="play" size={14} />
          CONTINUE
        </button>
        <button type="button" className="tb-btn dark" onClick={() => void requestStop()}>
          <Icon name="stop" size={12} />
          STOP
        </button>
      </div>
    </div>
  );
}
