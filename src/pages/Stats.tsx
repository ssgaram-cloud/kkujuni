import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Dot } from '../components/ui';
import { SUBJECTS, TYPES, TYPE_COLORS } from '../lib/constants';
import { useActive, useNow, useSessions, useSettings } from '../lib/hooks';
import { aggregate, earliestStart, streakDays, weeklyTotals, type Period } from '../lib/stats';
import {
  addDays,
  addMonths,
  dateKey,
  fmtHM,
  fmtMD,
  fmtMDW,
  fmtSignedHM,
  startOfDay,
  startOfMonth,
  startOfWeek,
  weekdayName
} from '../lib/time';

const PERIODS: { id: Period; name: string }[] = [
  { id: 'day', name: '일간' },
  { id: 'week', name: '주간' },
  { id: 'month', name: '월간' },
  { id: 'all', name: '전체' }
];

function range(p: Period, offset: number, now: number, first: number | null): [number, number, number, number] {
  if (p === 'day') {
    const a = addDays(startOfDay(now), offset);
    return [a, addDays(a, 1), addDays(a, -1), a];
  }
  if (p === 'week') {
    const a = addDays(startOfWeek(now), offset * 7);
    return [a, addDays(a, 7), addDays(a, -7), a];
  }
  if (p === 'month') {
    const a = addMonths(startOfMonth(now), offset);
    return [a, addMonths(a, 1), addMonths(a, -1), a];
  }
  const a = startOfWeek(first ?? now);
  return [a, addDays(startOfDay(now), 1), a, a];
}

export function Stats() {
  const sessions = useSessions();
  const active = useActive();
  const settings = useSettings();
  const now = useNow(active ? 5000 : 60000);
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  const list = sessions || [];
  const first = earliestStart(list);
  const [from, to, pFrom, pTo] = range(period, offset, now, first);

  const agg = useMemo(() => aggregate(list, from, to, active, now), [list, from, to, active, now]);
  const prev = useMemo(() => (period === 'all' ? null : aggregate(list, pFrom, pTo, null, now)), [list, pFrom, pTo, period, now]);
  const allAgg = useMemo(() => aggregate(list, addDays(startOfDay(now), -400), addDays(startOfDay(now), 1), active, now), [list, active, now]);
  const streak = streakDays(allAgg.byDay, settings.streakMinMin, now);

  const nDays = Math.max(1, Math.round((Math.min(to, addDays(startOfDay(now), 1)) - from) / 86400000));
  const label =
    period === 'day'
      ? fmtMDW(from)
      : period === 'week'
        ? `${fmtMD(from)} (월) – ${fmtMD(addDays(to, -1))} (일)`
        : period === 'month'
          ? `${new Date(from).getFullYear()}년 ${new Date(from).getMonth() + 1}월`
          : `${fmtMD(from)} – 오늘`;
  const diff = prev ? agg.total - prev.total : 0;
  const diffPct = prev && prev.total ? (diff / prev.total) * 100 : null;
  const maxSubj = Math.max(1, ...SUBJECTS.map((s) => agg.bySubj[s.id]));

  // 추이: 주간·월간 = 일별, 전체 = 주별
  const bars: { key: string; label: string; total: number; parts: number[] }[] = [];
  if (period === 'week' || period === 'month') {
    for (let d = from; d < to; d = addDays(d, 1)) {
      const b = agg.byDay[dateKey(d)];
      bars.push({
        key: dateKey(d),
        label: period === 'week' ? weekdayName(d) : String(new Date(d).getDate()),
        total: b?.total || 0,
        parts: SUBJECTS.map((s) => b?.bySubj[s.id] || 0)
      });
    }
  } else if (period === 'all') {
    for (const w of weeklyTotals(agg.byDay, from, to)) bars.push({ key: String(w.label), label: fmtMD(w.label), total: w.total, parts: [w.total] });
  }
  const goalSec = period === 'all' ? settings.weeklyGoalMin * 60 : settings.dailyGoalMin * 60;
  const barMax = Math.max(goalSec, ...bars.map((b) => b.total), 1);
  const periodGoal =
    period === 'day' ? settings.dailyGoalMin * 60 : period === 'week' ? settings.weeklyGoalMin * 60 : period === 'month' ? settings.dailyGoalMin * 60 * nDays : 0;

  const cellMax = Math.max(1, ...SUBJECTS.flatMap((s) => TYPES.map((t) => agg.matrix[s.id][t.id])));

  return (
    <div className="page">
      <h1 className="page-title">통계</h1>
      <div className="seg" role="tablist" aria-label="기간">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={period === p.id}
            className={period === p.id ? 'on' : ''}
            onClick={() => {
              setPeriod(p.id);
              setOffset(0);
            }}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="row between">
        <button type="button" className="icon-btn boxed" aria-label="이전 기간" onClick={() => setOffset((o) => o - 1)} disabled={period === 'all'}>
          <Icon name="left" />
        </button>
        <span className="period-label">{label}</span>
        <button type="button" className="icon-btn boxed" aria-label="다음 기간" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={period === 'all' || offset >= 0}>
          <Icon name="right" />
        </button>
      </div>

      <div className="stats-grid">
        <section className="card row between end">
          <div className="col gap4">
            <span className="muted small">총 공부시간</span>
            <span className="mono big">{fmtHM(agg.total)}</span>
            {periodGoal > 0 && <span className="muted xsmall">목표 {fmtHM(periodGoal)} · {Math.round((agg.total / periodGoal) * 100)}%</span>}
          </div>
          <div className="col end gap4">
            {prev && (
              <>
                <span className="muted xsmall">직전 {PERIODS.find((p) => p.id === period)?.name.replace('간', '')} 대비</span>
                <span className={'strong ' + (diff >= 0 ? 'pos' : 'neg')}>
                  {fmtSignedHM(diff)}
                  {diffPct != null && ` (${diff >= 0 ? '+' : ''}${diffPct.toFixed(1)}%)`}
                </span>
              </>
            )}
            <span className="muted xsmall">
              {period !== 'day' && `일평균 ${fmtHM(agg.total / nDays)} · `}연속 {streak}일
            </span>
          </div>
        </section>

        <section className="card col gap12">
          <h3 className="card-title">과목별</h3>
          {SUBJECTS.map((s) => (
            <div key={s.id} className="col gap6">
              <div className="row between small">
                <span className="strong">{s.name}</span>
                <span className="mono muted2">
                  {fmtHM(agg.bySubj[s.id])} · {agg.total ? ((agg.bySubj[s.id] / agg.total) * 100).toFixed(1) : '0.0'}%
                </span>
              </div>
              <div className="bar thick">
                <div style={{ width: (agg.bySubj[s.id] / maxSubj) * 100 + '%', background: s.color }} />
              </div>
            </div>
          ))}
        </section>

        <section className="card col gap12">
          <h3 className="card-title">유형별</h3>
          <div className="stack">
            {TYPES.map((t, i) =>
              agg.byType[t.id] > 0 ? <div key={t.id} style={{ width: (agg.byType[t.id] / agg.total) * 100 + '%', background: TYPE_COLORS[i] }} title={t.name} /> : null
            )}
            {agg.total === 0 && <div style={{ width: '100%', background: 'var(--line)' }} />}
          </div>
          <div className="legend">
            {TYPES.map((t, i) => (
              <div key={t.id} className="row between xsmall">
                <span className="row gap6">
                  <span className="sw" style={{ background: TYPE_COLORS[i] }} />
                  {t.name}
                </span>
                <span className="mono muted2">
                  {fmtHM(agg.byType[t.id])} · {agg.total ? ((agg.byType[t.id] / agg.total) * 100).toFixed(1) : '0.0'}%
                </span>
              </div>
            ))}
          </div>
        </section>

        {bars.length > 0 && (
          <section className="card col gap12">
            <div className="row between baseline">
              <h3 className="card-title">{period === 'all' ? '주별 추이' : '일별 추이'}</h3>
              <span className="muted xsmall">점선 = {period === 'all' ? '주' : '일'} 목표 {fmtHM(goalSec)}</span>
            </div>
            <div className={'trend' + (bars.length > 10 ? ' dense' : '')}>
              <div className="goal-line" style={{ bottom: (goalSec / barMax) * 120 + 'px' }} />
              {bars.map((b) => (
                <div key={b.key} className="trend-col" title={`${b.label} ${fmtHM(b.total)}`}>
                  {bars.length <= 10 && <span className="mono trend-val">{b.total ? fmtHM(b.total) : ''}</span>}
                  <div className="trend-bar" style={{ height: (b.total / barMax) * 120 + 'px' }}>
                    {period !== 'all' &&
                      b.parts.map((v, i) => (v > 0 ? <div key={i} style={{ flex: v, background: SUBJECTS[i].color }} /> : null))}
                  </div>
                  <span className="trend-lbl">{b.label}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="card col gap10">
          <h3 className="card-title">과목 × 유형</h3>
          <div className="matrix-wrap">
            <table className="matrix">
              <thead>
                <tr>
                  <th />
                  {TYPES.map((t) => (
                    <th key={t.id}>{t.short}</th>
                  ))}
                  <th>합계</th>
                </tr>
              </thead>
              <tbody>
                {SUBJECTS.map((s) => (
                  <tr key={s.id}>
                    <th>
                      <span className="row gap6">
                        <Dot color={s.color} size={6} />
                        {s.short}
                      </span>
                    </th>
                    {TYPES.map((t) => {
                      const v = agg.matrix[s.id][t.id];
                      const a = v ? 0.12 + (v / cellMax) * 0.78 : 0;
                      return (
                        <td key={t.id} className="mono" style={v ? { background: `rgba(30,64,175,${a.toFixed(2)})`, color: a > 0.5 ? '#fff' : undefined } : undefined}>
                          {v ? fmtHM(v) : '–'}
                        </td>
                      );
                    })}
                    <td className="mono tot">{fmtHM(agg.bySubj[s.id])}</td>
                  </tr>
                ))}
                <tr>
                  <th>합계</th>
                  {TYPES.map((t) => (
                    <td key={t.id} className="mono tot">
                      {fmtHM(agg.byType[t.id])}
                    </td>
                  ))}
                  <td className="mono tot">{fmtHM(agg.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
