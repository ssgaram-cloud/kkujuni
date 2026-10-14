import { useSettings, useSync } from '../lib/hooks';
import { clock, parseDateKey, startOfDay } from '../lib/time';
import { Icon } from './Icon';
import { go } from './ui';

export function Brand({ size = 34 }: { size?: number }) {
  return (
    <span className="brand">
      <img src="./icon.svg" width={size} height={size} alt="" />
      <span>꾸준이</span>
    </span>
  );
}

export function DDay() {
  const s = useSettings();
  if (!s.examDate) {
    return (
      <button type="button" className="pill dark" onClick={() => go('settings')}>
        시험일 설정
      </button>
    );
  }
  const d = Math.round((parseDateKey(s.examDate) - startOfDay(Date.now())) / 86400000);
  return <span className="pill dark">{d > 0 ? `D-${d}` : d === 0 ? 'D-DAY' : `D+${-d}`}</span>;
}

export function SyncPill({ long }: { long?: boolean }) {
  const st = useSync();
  const map: Record<string, { icon: string; text: string; cls: string }> = {
    off: { icon: 'cloudOff', text: '동기화 꺼짐', cls: 'muted' },
    idle: { icon: 'cloud', text: st.pending ? `올릴 변경 ${st.pending}건` : '동기화됨', cls: 'ok' },
    syncing: { icon: 'sync', text: '동기화 중', cls: 'muted' },
    offline: { icon: 'cloudOff', text: '오프라인', cls: 'warn' },
    auth: { icon: 'cloudOff', text: '다시 연결 필요', cls: 'warn' },
    error: { icon: 'cloudOff', text: '동기화 오류', cls: 'warn' }
  };
  const m = map[st.status];
  return (
    <button type="button" className={'sync-pill ' + m.cls} onClick={() => go('settings')} title={st.message || undefined}>
      <Icon name={m.icon} size={18} />
      <span>{m.text}</span>
      {long && st.lastSync && st.status === 'idle' && <span className="sub">마지막 {clock(st.lastSync)}</span>}
    </button>
  );
}
