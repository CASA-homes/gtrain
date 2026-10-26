import p2020 from './draft-profiles-2020.json';
import p2021 from './draft-profiles-2021.json';
import p2022 from './draft-profiles-2022.json';
import p2023 from './draft-profiles-2023.json';
import p2024 from './draft-profiles-2024.json';
import p2025 from './draft-profiles-2025.json';
import p2026 from './draft-profiles-2026.json';

// Draft profiles: what the scouts said before each player was drafted.
// Facts and junior numbers from Rookie Me Central's AFL Draft Guides; the summary, strengths and improvements are
// our own short read of each guide page, not their text. Each profile links back to the guide.
// 2020: Rookie Me's 2020 draft guide (facts, strengths, work-ons, junior numbers) plus ESPN's final 2020 phantom draft for the scouting read.
// 2021–2023: from each player's Rookie Me Central draft profile page.
// 2026 prospects (no guide yet): from Rookie Me's 2026 power rankings, combine results and scouting notes.
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

export const DRAFT_PROFILES: DraftProfile[] = [...(p2020 as DraftProfile[]), ...(p2021 as DraftProfile[]), ...(p2022 as DraftProfile[]), ...(p2023 as DraftProfile[]), ...(p2024 as DraftProfile[]), ...(p2025 as DraftProfile[]), ...(p2026 as DraftProfile[])];

const key = (year: number, name: string) => `${year}|${name.toLowerCase().replace(/[^a-z]/g, '')}`;
const INDEX = new Map(DRAFT_PROFILES.map((p) => [key(p.year, p.name), p]));
export const draftProfileFor = (year: number | null | undefined, name: string | null | undefined) =>
  year && name ? INDEX.get(key(year, name)) ?? null : null;
