import { AuthRequired, dropToken, getToken } from './auth';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const FOLDER = 'application/vnd.google-apps.folder';

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  mimeType?: string;
  createdTime?: string;
}

export class DriveError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${getToken()}` }
  });
  if (res.status === 401) {
    dropToken();
    throw new AuthRequired('구글 연결이 만료되었습니다');
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error?.message || msg;
    } catch {
      /* noop */
    }
    throw new DriveError(res.status, `Drive ${res.status}: ${msg}`);
  }
  return res;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export async function listFiles(q: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = '';
  do {
    const p = new URLSearchParams({
      q,
      fields: 'nextPageToken,files(id,name,modifiedTime,mimeType,createdTime)',
      pageSize: '1000',
      spaces: 'drive',
      orderBy: 'createdTime'
    });
    if (pageToken) p.set('pageToken', pageToken);
    const j = await (await call(`${API}/files?${p}`)).json();
    out.push(...j.files);
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

export async function findFolder(name: string, parent?: string): Promise<DriveFile | null> {
  let q = `name='${esc(name)}' and mimeType='${FOLDER}' and trashed=false`;
  if (parent) q += ` and '${parent}' in parents`;
  const r = await listFiles(q);
  return r[0] || null;
}

export async function createFolder(name: string, parent?: string): Promise<DriveFile> {
  const res = await call(`${API}/files?fields=id,name,modifiedTime`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: parent ? [parent] : undefined })
  });
  return res.json();
}

export async function ensureFolder(name: string, parent?: string): Promise<string> {
  const f = await findFolder(name, parent);
  return f ? f.id : (await createFolder(name, parent)).id;
}

export async function getMeta(id: string): Promise<DriveFile> {
  return (await call(`${API}/files/${id}?fields=id,name,modifiedTime,trashed`)).json();
}

export async function download(id: string): Promise<Response> {
  return call(`${API}/files/${id}?alt=media`);
}

function multipart(meta: object, body: Blob | string, type: string): { body: Blob; boundary: string } {
  const boundary = 'b' + Math.random().toString(36).slice(2);
  const blob = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: ${type}\r\n\r\n`,
      body,
      `\r\n--${boundary}--`
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );
  return { body: blob, boundary };
}

export async function createFile(name: string, parent: string, body: Blob | string, type: string): Promise<DriveFile> {
  const mp = multipart({ name, parents: [parent], mimeType: type }, body, type);
  const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=id,name,modifiedTime`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${mp.boundary}` },
    body: mp.body
  });
  return res.json();
}

export async function updateFile(id: string, body: Blob | string, type: string): Promise<DriveFile> {
  const res = await call(`${UPLOAD}/files/${id}?uploadType=media&fields=id,name,modifiedTime`, {
    method: 'PATCH',
    headers: { 'Content-Type': type },
    body
  });
  return res.json();
}

/** 영구 삭제 대신 휴지통으로 이동 */
export async function trashFile(id: string): Promise<void> {
  await call(`${API}/files/${id}?fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true })
  });
}
