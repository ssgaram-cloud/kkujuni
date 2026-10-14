import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Chip, Dot, Empty, go, useToast } from '../components/ui';
import { SUBJECTS, SUBJECT, TYPES, TYPE_NAME } from '../lib/constants';
import { startSession } from '../lib/data';
import { useSessions } from '../lib/hooks';
import { addDays, clock, dateKey, fmtHM, fmtMDW, parseDateKey, relDay, startOfDay } from '../lib/time';
import type { StudyType, SubjectId } from '../lib/types';
import { sessionMemoLine } from './Home';

/** 진도 노트 (PRD F8) */
export function Progress() {
  const sessions = useSessions();
  const toast = useToast();
  const [subj, setSubj] = useState<SubjectId | 'ALL'>('ALL');
  const [type, setType] = useState<StudyType | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [days, setDays] = useState(30);

  const list = sessions || [];
  const lasts = useMemo(
    () => SUBJECTS.map((s) => ({ s, last: list.find((x) => x.subject === s.id && x.progress && !x.auto) || null })),
    [list]
  );

  const query = q.trim().toLowerCase();
  const since = addDays(startOfDay(Date.now()), -(days - 1));
  const filtered = list.filter((x) => {
    if (x.auto && !x.progress) return false;
    if (subj !== 'ALL' && x.subject !== subj) return false;
    if (type !== 'ALL' && x.type !== type) return false;
    if (query && !(x.progress + ' ' + x.memo).toLowerCase().includes(query)) return false;
    return true;
  });
  const shown = query ? filtered : filtered.filter((x) => x.startAt >= since);
  const hasMore = !query && filtered.length > shown.length;

  const groups: { key: string; items: typeof shown }[] = [];
  for (const x of shown) {
    const k = dateKey(x.startAt);
    const g = groups[groups.length - 1];
    if (g && g.key === k) g.items.push(x);
    else groups.push({ key: k, items: [x] });
  }

  const resume = async (id: SubjectId, t: StudyType) => {
    const r = await startSession(id, t);
    toast(r.autoClosed ? '진행 중이던 공부를 종료하고 이어서 시작했어요' : `${SUBJECT[id].name} 공부를 시작했어요`);
    go('home');
  };

  return (
    <div className="page">
      <header className="row between baseline">
        <h1 className="page-title">진도 노트</h1>
        <span className="muted small">기록 {list.length}건</span>
      </header>

      <label className="search">
        <Icon name="search" size={18} />
        <input type="search" aria-label="진도·메모 검색" value={q} onChange={(e) => setQ(e.target.value)} placeholder="진도·메모 검색 (예: 리스, p.200)" />
      </label>

      <section className="col gap8">
        <h3 className="sec-title">과목별 마지막 진도</h3>
        <div className="last-grid">
          {lasts.map(({ s, last }) => (
            <div key={s.id} className="card last-card" style={subj === s.id ? { borderColor: s.color, boxShadow: `inset 0 0 0 1px ${s.color}` } : undefined}>
              <button type="button" className="last-body" onClick={() => setSubj(subj === s.id ? 'ALL' : s.id)} aria-pressed={subj === s.id}>
                <span className="row between">
                  <span className="subj-name small-name">
                    <Dot color={s.color} />
                    {s.name}
                  </span>
                  {last && (
                    <span className="muted xsmall">
                      {relDay(last.endAt)} {clock(last.endAt)}
                    </span>
                  )}
                </span>
                {last ? (
                  <>
                    <span className="muted xsmall">
                      {TYPE_NAME[last.type]} · {fmtHM(last.netSeconds)}
                    </span>
                    <span className="last-progress-text">{last.progress}</span>
                    <span className="muted xsmall clamp2">{sessionMemoLine(last) || '메모 없음'}</span>
                  </>
                ) : (
                  <span className="muted small">아직 진도 기록이 없어요</span>
                )}
              </button>
              <button
                type="button"
                className="btn small-btn outline-color"
                style={{ color: s.color, borderColor: s.color }}
                onClick={() => void resume(s.id, last?.type || 'TXT')}
              >
                <Icon name="play" size={11} />
                이어서 START
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="col gap10">
        <h3 className="sec-title">진도 기록</h3>
        <div className="chips scroll">
          <Chip on={subj === 'ALL'} onClick={() => setSubj('ALL')}>
            전체
          </Chip>
          {SUBJECTS.map((s) => (
            <Chip key={s.id} on={subj === s.id} onClick={() => setSubj(s.id)}>
              {s.name}
            </Chip>
          ))}
        </div>
        <div className="chips scroll">
          <Chip small on={type === 'ALL'} onClick={() => setType('ALL')}>
            전체 유형
          </Chip>
          {TYPES.map((t) => (
            <Chip small key={t.id} on={type === t.id} onClick={() => setType(t.id)}>
              {t.name}
            </Chip>
          ))}
        </div>

        {groups.length === 0 && <Empty>조건에 맞는 진도 기록이 없습니다</Empty>}
        {groups.map((g) => (
          <div key={g.key} className="col gap6">
            <span className="group-date">
              {fmtMDW(parseDateKey(g.key))}
              {relDay(parseDateKey(g.key)) === '오늘' ? ' · 오늘' : relDay(parseDateKey(g.key)) === '어제' ? ' · 어제' : ''}
            </span>
            <div className="card list">
              {g.items.map((e) => (
                <button type="button" key={e.id} className="tl-item" onClick={() => go('records/' + g.key + '/' + e.id)}>
                  <Dot color={SUBJECT[e.subject].color} />
                  <span className="col gap4 grow">
                    <span className="row between gap8 muted xsmall">
                      <span>
                        {SUBJECT[e.subject].name} · {TYPE_NAME[e.type]}
                      </span>
                      <span className="mono nowrap">
                        {clock(e.startAt)}–{clock(e.endAt)} · {fmtHM(e.netSeconds)}
                      </span>
                    </span>
                    {e.progress ? <span className="tl-progress">{e.progress}</span> : <span className="tl-progress muted">진도 미입력 — 눌러서 추가</span>}
                    {sessionMemoLine(e) && <span className="tl-memo">{sessionMemoLine(e)}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {hasMore && (
          <button type="button" className="btn outline" onClick={() => setDays((d) => d + 30)}>
            이전 30일 더 보기
          </button>
        )}
      </section>
    </div>
  );
}
