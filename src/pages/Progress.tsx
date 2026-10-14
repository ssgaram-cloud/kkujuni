import { useMemo, useRef, useState } from 'react';
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
  const lastTap = useRef<{ id: SubjectId; at: number } | null>(null);

  // 한 번 누르면 아래 목록 필터, 두 번 누르면 그 과목 전체 기록 (휴대폰 두 번 탭도 직접 감지)
  const onCard = (id: SubjectId) => {
    const now = Date.now();
    const prev = lastTap.current;
    if (prev && prev.id === id && now - prev.at < 400) {
      lastTap.current = null;
      go('progress/' + id);
      return;
    }
    lastTap.current = { id, at: now };
    setSubj((cur) => (cur === id ? 'ALL' : id));
  };

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
        <div className="row between baseline">
          <h3 className="sec-title">과목별 마지막 진도</h3>
          <span className="muted xsmall">두 번 누르면 과목 전체 기록</span>
        </div>
        <div className="last-grid">
          {lasts.map(({ s, last }) => (
            <div key={s.id} className="card last-card" style={subj === s.id ? { borderColor: s.color, boxShadow: `inset 0 0 0 1px ${s.color}` } : undefined}>
              <button
                type="button"
                className="last-body"
                onClick={() => onCard(s.id)}
                aria-pressed={subj === s.id}
                aria-label={`${s.name}: 한 번 누르면 아래 기록 걸러보기, 두 번 누르면 전체 기록`}
              >
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

/** 과목 전체 진도 기록: 진도 노트에서 과목 카드를 두 번 눌러 연다 */
export function SubjectProgress({ id }: { id: string }) {
  const sessions = useSessions();
  const toast = useToast();
  const [type, setType] = useState<StudyType | 'ALL'>('ALL');
  const s = SUBJECT[id as SubjectId];
  const all = useMemo(() => (sessions || []).filter((x) => x.subject === id && !(x.auto && !x.progress)), [sessions, id]);

  if (!s)
    return (
      <div className="page">
        <Empty>없는 과목입니다.</Empty>
        <button type="button" className="btn outline" onClick={() => go('progress')}>
          진도 노트로
        </button>
      </div>
    );

  const total = all.reduce((t, x) => t + x.netSeconds, 0);
  const dayCount = new Set(all.map((x) => dateKey(x.startAt))).size;
  const last = all.find((x) => x.progress && !x.auto) || null;
  const shown = all.filter((x) => type === 'ALL' || x.type === type);
  const groups: { key: string; items: typeof shown }[] = [];
  for (const x of shown) {
    const k = dateKey(x.startAt);
    const g = groups[groups.length - 1];
    if (g && g.key === k) g.items.push(x);
    else groups.push({ key: k, items: [x] });
  }

  const resume = async () => {
    const r = await startSession(s.id, last?.type || 'TXT');
    toast(r.autoClosed ? '진행 중이던 공부를 종료하고 이어서 시작했어요' : `${s.name} 공부를 시작했어요`);
    go('home');
  };

  return (
    <div className="page sp">
      <header className="sp-head" style={{ background: s.soft }}>
        <button type="button" className="icon-btn" aria-label="진도 노트로 돌아가기" onClick={() => go('progress')}>
          <Icon name="left" size={22} />
        </button>
        <div className="col gap2">
          <span className="xsmall muted2">{s.tag} · 전체 진도 기록</span>
          <h1 className="sp-title" style={{ color: s.color }}>
            {s.name}
          </h1>
        </div>
      </header>

      <div className="sp-stats">
        <div className="card">
          <span>총 공부시간</span>
          <b className="mono">{fmtHM(total)}</b>
        </div>
        <div className="card">
          <span>공부한 날</span>
          <b className="mono">{dayCount}일</b>
        </div>
        <div className="card">
          <span>기록</span>
          <b className="mono">{all.length}건</b>
        </div>
      </div>

      <section className="card sp-now" style={{ borderColor: s.color }}>
        <span className="sp-now-label" style={{ color: s.color }}>
          지금 여기까지
        </span>
        {last ? (
          <>
            <span className="sp-now-progress">{last.progress}</span>
            <span className="muted xsmall">
              {relDay(last.endAt)} {clock(last.endAt)} · {TYPE_NAME[last.type]} {fmtHM(last.netSeconds)}
            </span>
            {sessionMemoLine(last) && <span className="tl-memo">{sessionMemoLine(last)}</span>}
          </>
        ) : (
          <span className="muted small">아직 진도 기록이 없어요. STOP할 때 진도를 적으면 여기에 쌓입니다.</span>
        )}
        <button type="button" className="btn" style={{ background: s.color, color: '#fff' }} onClick={() => void resume()}>
          <Icon name="play" size={12} />
          {s.name} 이어서 START
        </button>
      </section>

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

      {groups.length === 0 && <Empty>{all.length ? '이 유형의 기록이 없습니다' : '이 과목의 공부 기록이 아직 없습니다'}</Empty>}
      {groups.map((g) => {
        const day = parseDateKey(g.key);
        const rel = relDay(day);
        return (
          <div key={g.key} className="col gap6">
            <div className="row between baseline sp-date">
              <span className="strong small">
                {fmtMDW(day)}
                {rel === '오늘' || rel === '어제' ? ` · ${rel}` : ''}
              </span>
              <span className="mono muted xsmall">합계 {fmtHM(g.items.reduce((t, x) => t + x.netSeconds, 0))}</span>
            </div>
            <div className="card list">
              {g.items.map((e) => (
                <button type="button" key={e.id} className="rec" onClick={() => go('records/' + g.key + '/' + e.id)}>
                  <div className="row between gap8">
                    <span className="type-pill" style={{ background: s.soft, color: s.color }}>
                      {TYPE_NAME[e.type]}
                    </span>
                    <span className="mono muted xsmall nowrap">
                      {clock(e.startAt)}–{clock(e.endAt)} · {fmtHM(e.netSeconds)}
                    </span>
                  </div>
                  {e.progress ? <span className="tl-progress">{e.progress}</span> : <span className="tl-progress muted">진도 미입력 — 눌러서 추가</span>}
                  {sessionMemoLine(e) && <span className="tl-memo">{sessionMemoLine(e)}</span>}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
