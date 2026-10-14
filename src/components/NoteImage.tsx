import { useEffect, useState } from 'react';
import { loadImage } from '../lib/google/sync';
import type { ImageRef } from '../lib/types';
import { Icon } from './Icon';

/** 오답 이미지: 로컬 캐시 → 없으면 드라이브에서 받아 표시 */
export function NoteImage({ img, alt, className, onClick }: { img: ImageRef; alt: string; className?: string; onClick?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let u: string | null = null;
    let live = true;
    setMissing(false);
    void loadImage(img.id, img.driveId).then((b) => {
      if (!live) return;
      if (b) {
        u = URL.createObjectURL(b);
        setUrl(u);
      } else setMissing(true);
    });
    return () => {
      live = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [img.id, img.driveId]);

  if (!url)
    return (
      <div className={'img-ph ' + (className || '')}>
        <Icon name="image" size={22} />
        <span>{missing ? '이미지를 불러오려면 구글 연결이 필요해요' : '불러오는 중'}</span>
      </div>
    );
  if (onClick)
    return (
      <button type="button" className={'img-btn ' + (className || '')} onClick={onClick} aria-label={alt + ' 크게 보기'}>
        <img src={url} alt={alt} />
      </button>
    );
  return <img className={className} src={url} alt={alt} />;
}
