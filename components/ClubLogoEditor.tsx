'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { setClubLogo } from '@/app/(app)/clubhouse/[id]/logo-actions';

/** Square-crop and shrink an image to 256px WebP in the browser, so uploads are small and badges look sharp. */
async function toSquare(file: File, size = 256): Promise<Blob> {
  const img = await createImageBitmap(file);
  const s = Math.min(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that image'))), 'image/webp', 0.9));
}

export function ClubLogoEditor({ teamId, hasLogo }: { teamId: number; hasLogo: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMsg('Pick an image file'); return; }
    setMsg('Uploading…');
    start(async () => {
      try {
        const blob = await toSquare(file);
        const supabase = createClient();
        const path = `${teamId}/${Date.now()}.webp`;
        const up = await supabase.storage.from('club-logos').upload(path, blob, { contentType: 'image/webp', upsert: true });
        if (up.error) throw new Error(up.error.message.includes('not found') ? 'Logos go live once the commish runs the latest database update.' : up.error.message);
        const url = supabase.storage.from('club-logos').getPublicUrl(path).data.publicUrl;
        const r = await setClubLogo(teamId, url);
        if (!r.ok) throw new Error(r.error);
        setMsg(null);
        router.refresh();
      } catch (e) {
        setMsg((e as Error).message);
      }
      if (input.current) input.current.value = '';
    });
  };

  return (
    <span className="logo-edit">
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" disabled={pending} onClick={() => input.current?.click()}>{hasLogo ? 'Change logo' : 'Add logo'}</button>
      {hasLogo && <button type="button" disabled={pending} onClick={() => start(async () => { const r = await setClubLogo(teamId, null); if (!r.ok) setMsg(r.error ?? 'Failed'); router.refresh(); })}>Remove</button>}
      {msg && <span className="logo-edit-msg">{msg}</span>}
    </span>
  );
}
