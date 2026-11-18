'use client';
// "Add Keeper HQ to your home screen" pop-up for phones. Android/Chrome gets a one-tap Install button;
// iPhone Safari can't install from a button, so it shows the Share → Add to Home Screen steps.
// Hidden once installed, and for 14 days after "Not now".
import { useEffect, useState } from 'react';

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const KEY = 'khq_install_snooze';

export function InstallPrompt() {
  const [mode, setMode] = useState<'android' | 'ios' | null>(null);
  const [evt, setEvt] = useState<BIP | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
    if (standalone) return;
    let snoozed = false;
    try { snoozed = Number(localStorage.getItem(KEY) || 0) > Date.now(); } catch { /* storage off */ }
    if (snoozed) return;
    const ua = navigator.userAgent;
    const phone = /iPhone|iPad|iPod|Android/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
    if (!phone) return;
    const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
    const onBip = (e: Event) => { e.preventDefault(); setEvt(e as BIP); setMode('android'); };
    window.addEventListener('beforeinstallprompt', onBip);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (ios) t = setTimeout(() => setMode('ios'), 2500);
    return () => { window.removeEventListener('beforeinstallprompt', onBip); if (t) clearTimeout(t); };
  }, []);

  const close = () => { try { localStorage.setItem(KEY, String(Date.now() + 14 * 864e5)); } catch { /* storage off */ } setMode(null); };
  if (!mode) return null;
  return (
    <div className="ip" role="dialog" aria-label="Install Keeper HQ">
      <img src="/icons/icon-192.png?v=3" alt="" width={44} height={44} />
      <div className="ip-body">
        <b>Put Keeper HQ on your home screen</b>
        {mode === 'android'
          ? <span>Opens full screen like an app, one tap away.</span>
          : <span>Tap <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg> Share in Safari, then <b>Add to Home Screen</b>.</span>}
        <div className="ip-acts">
          {mode === 'android' && evt && <button className="ip-go" onClick={async () => { await evt.prompt(); await evt.userChoice.catch(() => null); setMode(null); }}>Install</button>}
          <button className="ip-no" onClick={close}>Not now</button>
        </div>
      </div>
    </div>
  );
}
