'use client';
import { useState } from 'react';
import { SquadTable, type SquadPlayer } from '@/components/SquadTable';

/** Squad on the left, analysis on the right. Opening Last 5 widens the squad side. */
export function ClubhouseSplit({ players, teamId, editable, saved, children }: {
  players: SquadPlayer[]; teamId: number; editable: boolean; saved: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="split">
      <section style={{ flex: open ? '999 1 760px' : '1 1 600px', minWidth: 0 }}>
        <SquadTable players={players} teamId={teamId} editable={editable} saved={saved} onToggle={setOpen} />
      </section>
      <aside style={{ flex: open ? '1 1 380px' : '1 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
        {children}
      </aside>
    </div>
  );
}
