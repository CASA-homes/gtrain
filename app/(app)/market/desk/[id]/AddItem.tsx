'use client';
import { useMemo, useState } from 'react';

export interface Asset { key: string; teamId: number; label: string; points: number; kind: 'player' | 'pick' }
interface TeamLite { id: number; name: string }

/**
 * Two ways onto the table: offer something of yours to any team, or ask another team for something of theirs.
 * Either way your team is on one side of the move, which is what the database enforces.
 */
export function AddItem({ myTeamId, teams, assets, action, bank }: {
  myTeamId: number; teams: TeamLite[]; assets: Asset[]; action: (form: FormData) => void; bank?: number | null;
}) {
  const [mode, setMode] = useState<'give' | 'ask' | 'kt'>('give');
  const [ktDir, setKtDir] = useState<'pay' | 'ask'>('pay');
  const [kt, setKt] = useState('');
  const others = teams.filter((t) => t.id !== myTeamId);
  const [other, setOther] = useState<number>(others[0]?.id ?? 0);
  const [asset, setAsset] = useState('');
  const list = useMemo(
    () => assets.filter((a) => a.teamId === (mode === 'give' ? myTeamId : other)),
    [assets, mode, myTeamId, other],
  );
  const from = mode === 'give' || (mode === 'kt' && ktDir === 'pay') ? myTeamId : other;
  const to = from === myTeamId ? other : myTeamId;
  const ktNum = Math.floor(Number(kt) || 0);

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div role="tablist" aria-label="Add to the deal" style={{ display: 'inline-flex', alignSelf: 'flex-start', padding: 3, borderRadius: 10, background: 'var(--line)', gap: 2 }}>
        {([['give', 'Offer from my list'], ['ask', 'Ask another team'], ...(bank != null ? [['kt', 'Tokens (KT)']] as const : [])] as const).map(([m, l]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m as 'give' | 'ask' | 'kt'); setAsset(''); }}
            style={{ padding: '6px 12px', borderRadius: 8, border: 0, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: mode === m ? '#fff' : 'transparent', color: mode === m ? 'var(--ink)' : 'var(--muted)' }}>
            {l}
          </button>
        ))}
      </div>
      {mode === 'kt' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }} className="muted">
            Direction
            <select className="input" value={ktDir} onChange={(e) => setKtDir(e.target.value as 'pay' | 'ask')}>
              <option value="pay">I pay them</option>
              <option value="ask">They pay me</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }} className="muted">
            {ktDir === 'pay' ? 'Pay to' : 'From'}
            <select className="input" value={other} onChange={(e) => setOther(Number(e.target.value))}>
              {others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }} className="muted">
            Amount (KT){ktDir === 'pay' && bank != null ? ` · you have ${bank.toLocaleString('en-AU')}` : ''}
            <input className="input" type="number" inputMode="numeric" min={1} step={1} value={kt} onChange={(e) => setKt(e.target.value)} placeholder="e.g. 250" required />
          </label>
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }} className="muted">
          {mode === 'give' ? 'Send to' : 'From'}
          <select className="input" value={other} onChange={(e) => { setOther(Number(e.target.value)); setAsset(''); }}>
            {others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, gridColumn: 'span 2' }} className="muted">
          {mode === 'give' ? 'Your player or pick' : 'Their player or pick'}
          <select className="input" value={asset} onChange={(e) => setAsset(e.target.value)} required>
            <option value="">Choose…</option>
            <optgroup label="Picks">
              {list.filter((a) => a.kind === 'pick').map((a) => <option key={a.key} value={a.key}>{a.label} · {a.points.toLocaleString()} pts</option>)}
            </optgroup>
            <optgroup label="Players">
              {list.filter((a) => a.kind === 'player').map((a) => <option key={a.key} value={a.key}>{a.label} · {a.points.toLocaleString()} pts</option>)}
            </optgroup>
          </select>
        </label>
      </div>
      )}
      <input type="hidden" name="asset" value={mode === 'kt' ? `kt:${ktNum}` : asset} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <div>
        <button type="submit" className="btn dark" disabled={mode === 'kt' ? ktNum < 1 : !asset}>{mode === 'kt' ? (ktDir === 'pay' ? 'Offer the tokens' : 'Ask for tokens') : mode === 'give' ? 'Put it on the table' : 'Ask for it'}</button>
        <span className="muted" style={{ fontSize: 12, marginLeft: 10 }}>Any change clears everyone’s acceptance.</span>
      </div>
    </form>
  );
}
