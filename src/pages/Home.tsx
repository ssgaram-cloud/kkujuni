import { useMemo } from 'react';
import { Brand, DDay, SyncPill } from '../components/bits';
import { Icon } from '../components/Icon';
import { Chip, Dot, Empty, go, useToast } from '../components/ui';
import { SUBJECTS, SUBJECT, TYPES, TYPE_NAME } from '../lib/constants';
import { changeActiveType, requestStop, setLastType, startSession } from '../lib/data';
import { useActive, useLastTypes, useNow, useSessions, useSettings } from '../lib/hooks';
import { aggregate } from '../lib/stats';
import { addDays, clock, dateKey, fmtHM, fmtLongDate, startOfDay } from '../lib/time';
import type { StudySession, StudyType, SubjectId } from '../lib/types';

export function sessionMemoLine(s: StudySession): string {
  const parts: string[] = [];
  if (s.solved != null) parts.push(`${s.solved}문항 중 ${s.correct ?? 0}정답`);
  if (s.memo) parts.push(s.memo);
  return parts.join(' · ');
}

export function Home() {
  const active = useActive();
  const sessions = useSessions();
  const lastTypes = useLastTypes();
  const settings = useSettings();
  const toast = useToast();
  const now = useNow(active ? 1000 : 30000);

  const today0 = startOfDay(now);
  const agg = useMemo(() => aggregate(sessions || [], today0, addDays(today0, 1), active, now), [sessions, active, now, today0]);
  const todays = useMemo(
    () => (sessions || []).filter((s) => s.endAt >= today0).sort((a, b) => b.startAt - a.startAt),
    [sessions, today0]
  );
  const goal = settings.dailyGoalMin * 60;
  const pct = goal ? Math.min(100, Math.round((agg.total / goal) * 100)) : 0;

  const typeOf = (id: SubjectId): StudyType => (active && active.subject === id ? active.type : lastTypes[id] || 'TXT');

  const onStart = async (id: SubjectId) => {
    const r = await startSession(id, typeOf(id));
    if (r.autoClosed) toast('진행 중이던 공부를 자동으로 종료하고 새로 시작했어요');
  };
  const onPick = (id: SubjectId, t: StudyType) => {
    if (active && active.subject === id) void changeActiveType(t);
    else void setLastType(id, t);
  };

  return (
    <div className="page">
      <header className="home-head">
        <div className="col">
          <span className="muted small">{fmtLongDate(now)}</span>
          <Brand />
        </div>
        <div className="row gap8">
          <DDay />
          <SyncPill />
        </div>
      </header>

      <section className="card today-card">
        <div className="col gap4">
          <span className="muted small">오늘 총 공부시간</span>
          <span className="mono big">{fmtHM(agg.total)}</span>
        </div>
        <div className="goal">
          <span className="muted xsmall">
            목표 {fmtHM(goal)} · {pct}%
          </span>
          <div className="bar">
            <div style={{ width: pct + '%' }} />
          </div>
        </div>
      </section>

      <section className="subj-grid" aria-label="과목별 공부 시작">
        {SUBJECTS.map((s) => {
          const isActive = active?.subject === s.id;
          const cur = typeOf(s.id);
          return (
            <div key={s.id} className={'card subj-card' + (isActive ? ' active' : '')} style={isActive ? { borderColor: s.color } : undefined}>
              <div className="row between start">
                <div className="col gap2">
                  <span className="subj-name">
                    <Dot color={s.color} />
                    {s.name}
                  </span>
                  <span className="muted xsmall">{s.tag}</span>
                </div>
                <div className="col end">
                  <span className="muted xsmall">오늘</span>
                  <span className="mono strong">{fmtHM(agg.bySubj[s.id])}</span>
                </div>
              </div>
              <div className="chips" role="group" aria-label={`${s.name} 공부 유형`}>
                {TYPES.map((t) => (
                  <Chip key={t.id} small on={cur === t.id} color={s.color} onClick={() => onPick(s.id, t.id)}>
                    {t.name}
                  </Chip>
                ))}
              </div>
              {isActive ? (
                <button type="button" className="btn dark" onClick={() => void requestStop()}>
                  <Icon name="stop" size={13} />
                  STOP
                </button>
              ) : (
                <button type="button" className="btn start" style={{ color: s.color, borderColor: s.color }} onClick={() => void onStart(s.id)}>
                  <Icon name="play" size={13} />
                  START
                </button>
              )}
            </div>
          );
        })}
      </section>

      <section className="col gap8">
        <div className="row between">
          <h3 className="sec-title">오늘 기록 · 진도</h3>
          <button type="button" className="link-btn" onClick={() => go('records/' + dateKey(now))}>
            기록 관리
          </button>
        </div>
        {todays.length === 0 ? (
          <Empty>아직 오늘 기록이 없어요. 과목 카드의 START로 시작하세요.</Empty>
        ) : (
          <div className="card list">
            {todays.map((r) => (
              <button type="button" key={r.id} className="rec" onClick={() => go('records/' + dateKey(r.startAt) + '/' + r.id)}>
                <div className="row between gap8">
                  <span className="rec-title">
                    <Dot color={SUBJECT[r.subject].color} />
                    {SUBJECT[r.subject].name} · {TYPE_NAME[r.type]}
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
      </section>
    </div>
  );
}
