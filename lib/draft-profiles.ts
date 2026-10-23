import p2024 from './draft-profiles-2024.json';

// Draft profiles: what the scouts said before each player was drafted.
// Facts and junior numbers from Rookie Me Central's AFL Draft Guides; the summary, strengths and improvements are
// our own short read of each guide page, not their text. Each profile links back to the guide.
export interface DraftProfile {
  year: number;                 // draft year
  name: string;                 // as drafted
  junior: string;               // junior club
  state?: string;
  position?: string;
  height?: number;              // cm
  dob?: string;
  projection?: string;          // where the guide had him going, e.g. "1-5"
  stats?: { label: string; value: string }[];   // junior numbers, e.g. disposals, marks, AFL Fantasy
  statsFrom?: string;           // e.g. "U18 Championships"
  athletic?: Record<string, string>;            // e.g. { Speed: 'Above avg' }
  onField?: Record<string, string>;
  strengths: string[];
  improvements: string[];
  summary: string;              // our own one-to-two-sentence read
  source: { title: string; url: string; page?: number };
}

export const DRAFT_PROFILES: DraftProfile[] = [...(p2024 as DraftProfile[])];

const key = (year: number, name: string) => `${year}|${name.toLowerCase().replace(/[^a-z]/g, '')}`;
const INDEX = new Map(DRAFT_PROFILES.map((p) => [key(p.year, p.name), p]));
export const draftProfileFor = (year: number | null | undefined, name: string | null | undefined) =>
  year && name ? INDEX.get(key(year, name)) ?? null : null;
