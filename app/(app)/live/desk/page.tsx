import { redirect } from 'next/navigation';

// The battle desk is gone; Mini Games has its own home now.
export default function BattleDeskPage() { redirect('/live/mini'); }
