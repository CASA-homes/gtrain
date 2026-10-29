'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { setClubLogo } from '@/app/(app)/clubhouse/[id]/logo-actions';

const VIEW = 260;   // on-screen crop box, px
const OUT = 512;    // saved logo, px square

type Img = { el: HTMLImageElement; w: number; h: number; url: string };

/** Drag to position, slide to zoom; saves exactly what's inside the square as a 512px WebP. */
function Cropper({ img, onCancel, onSave, busy }: { img: Img; onCancel: () => void; onSave: (b: Blob) => void; busy: boolean }) {
  const base = VIEW / Math.min(img.w, img.h);          // scale at which the image just covers the box
  const [zoom, setZoom] = useState(1);
  const s = base * zoom;
  const clamp = (o: { x: number; y: number }, sc = s) => ({
    x: Math.min(0, Math.max(VIEW - img.w * sc, o.x)),
    y: Math.min(0, Math.max(VIEW - img.h * sc, o.y)),
  });
  const [off, setOff] = useState(() => ({ x: (VIEW - img.w * base) / 2, y: (VIEW - img.h * base) / 2 }));
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const setZoomAround = (z: number) => {
    // Keep the centre of the box steady while zooming.
    const ns = base * z, c = VIEW / 2;
    const ix = (c - off.x) / s, iy = (c - off.y) / s;
    setZoom(z);
    setOff(clamp({ x: c - ix * ns, y: c - iy * ns }, ns));
  };

  const save = () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = OUT;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.el, -off.x / s, -off.y / s, VIEW / s, VIEW / s, 0, 0, OUT, OUT);
    canvas.toBlob((b) => b && onSave(b), 'image/webp', 0.9);
  };

  return (
    <div className="logo-modal" role="dialog" aria-modal="true" aria-label="Crop your club logo" onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="logo-modal-card">
        <b style={{ fontSize: 16 }}>Crop your logo</b>
        <span className="muted" style={{ fontSize: 13 }}>Drag to move, slide to zoom. Everything inside the square is saved.</span>
        <div
          className="logo-crop"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, ox: off.x, oy: off.y }; }}
          onPointerMove={(e) => { const d = drag.current; if (d) setOff(clamp({ x: d.ox + e.clientX - d.px, y: d.oy + e.clientY - d.py })); }}
          onPointerUp={() => { drag.current = null; }}
          onWheel={(e) => setZoomAround(Math.min(5, Math.max(1, zoom - e.deltaY * 0.002)))}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.url} alt="" draggable={false}
            style={{ position: 'absolute', left: 0, top: 0, width: img.w * s, height: img.h * s, transform: `translate(${off.x}px, ${off.y}px)`, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none' }} />
          <span className="logo-crop-ring" />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, width: VIEW, fontSize: 13 }}>
          <span aria-hidden>−</span>
          <input type="range" min={1} max={5} step={0.01} value={zoom} onChange={(e) => setZoomAround(Number(e.target.value))} style={{ flex: 1 }} aria-label="Zoom" />
          <span aria-hidden>+</span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="muted" style={{ fontSize: 12 }}>Preview</span>
          <LivePreview img={img} off={off} s={s} size={52} radius={14} />
          <LivePreview img={img} off={off} s={s} size={26} radius={8} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn dark" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save logo'}</button>
        </div>
      </div>
    </div>
  );
}

function LivePreview({ img, off, s, size, radius }: { img: Img; off: { x: number; y: number }; s: number; size: number; radius: number }) {
  const k = size / VIEW;
  return (
    <span style={{ position: 'relative', width: size, height: size, borderRadius: radius, overflow: 'hidden', display: 'inline-block', background: 'var(--ink)', flex: 'none' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img.url} alt="" style={{ position: 'absolute', left: 0, top: 0, width: img.w * s * k, height: img.h * s * k, transform: `translate(${off.x * k}px, ${off.y * k}px)`, maxWidth: 'none' }} />
    </span>
  );
}

export function ClubLogoEditor({ teamId, hasLogo }: { teamId: number; hasLogo: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [img, setImg] = useState<Img | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => () => { if (img) URL.revokeObjectURL(img.url); }, [img]);

  const pick = (file: File | undefined) => {
    if (input.current) input.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMsg('Pick an image file'); return; }
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => { setMsg(null); setImg({ el, w: el.naturalWidth, h: el.naturalHeight, url }); };
    el.onerror = () => { URL.revokeObjectURL(url); setMsg('Couldn’t read that image. Try a JPG or PNG.'); };
    el.src = url;
  };

  const upload = (blob: Blob) => start(async () => {
    try {
      const supabase = createClient();
      // A fresh file name every time: no overwrite needed, and browsers never show a stale cached logo.
      const path = `${teamId}/${Date.now()}.webp`;
      const up = await supabase.storage.from('club-logos').upload(path, blob, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' });
      if (up.error) throw new Error(/row-level|security/i.test(up.error.message) ? 'Not allowed: you can only change your own club’s logo.' : up.error.message);
      const r = await setClubLogo(teamId, supabase.storage.from('club-logos').getPublicUrl(path).data.publicUrl);
      if (!r.ok) throw new Error(r.error);
      setImg(null);
      setMsg(null);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  });

  return (
    <span className="logo-edit">
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" disabled={pending} onClick={() => input.current?.click()}>{hasLogo ? 'Change logo' : 'Add logo'}</button>
      {hasLogo && <button type="button" disabled={pending} onClick={() => start(async () => { const r = await setClubLogo(teamId, null); if (!r.ok) setMsg(r.error ?? 'Failed'); router.refresh(); })}>Remove</button>}
      {msg && !img && <span className="logo-edit-msg">{msg}</span>}
      {img && createPortal(
        <>
          <Cropper img={img} busy={pending} onCancel={() => { setImg(null); setMsg(null); }} onSave={upload} />
          {msg && <span className="logo-edit-msg" style={{ position: 'fixed', zIndex: 101, bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#c8352b', color: '#fff', padding: '6px 12px', borderRadius: 8, maxWidth: 320 }}>{msg}</span>}
        </>,
        document.body,
      )}
    </span>
  );
}
