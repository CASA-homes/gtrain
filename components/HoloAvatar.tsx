'use client';
import { useState, type CSSProperties } from 'react';
import type { Holo } from '@/lib/holo';

const abs: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' };

/** Shiny holo profile picture: club-colour artwork, foil sweep, sparkle, and a glare that follows the cursor. */
export function HoloAvatar({ holo, alt, size = 168 }: { holo: Holo; alt: string; size?: number }) {
  const [m, setM] = useState({ x: 30, y: 30, on: false });
  const rx = m.on ? ((50 - m.y) / 50) * 9 : 0;
  const ry = m.on ? ((m.x - 50) / 50) * 11 : 0;
  const pos = `${m.x}% ${m.y}%`;
  return (
    <div
      onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setM({ x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100), on: true }); }}
      onMouseLeave={() => setM({ x: 30, y: 30, on: false })}
      style={{
        width: size, height: size, flex: 'none', position: 'relative', borderRadius: size * 0.15, padding: Math.max(3, size * 0.0125), boxSizing: 'border-box',
        transform: `perspective(${size * 2.3}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`, transition: 'transform .12s ease-out',
        background: 'linear-gradient(135deg, #ffffff 0%, #a9bdd8 18%, #f3f6fb 34%, #0c2347 50%, #d4a62a 64%, #fff3c4 76%, #a9bdd8 100%)',
        boxShadow: '0 14px 30px rgb(12 35 71 / .35), 0 0 0 1px rgb(255 255 255 / .5) inset',
      }}>
      <div className="holo-anim" style={{ ...abs, borderRadius: size * 0.15, mixBlendMode: 'overlay', background: 'linear-gradient(115deg, transparent 25%, rgb(255 255 255 / .95) 40%, rgb(212 166 42 / .8) 50%, rgb(255 255 255 / .95) 60%, transparent 75%)', backgroundSize: '300% 300%', animation: 'holoSweep 5s ease-in-out infinite' }} />
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: size * 0.125, overflow: 'hidden', background: '#0c2347' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={holo.art} alt="" style={{ ...abs, width: '100%', height: '100%', objectFit: 'cover' }} />
        <div className="holo-anim" style={{ ...abs, mixBlendMode: 'color-dodge', opacity: 0.7, background: 'linear-gradient(120deg, transparent 18%, #6f8fbf 28%, #ffffff 36%, #a9bdd8 42%, #d4a62a 50%, #fff3c4 56%, #6f8fbf 64%, #ffffff 70%, transparent 82%)', backgroundSize: '280% 280%', animation: 'holoSweep 6s ease-in-out infinite' }} />
        <div style={{ ...abs, mixBlendMode: 'color-dodge', opacity: m.on ? 0.85 : 0.45, background: 'linear-gradient(60deg, transparent 20%, #a9bdd8 32%, #ffffff 40%, #d4a62a 48%, #ffffff 56%, #1f4479 66%, transparent 80%)', backgroundSize: '240% 240%', backgroundPosition: pos }} />
        <div style={{ ...abs, mixBlendMode: 'overlay', opacity: 0.55, background: 'repeating-linear-gradient(55deg, rgb(255 255 255 / 0) 0 6px, rgb(255 255 255 / .45) 6px 7px, rgb(255 255 255 / 0) 7px 10px, rgb(212 166 42 / .35) 10px 11px)' }} />
        <div className="holo-anim" style={{ ...abs, mixBlendMode: 'screen', background: 'radial-gradient(circle, rgb(255 255 255 / .95) 0 0.8px, transparent 1.4px) 0 0 / 17px 17px, radial-gradient(circle, rgb(255 243 196 / .9) 0 0.7px, transparent 1.3px) 8px 9px / 23px 23px', animation: 'holoTwinkle 2.6s ease-in-out infinite' }} />
        <div style={{ ...abs, mixBlendMode: 'screen', opacity: m.on ? 0.95 : 0.4, background: `radial-gradient(circle at ${pos}, rgb(255 255 255 / .7), rgb(169 189 216 / .25) 25%, transparent 50%)` }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={holo.photo} alt={alt} style={{ position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)', height: '100%', filter: 'drop-shadow(0 6px 10px rgb(7 9 14 / .55))' }} />
        <div style={{ ...abs, mixBlendMode: 'soft-light', opacity: m.on ? 0.6 : 0.25, background: 'linear-gradient(115deg, transparent 30%, rgb(255 255 255 / .8) 45%, rgb(212 166 42 / .5) 52%, transparent 65%)', backgroundSize: '250% 250%', backgroundPosition: pos }} />
      </div>
    </div>
  );
}
