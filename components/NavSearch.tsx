'use client';
// Header search: a button in the top ribbon (or Ctrl/⌘ K, or /) opens a quick search over clubs, coaches, players and pages.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchHit } from '@/app/api/search/route';

const PAGES: { title: string; sub: string; href: string; words: string }[] = [
  { title: 'Clubhouse', sub: 'Every club', href: '/clubhouse', words: 'clubs teams home' },
  { title: 'Players', sub: 'Player database', href: '/players', words: 'search stats' },
  { title: 'Trademarket', sub: 'Trades and offers', href: '/market', words: 'trade offers listings' },
  { title: 'League', sub: 'Ladder, history, honours', href: '/league', words: 'ladder table history honours' },
  { title: 'League settings', sub: 'Rules and scoring', href: '/league/settings', words: 'rules scoring settings cup prizes' },
  { title: 'Rankings', sub: 'Power rankings', href: '/rankings', words: 'power ratings' },
  { title: 'Draft', sub: 'G-Train picks', href: '/draft', words: 'picks order' },
  { title: 'Draft Centre', sub: 'Draft night, settings, results', href: '/draft/centre', words: 'draft night countdown sign-off' },
  { title: 'Draft Room', sub: 'Live draft', href: '/draft/room', words: 'live draft queue' },
  { title: 'Mock draft', sub: '2027 mock draft', href: '/draft/mock', words: 'mock' },
  { title: 'Crystal ball', sub: 'Draft prospects', href: '/draft/crystal-ball', words: 'prospects rookies twomey phantom' },
  { title: 'Matchday', sub: 'Squad selector', href: '/live', words: 'lineup squad selector captain' },
  { title: 'Live matchups', sub: 'Scores this round', href: '/live/matchups', words: 'scores matchups' },
  { title: 'Knockout Cup', sub: 'Groups, bracket, prizes', href: '/live/cup', words: 'cup knockout bracket' },
  { title: 'Mini games', sub: 'Side games', href: '/live/mini', words: 'mini games side' },
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function NavSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);

  // Ctrl/⌘ K anywhere, or / when not typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (open) { setTimeout(() => input.current?.focus(), 10); } else { setQ(''); setHits([]); setActive(0); } }, [open]);

  // Debounced lookup.
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(s)}`, { signal: ctl.signal }).then((r) => r.json())
        .then((d: { hits: SearchHit[] }) => { setHits(d.hits ?? []); setActive(0); setLoading(false); })
        .catch(() => {});
    }, 140);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const pages = useMemo(() => {
    const s = norm(q);
    if (!s) return PAGES.slice(0, 6);
    return PAGES.filter((p) => norm(`${p.title} ${p.words}`).includes(s)).slice(0, 4);
  }, [q]);
  const results = useMemo(() => [
    ...hits.map((h) => ({ group: h.kind === 'club' ? 'Clubs' : h.kind === 'coach' ? 'Coaches' : 'Players', title: h.title, sub: h.sub, href: h.href, avg: h.avg ?? null, kind: h.kind })),
    ...pages.map((p) => ({ group: 'Pages', title: p.title, sub: p.sub, href: p.href, avg: null, kind: 'page' as const })),
  ], [hits, pages]);

  const go = (href: string) => { setOpen(false); router.push(href); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active].href); }
  };

  let lastGroup = '';
  return (
    <>
      <button type="button" className="nav-search" onClick={() => setOpen(true)} aria-label="Search clubs, coaches and players" title="Search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        <span className="nav-search-label">Search</span>
        <kbd className="nav-search-kbd">{mac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
      {open && (
        <div className="ns-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="ns-box" role="dialog" aria-modal="true" aria-label="Search">
            <div className="ns-input">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} placeholder="Search a club, coach, player or page"
                aria-label="Search" role="combobox" aria-expanded={results.length > 0} aria-controls="ns-list" aria-activedescendant={results[active] ? `ns-${active}` : undefined} autoComplete="off" spellCheck={false} />
              <button type="button" className="ns-esc" onClick={() => setOpen(false)}>Esc</button>
            </div>
            <div className="ns-list" id="ns-list" role="listbox">
              {q.trim().length >= 2 && !loading && hits.length === 0 && pages.length === 0 && <div className="ns-empty">Nothing found for “{q.trim()}”.</div>}
              {results.map((r, i) => {
                const head = r.group !== lastGroup ? r.group : null;
                lastGroup = r.group;
                return (
                  <div key={`${r.href}-${i}`}>
                    {head && <div className="ns-group">{head}{head === 'Pages' && !q.trim() ? ' · quick links' : ''}</div>}
                    <button type="button" id={`ns-${i}`} role="option" aria-selected={i === active} className={`ns-row ${i === active ? 'on' : ''}`}
                      onMouseEnter={() => setActive(i)} onClick={() => go(r.href)}>
                      <span className={`nsr-ic ${r.kind}`} aria-hidden="true">{r.kind === 'club' ? '◆' : r.kind === 'coach' ? '●' : r.kind === 'player' ? '▲' : '↗'}</span>
                      <span className="ns-t"><b>{r.title}</b><small>{r.sub}</small></span>
                      {r.avg != null && <em className="ns-avg">{r.avg.toFixed(1)}</em>}
                    </button>
                  </div>
                );
              })}
              {loading && <div className="ns-empty">Searching…</div>}
            </div>
            <div className="ns-foot"><span>↑↓ to move · Enter to open · Esc to close</span><span>Players include unowned AFL players</span></div>
          </div>
        </div>
      )}
    </>
  );
}
