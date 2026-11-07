import { redirect } from 'next/navigation';

// The men's round 1 test now lives inside Live Matchups.
export default function MensRoundPage() { redirect('/live/matchups'); }
