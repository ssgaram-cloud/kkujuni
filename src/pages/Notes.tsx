import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { NoteImage } from '../components/NoteImage';
import { Chip, Empty, confirmAsk, go, useToast } from '../components/ui';
import { REASONS, REVIEW_GAPS, SUBJECTS, SUBJECT } from '../lib/constants';
import { addReview, correctStreak, deleteNote, emptyNote, saveNote, startSession, storeImage } from '../lib/data';
import { db } from '../lib/db';
import { useNotes } from '../lib/hooks';
import { compressImage } from '../lib/image';
import { dateKey, fmtMD, parseDateKey } from '../lib/time';
import type { ImageRef, SubjectId, WrongNote, WrongReason } from '../lib/types';

const todayKey = () => dateKey(Date.now());
const isDue = (n: WrongNote) => n.status === 'active' && !!n.nextReviewAt && n.nextReviewAt <= todayKey();

function reviewLine(n: WrongNote): string {
  if (n.status === 'done') return '복습 완료';
  if (!n.reviews.length) return '복습 전';
  return `복습 ${n.reviews.length}회 · ${fmtMD(n.reviews[n.reviews.length - 1].at)}`;
}

/* ---------------- 목록 ---------------- */

export function NotesList({ dueOnly }: { dueOnly?: boolean }) {
  const notes = useNotes();
  const [subj, setSubj] = useState<SubjectId | 'ALL'>('ALL');
  const [reason, setReason] = useState<WrongReason | 'ALL'>('ALL');
  const [status, setStatus] = useState<'active' | 'done' | 'ALL'>('active');
  const [q, setQ] = useState('');
  const list = (notes || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  const due = list.filter(isDue);
  const query = q.trim().toLowerCase();
  const shown = (dueOnly ? due : list).filter(
    (n) =>
      (subj === 'ALL' || n.subject === subj) &&
      (reason === 'ALL' || n.reasons.includes(reason)) &&
      (dueOnly || status === 'ALL' || n.status === status) &&
      (!query || (n.chapter + ' ' + n.sourceRef + ' ' + n.memo).toLowerCase().includes(query))
  );

  return (
    <div className="page">
      <header className="row between">
        <div className="row gap8 baseline">
          {dueOnly && (
            <button type="button" className="icon-btn" aria-label="오답노트 목록으로" onClick={() => go('notes')}>
              <Icon name="left" />
            </button>
          )}
          <h1 className="page-title">{dueOnly ? '오늘 복습할 오답' : '오답노트'}</h1>
          <span className="muted small">{shown.length}건</span>
        </div>
        <button type="button" className="btn dark compact" onClick={() => go('notes/new')}>
          <Icon name="plus" size={16} stroke={2.2} />
          오답 등록
        </button>
      </header>

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
      <div className="row gap6 wrap">
        <select className="select" aria-label="오답 사유" value={reason} onChange={(e) => setReason(e.target.value as WrongReason | 'ALL')}>
          <option value="ALL">오답 사유 전체</option>
          {REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        {!dueOnly && (
          <select className="select" aria-label="복습 상태" value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'done' | 'ALL')}>
            <option value="active">복습 중</option>
            <option value="done">복습 완료</option>
            <option value="ALL">상태 전체</option>
          </select>
        )}
        <label className="search slim grow">
          <Icon name="search" size={16} />
          <input type="search" aria-label="단원·출처 검색" value={q} onChange={(e) => setQ(e.target.value)} placeholder="단원·출처 검색" />
        </label>
      </div>

      {!dueOnly && due.length > 0 && (
        <button type="button" className="due-banner" onClick={() => go('notes/due')}>
          <span className="col gap2">
            <b>오늘 복습할 오답 {due.length}건</b>
            <span className="xsmall">1·3·7·14일 간격 자동 배정</span>
          </span>
          <span className="row gap4 strong small">
            시작 <Icon name="right" size={16} />
          </span>
        </button>
      )}

      {shown.length === 0 ? (
        <Empty>{list.length === 0 ? '틀린 문제를 사진으로 찍어 등록해 보세요.' : '조건에 맞는 오답이 없습니다.'}</Empty>
      ) : (
        <div className="note-grid">
          {shown.map((n) => (
            <button type="button" key={n.id} className="card note-card" onClick={() => go('notes/' + n.id)}>
              <div className="note-thumb">
                {n.problemImages[0] ? <NoteImage img={n.problemImages[0]} alt={`${n.chapter} 문제`} /> : <div className="img-ph"><Icon name="image" size={22} /></div>}
                <span className="tag-abs" style={{ background: SUBJECT[n.subject].color }}>
                  {SUBJECT[n.subject].name}
                </span>
                {isDue(n) && <span className="due-abs">오늘 복습</span>}
              </div>
              <div className="note-body">
                <span className="strong small">{n.chapter || '단원 미입력'}</span>
                <span className="muted xsmall">{n.sourceRef}</span>
                <span className="row gap4 wrap">
                  {n.reasons.map((r) => (
                    <span key={r} className="mini-tag">
                      {r}
                    </span>
                  ))}
                </span>
                <span className="muted xsmall">{reviewLine(n)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- 상세 ---------------- */

export function NoteDetail({ id }: { id: string }) {
  const note = useLiveQuery(() => db.notes.get(id), [id]);
  const [showAns, setShowAns] = useState(false);
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState<ImageRef | null>(null);
  const toast = useToast();
  useEffect(() => {
    setShowAns(false);
    setIdx(0);
  }, [id]);

  if (note === undefined) return <div className="page" />;
  if (!note || note.deleted)
    return (
      <div className="page">
        <Empty>삭제되었거나 없는 오답입니다.</Empty>
        <button type="button" className="btn outline" onClick={() => go('notes')}>
          목록으로
        </button>
      </div>
    );
  const s = SUBJECT[note.subject];
  const streak = correctStreak(note);
  const cur = note.problemImages[Math.min(idx, note.problemImages.length - 1)];

  const review = async (r: 'correct' | 'wrong') => {
    await addReview(note.id, r);
    toast(r === 'correct' ? (streak + 1 >= 3 ? '3회 연속 정답! 복습 완료 처리했어요' : '맞힘 기록') : '또 틀림 — 내일 다시 복습해요');
  };

  return (
    <div className="page detail">
      <header className="row between">
        <button type="button" className="icon-btn" aria-label="목록으로" onClick={() => history.length > 1 ? history.back() : go('notes')}>
          <Icon name="left" size={22} />
        </button>
        <span className="strong">오답 상세</span>
        <div className="row gap4">
          <button type="button" className="icon-btn" aria-label="편집" onClick={() => go(`notes/${note.id}/edit`)}>
            <Icon name="edit" />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="삭제"
            onClick={async () => {
              if (!confirmAsk('이 오답을 삭제할까요? 이미지도 함께 지워집니다.')) return;
              await deleteNote(note.id);
              toast('삭제했어요');
              go('notes');
            }}
          >
            <Icon name="trash" />
          </button>
        </div>
      </header>

      <div className="col gap6">
        <div className="row gap6 wrap">
          <span className="tag" style={{ background: s.color }}>
            {s.name}
          </span>
          {note.reasons.map((r) => (
            <span key={r} className="mini-tag">
              {r}
            </span>
          ))}
          {note.status === 'done' && <span className="mini-tag ok">복습 완료</span>}
        </div>
        <h1 className="detail-title">{note.chapter || '단원 미입력'}</h1>
        <span className="muted small">
          {note.sourceRef} · 등록 {fmtMD(note.createdAt)}
        </span>
      </div>

      <div className="detail-cols">
        <section className="col gap8">
          <div className="row between">
            <h3 className="sec-title">문제</h3>
            {note.problemImages.length > 1 && (
              <span className="mono muted xsmall">
                {Math.min(idx, note.problemImages.length - 1) + 1} / {note.problemImages.length}
              </span>
            )}
          </div>
          {cur ? (
            <div className="viewer">
              <NoteImage img={cur} alt="문제 이미지" className="viewer-img" onClick={() => setZoom(cur)} />
              {note.problemImages.length > 1 && (
                <div className="row gap6 center">
                  <button type="button" className="icon-btn boxed" aria-label="이전 이미지" onClick={() => setIdx((i) => (i - 1 + note.problemImages.length) % note.problemImages.length)}>
                    <Icon name="left" />
                  </button>
                  <button type="button" className="icon-btn boxed" aria-label="다음 이미지" onClick={() => setIdx((i) => (i + 1) % note.problemImages.length)}>
                    <Icon name="right" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Empty>문제 이미지가 없습니다</Empty>
          )}

          <h3 className="sec-title">해설</h3>
          {note.answerImages.length === 0 ? (
            <Empty>해설 이미지가 없습니다</Empty>
          ) : showAns ? (
            <div className="col gap8">
              {note.answerImages.map((im) => (
                <NoteImage key={im.id} img={im} alt="해설 이미지" className="viewer-img" onClick={() => setZoom(im)} />
              ))}
              <button type="button" className="btn outline compact self-end" onClick={() => setShowAns(false)}>
                해설 가리기
              </button>
            </div>
          ) : (
            <button type="button" className="reveal" onClick={() => setShowAns(true)}>
              <Icon name="eye" />
              해설 보기
            </button>
          )}
        </section>

        <section className="col gap10">
          {note.memo && (
            <div className="card col gap4">
              <span className="muted xsmall strong">메모</span>
              <span className="pre">{note.memo}</span>
            </div>
          )}
          <div className="card col gap8">
            <div className="row between">
              <span className="muted xsmall strong">복습 이력</span>
              <span className="xsmall">
                연속 정답 {Math.min(streak, 3)} / 3 · 다음 복습 {note.status === 'done' ? '완료' : note.nextReviewAt ? fmtMD(parseDateKey(note.nextReviewAt)) : '-'}
              </span>
            </div>
            <div className="row gap6 wrap">
              {note.reviews.length === 0 && <span className="muted xsmall">아직 복습 기록이 없어요 · 간격 {REVIEW_GAPS.join('·')}일</span>}
              {note.reviews.map((r, i) => (
                <span key={i} className={'mini-tag ' + (r.result === 'correct' ? 'ok' : 'bad')}>
                  {fmtMD(r.at)} {r.result === 'correct' ? '맞힘' : '또 틀림'}
                </span>
              ))}
            </div>
          </div>
          <div className="grid2">
            <button type="button" className="btn outline-color big-btn" style={{ color: '#B45309', borderColor: '#B45309' }} onClick={() => void review('wrong')}>
              또 틀림
            </button>
            <button type="button" className="btn big-btn" style={{ background: '#0F766E', color: '#fff' }} onClick={() => void review('correct')}>
              맞힘
            </button>
          </div>
          <button
            type="button"
            className="btn soft"
            onClick={async () => {
              const r = await startSession(note.subject, 'WRG');
              toast(r.autoClosed ? '진행 중이던 공부를 종료하고 오답복습을 시작했어요' : `${s.name} 오답복습 타이머를 시작했어요`);
            }}
          >
            <Icon name="play" size={12} />
            {s.name} · 오답복습 타이머 시작
          </button>
        </section>
      </div>

      {zoom && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="이미지 크게 보기" onClick={() => setZoom(null)}>
          <NoteImage img={zoom} alt="확대 이미지" className="lightbox-img" />
          <button type="button" className="icon-btn light" aria-label="닫기" onClick={() => setZoom(null)}>
            <Icon name="close" size={24} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- 등록 · 편집 ---------------- */

export function NoteEditor({ id }: { id?: string }) {
  const toast = useToast();
  const existing = useLiveQuery(async () => (id ? ((await db.notes.get(id)) ?? null) : null), [id]);
  const allNotes = useNotes();
  const [n, setN] = useState<WrongNote | null>(null);
  const [busy, setBusy] = useState(0);
  const added = useRef<string[]>([]);
  const removed = useRef<string[]>([]);
  const saved = useRef(false);

  useEffect(() => {
    if (n) return;
    if (id && existing) setN(existing);
    else if (!id) setN(emptyNote('ACC'));
  }, [id, existing, n]);

  // 저장하지 않고 나가면 새로 올린 이미지는 버린다
  useEffect(
    () => () => {
      if (saved.current) return;
      for (const imgId of added.current) void db.images.update(imgId, { trashed: true, blob: undefined });
    },
    []
  );

  const chapters = useMemo(() => [...new Set((allNotes || []).map((x) => x.chapter).filter(Boolean))], [allNotes]);

  const addFiles = async (files: FileList | File[] | null, which: 'problemImages' | 'answerImages') => {
    if (!files || !n) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const room = 5 - n[which].length;
    if (arr.length > room) toast('이미지는 최대 5장까지 넣을 수 있어요');
    setBusy((b) => b + 1);
    try {
      const refs: ImageRef[] = [];
      for (const f of arr.slice(0, Math.max(0, room))) {
        const blob = await compressImage(f);
        const imgId = await storeImage(n.id, blob);
        added.current.push(imgId);
        refs.push({ id: imgId });
      }
      setN((x) => (x ? { ...x, [which]: [...x[which], ...refs] } : x));
    } finally {
      setBusy((b) => b - 1);
    }
  };

  // PC: 클립보드 붙여넣기 (Ctrl+V)는 문제 이미지로
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []);
      if (files.length) {
        e.preventDefault();
        void addFiles(files, 'problemImages');
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  if (!n) return <div className="page" />;

  const removeImg = (which: 'problemImages' | 'answerImages', imgId: string) => {
    removed.current.push(imgId);
    setN({ ...n, [which]: n[which].filter((r) => r.id !== imgId) });
  };
  const toggleReason = (r: WrongReason) => setN({ ...n, reasons: n.reasons.includes(r) ? n.reasons.filter((x) => x !== r) : [...n.reasons, r] });

  const onSave = async () => {
    if (!n.problemImages.length && !n.chapter.trim()) {
      toast('문제 이미지나 단원 중 하나는 입력해 주세요');
      return;
    }
    for (const imgId of removed.current) await db.images.update(imgId, { trashed: true, blob: undefined });
    await saveNote({ ...n, chapter: n.chapter.trim(), sourceRef: n.sourceRef.trim() });
    saved.current = true;
    toast(id ? '수정했어요' : '오답을 등록했어요');
    go('notes/' + n.id);
  };

  const imgBlock = (which: 'problemImages' | 'answerImages', label: string) => (
    <div className="col gap8">
      <span className="field-label">
        {label} <span className="muted xsmall">{n[which].length}/5</span>
      </span>
      <div
        className="drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void addFiles(e.dataTransfer.files, which);
        }}
      >
        {n[which].map((r) => (
          <div key={r.id} className="drop-item">
            <NoteImage img={r} alt={label} />
            <button type="button" className="rm" aria-label={`${label} 삭제`} onClick={() => removeImg(which, r.id)}>
              <Icon name="close" size={14} stroke={2.4} />
            </button>
          </div>
        ))}
        {n[which].length < 5 && (
          <div className="drop-add">
            <label className="add-btn">
              <Icon name="camera" />
              촬영
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => void addFiles(e.target.files, which)} />
            </label>
            <label className="add-btn">
              <Icon name="image" />
              사진 선택
              <input type="file" accept="image/*" multiple hidden onChange={(e) => void addFiles(e.target.files, which)} />
            </label>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="page editor">
      <header className="row between">
        <button type="button" className="icon-btn" aria-label="취소" onClick={() => (history.length > 1 ? history.back() : go('notes'))}>
          <Icon name="left" size={22} />
        </button>
        <span className="strong">{id ? '오답 편집' : '오답 등록'}</span>
        <button type="button" className="btn dark compact" disabled={busy > 0} onClick={() => void onSave()}>
          {busy > 0 ? '이미지 처리 중' : '저장'}
        </button>
      </header>

      <div className="col gap6">
        <span className="field-label">과목</span>
        <div className="chips">
          {SUBJECTS.map((s) => (
            <Chip key={s.id} on={n.subject === s.id} color={s.color} onClick={() => setN({ ...n, subject: s.id })}>
              {s.name}
            </Chip>
          ))}
        </div>
      </div>
      <div className="grid2 stack-narrow">
        <label className="field">
          <span>단원</span>
          <input list="chapters" value={n.chapter} onChange={(e) => setN({ ...n, chapter: e.target.value })} placeholder="예: 리스 · 리스부채 측정" />
          <datalist id="chapters">
            {chapters.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>출처</span>
          <input value={n.sourceRef} onChange={(e) => setN({ ...n, sourceRef: e.target.value })} placeholder="예: 2025 기출 23번 / 모의 3회 12번" />
        </label>
      </div>
      {imgBlock('problemImages', '문제 이미지')}
      <p className="muted xsmall hint-wide">PC에서는 이미지를 끌어다 놓거나 Ctrl+V로 붙여넣을 수 있어요.</p>
      {imgBlock('answerImages', '해설 이미지 (선택)')}
      <div className="col gap6">
        <span className="field-label">오답 사유</span>
        <div className="chips">
          {REASONS.map((r) => (
            <Chip key={r} on={n.reasons.includes(r)} onClick={() => toggleReason(r)}>
              {r}
            </Chip>
          ))}
        </div>
      </div>
      <label className="field">
        <span>메모</span>
        <textarea rows={3} value={n.memo} onChange={(e) => setN({ ...n, memo: e.target.value })} placeholder="왜 틀렸는지, 다음에 볼 포인트" />
      </label>
    </div>
  );
}
