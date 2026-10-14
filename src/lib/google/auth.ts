import { kvGet, kvSet } from '../db';

/** 앱이 만든 파일에만 접근하는 최소 권한 (PRD F6-02) */
export const SCOPE = 'https://www.googleapis.com/auth/drive.file';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (o?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }) => TokenClient;
          revoke: (token: string, cb?: () => void) => void;
        };
      };
    };
  }
}

export class AuthRequired extends Error {
  constructor(msg = '구글 연결이 필요합니다') {
    super(msg);
    this.name = 'AuthRequired';
  }
}

const TOKEN_KEY = 'gtoken';
let token: { value: string; exp: number } | null = null;

try {
  const raw = sessionStorage.getItem(TOKEN_KEY);
  if (raw) token = JSON.parse(raw);
} catch {
  /* 세션 저장소 사용 불가 */
}

export async function getClientId(): Promise<string> {
  const custom = await kvGet<string>('google.clientId', '');
  return (custom || import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
}

export async function setClientId(id: string): Promise<void> {
  await kvSet('google.clientId', id.trim());
}

export async function isConnected(): Promise<boolean> {
  return kvGet<boolean>('google.connected', false);
}

export function hasValidToken(): boolean {
  return !!token && token.exp - 60_000 > Date.now();
}

export function getToken(): string {
  if (!hasValidToken()) throw new AuthRequired();
  return (token as { value: string }).value;
}

export function dropToken(): void {
  token = null;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* noop */
  }
}

let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('구글 로그인 스크립트를 불러오지 못했습니다 (오프라인 또는 차단)'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

/**
 * 구글 로그인 · 토큰 발급. 버튼 클릭 등 사용자 동작 안에서 호출해야 팝업이 막히지 않는다.
 */
export async function connect(): Promise<void> {
  const clientId = await getClientId();
  if (!clientId) throw new Error('설정에서 Google OAuth 클라이언트 ID를 먼저 입력하세요');
  await loadGis();
  await new Promise<void>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new Error(r.error_description || r.error || '구글 인증 실패'));
          return;
        }
        token = { value: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000 };
        try {
          sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
        } catch {
          /* noop */
        }
        resolve();
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? '로그인 창이 닫혔습니다' : e.message || e.type))
    });
    client.requestAccessToken({ prompt: '' });
  });
  await kvSet('google.connected', true);
}

export async function disconnect(): Promise<void> {
  const t = token?.value;
  dropToken();
  await kvSet('google.connected', false);
  if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t);
}
