import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/* ---------------- 토스트 ---------------- */

const ToastCtx = createContext<(msg: string) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  const seq = useRef(0);
  const push = useCallback((msg: string) => {
    const id = ++seq.current;
    setItems((x) => [...x, { id, msg }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- 해시 라우터 ---------------- */

export function parseRoute(hash: string): string[] {
  const h = hash.replace(/^#\/?/, '');
  return h ? h.split('/').map(decodeURIComponent) : ['home'];
}

export function useRoute(): string[] {
  const [r, setR] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const f = () => setR(parseRoute(window.location.hash));
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

export function go(path: string): void {
  window.location.hash = '#/' + path.replace(/^\//, '');
}

/* ---------------- 모달 / 바텀시트 ---------------- */

export function Sheet({
  title,
  onClose,
  children,
  wide
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={'sheet' + (wide ? ' sheet-wide' : '')} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <h2>{title}</h2>
          {onClose && (
            <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>
              <Icon name="close" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function confirmAsk(msg: string): boolean {
  return window.confirm(msg);
}

/* ---------------- 공통 조각 ---------------- */

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="dot" style={{ background: color, width: size, height: size }} aria-hidden="true" />;
}

export function Chip({
  on,
  color,
  onClick,
  children,
  small
}: {
  on: boolean;
  color?: string;
  onClick: () => void;
  children: ReactNode;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      className={'chip' + (on ? ' on' : '') + (small ? ' small' : '')}
      style={on && color ? { background: color, borderColor: color } : undefined}
      aria-pressed={on}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
