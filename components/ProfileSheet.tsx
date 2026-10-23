import { InfoPopover } from '@/components/InfoPopover';
import { DraftProfileCard } from '@/components/DraftProfileCard';
import type { DraftProfile } from '@/lib/draft-profiles';

/** YouTube search for this year's highlights: always lands on something current, unlike a fixed video link. */
export function HighlightsLink({ name, year = 2026 }: { name: string; year?: number }) {
  return (
    <a className="btn" target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} ${year} highlights`)}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="#d0021b" d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8Z" /><path fill="#fff" d="m9.75 15.02 5.75-3.02-5.75-3.02z" /></svg>
      {year} highlights
    </a>
  );
}

/** The "Draft profile" link and its pop-up sheet: pick line, optional highlights button, then the Rookie Me profile. */
export function ProfileSheet({ name, profile, context, label = 'Draft profile', highlights }: {
  name: string; profile: DraftProfile; context: string; label?: string; highlights?: number;
}) {
  return (
    <InfoPopover title={name} label={label}>
      <span className="muted" style={{ fontSize: 13, marginTop: -8 }}>{context}</span>
      {highlights && <HighlightsLink name={name} year={highlights} />}
      <DraftProfileCard d={profile} />
    </InfoPopover>
  );
}
