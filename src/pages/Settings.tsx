import { useEffect, useState } from 'react';
import { Brand } from '../components/bits';
import { Icon } from '../components/Icon';
import { confirmAsk, useToast } from '../components/ui';
import { SUBJECT, TYPE_NAME } from '../lib/constants';
import { exportAll, importAll, saveSettings } from '../lib/data';
import { db, getDeviceId } from '../lib/db';
import { connect, disconnect, getClientId, setClientId } from '../lib/google/auth';
import { syncNow } from '../lib/google/sync';
import { useKv, useSettings, useSync } from '../lib/hooks';
import { clock, dateKey, fmtMD } from '../lib/time';

function download(name: string, body: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function SettingsPage() {
  const s = useSettings();
  const sync = useSync();
  const toast = useToast();
  const connected = useKv<boolean>('google.connected', false);
  const [clientId, setCid] = useState('');
  const [savedCid, setSavedCid] = useState('');
  const [dev, setDev] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getClientId().then((v) => {
      setCid(v);
      setSavedCid(v);
    });
    void getDeviceId().then(setDev);
  }, []);

  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));

  const onConnect = async () => {
    setBusy(true);
    try {
      if (clientId.trim() !== savedCid) {
        await setClientId(clientId);
        setSavedCid(clientId.trim());
      }
      await connect();
      toast('구글드라이브에 연결했어요. 동기화를 시작합니다');
      await syncNow();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onCsv = async () => {
    const rows = (await db.sessions.orderBy('startAt').toArray()).filter((x) => !x.deleted);
    const head = ['날짜', '과목', '유형', '시작', '종료', '순공부(분)', '순공부(시간)', '진도', '메모', '문항수', '정답수', '구분'];
    const lines = rows.map((r) =>
      [
        dateKey(r.startAt),
        SUBJECT[r.subject].name,
        TYPE_NAME[r.type],
        clock(r.startAt),
        clock(r.endAt),
        Math.round(r.netSeconds / 60),
        (r.netSeconds / 3600).toFixed(2),
        r.progress,
        r.memo,
        r.solved ?? '',
        r.correct ?? '',
        r.source === 'manual' ? '수동' : r.auto ? '자동종료' : '타이머'
      ]
        .map(csvCell)
        .join(',')
    );
    download(`꾸준이_공부기록_${dateKey(Date.now())}.csv`, '﻿' + [head.join(','), ...lines].join('\r\n'), 'text/csv;charset=utf-8');
  };

  const onExport = async () => {
    download(`꾸준이_백업_${dateKey(Date.now())}.json`, JSON.stringify(await exportAll(), null, 1), 'application/json');
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const n = await importAll(JSON.parse(await f.text()));
      toast(`${n}건을 가져왔어요`);
    } catch {
      toast('백업 파일을 읽지 못했어요');
    }
  };

  const onReset = async () => {
    if (!confirmAsk('이 기기의 모든 기록·오답·설정을 지웁니다. 구글드라이브에 올라간 데이터는 남습니다. 계속할까요?')) return;
    if (!confirmAsk('정말 지울까요? 되돌릴 수 없습니다.')) return;
    await disconnect().catch(() => undefined);
    await db.delete();
    location.reload();
  };

  const statusText: Record<string, string> = {
    off: '연결 안 됨',
    idle: '동기화됨',
    syncing: '동기화 중…',
    offline: '오프라인',
    auth: '다시 연결 필요',
    error: '오류'
  };

  return (
    <div className="page settings">
      <h1 className="page-title">설정</h1>

      <section className="card col gap12">
        <h3 className="card-title">시험 · 목표</h3>
        <label className="field">
          <span>1차 시험일</span>
          <input type="date" value={s.examDate || ''} onChange={(e) => void saveSettings({ examDate: e.target.value || null })} />
        </label>
        <div className="grid2">
          <label className="field">
            <span>하루 목표 (분)</span>
            <input type="number" inputMode="numeric" min={0} step={30} value={s.dailyGoalMin} onChange={(e) => void saveSettings({ dailyGoalMin: num(e.target.value, 0, 1440) })} />
          </label>
          <label className="field">
            <span>주간 목표 (분)</span>
            <input type="number" inputMode="numeric" min={0} step={60} value={s.weeklyGoalMin} onChange={(e) => void saveSettings({ weeklyGoalMin: num(e.target.value, 0, 10080) })} />
          </label>
          <label className="field">
            <span>최소 기록 시간 (초)</span>
            <input type="number" inputMode="numeric" min={0} step={30} value={s.minSessionSec} onChange={(e) => void saveSettings({ minSessionSec: num(e.target.value, 0, 3600) })} />
          </label>
          <label className="field">
            <span>연속 공부일 기준 (분)</span>
            <input type="number" inputMode="numeric" min={1} step={10} value={s.streakMinMin} onChange={(e) => void saveSettings({ streakMinMin: num(e.target.value, 1, 1440) })} />
          </label>
        </div>
        <label className="field">
          <span>화면</span>
          <select className="select full" value={s.theme} onChange={(e) => void saveSettings({ theme: e.target.value as 'system' | 'light' | 'dark' })}>
            <option value="system">시스템 설정 따름</option>
            <option value="light">라이트</option>
            <option value="dark">다크</option>
          </select>
        </label>
      </section>

      <section className="card col gap12">
        <div className="row between">
          <h3 className="card-title">구글드라이브 동기화</h3>
          <span className={'status-dot ' + sync.status}>{statusText[sync.status]}</span>
        </div>
        <p className="muted small">
          PC와 휴대폰이 같은 구글 계정의 드라이브에 있는 <b>꾸준이</b> 폴더를 함께 씁니다. 앱이 만든 파일 외에는 드라이브의 다른 파일을 읽지 않습니다.
        </p>
        <label className="field">
          <span>OAuth 클라이언트 ID</span>
          <input value={clientId} onChange={(e) => setCid(e.target.value)} placeholder="1234…apps.googleusercontent.com" autoComplete="off" spellCheck={false} />
        </label>
        <details className="help">
          <summary>클라이언트 ID 발급 방법</summary>
          <ol>
            <li>console.cloud.google.com 에서 새 프로젝트를 만듭니다.</li>
            <li>API 및 서비스 → 라이브러리에서 <b>Google Drive API</b>를 사용 설정합니다.</li>
            <li>OAuth 동의 화면: 외부 / 테스트 상태로 두고 테스트 사용자에 본인 Gmail을 추가합니다.</li>
            <li>사용자 인증 정보 → OAuth 클라이언트 ID → 웹 애플리케이션. 승인된 JavaScript 원본에 이 앱 주소(예: https://아이디.github.io)를 넣습니다.</li>
            <li>발급된 클라이언트 ID를 위 칸에 붙여넣고 PC·휴대폰 모두에서 연결을 누릅니다.</li>
          </ol>
        </details>
        {sync.message && <p className="warn-box small">{sync.message}</p>}
        <div className="row gap8 wrap">
          {connected && sync.status !== 'auth' ? (
            <>
              <button type="button" className="btn primary" disabled={busy || sync.status === 'syncing'} onClick={() => void syncNow()}>
                <Icon name="sync" size={16} />
                지금 동기화
              </button>
              <button
                type="button"
                className="btn outline"
                onClick={async () => {
                  await disconnect();
                  void syncNow();
                  toast('연결을 해제했어요. 이 기기의 데이터는 그대로 남습니다');
                }}
              >
                연결 해제
              </button>
            </>
          ) : (
            <button type="button" className="btn primary" disabled={busy || !clientId.trim()} onClick={() => void onConnect()}>
              {connected ? '다시 연결' : '구글 계정 연결'}
            </button>
          )}
        </div>
        <span className="muted xsmall">
          마지막 동기화 {sync.lastSync ? `${fmtMD(sync.lastSync)} ${clock(sync.lastSync)}` : '없음'}
          {sync.pending ? ` · 올릴 변경 ${sync.pending}건` : ''}
        </span>
      </section>

      <section className="card col gap10">
        <h3 className="card-title">백업 · 내보내기</h3>
        <div className="row gap8 wrap">
          <button type="button" className="btn outline" onClick={() => void onCsv()}>
            <Icon name="download" size={16} />
            공부기록 CSV (엑셀)
          </button>
          <button type="button" className="btn outline" onClick={() => void onExport()}>
            <Icon name="download" size={16} />
            전체 백업 (JSON)
          </button>
          <label className="btn outline">
            <Icon name="upload" size={16} />
            백업 가져오기
            <input type="file" accept="application/json,.json" hidden onChange={(e) => void onImport(e.target.files?.[0])} />
          </label>
        </div>
        <p className="muted xsmall">JSON 백업에는 오답 이미지가 들어가지 않습니다. 이미지는 구글드라이브 동기화로 보관하세요.</p>
      </section>

      <section className="card col gap10">
        <h3 className="card-title">앱 정보</h3>
        <div className="row gap10">
          <Brand size={40} />
          <span className="muted xsmall">v1.0 · 기기 {dev}</span>
        </div>
        <button type="button" className="btn outline danger self-start" onClick={() => void onReset()}>
          이 기기의 데이터 초기화
        </button>
      </section>
    </div>
  );
}

