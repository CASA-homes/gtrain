'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Msg { id: string; team_id: number; body: string; pinned: boolean; created_at: string }
interface TeamLite { id: number; name: string; short_code: string }

const HUES = ['#1f6b3a', '#3f7fb5', '#7a5fc0', '#c48a1f', '#d0583f', '#4f9a5f', '#151a16', '#8a6a12', '#2a3a2f', '#7a1d12'];
const fmt = (iso: string) => new Date(iso).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

/** League chat. New messages arrive live through Supabase Realtime. */
export function Chat({ initial, teams, myTeamId }: { initial: Msg[]; teams: TeamLite[]; myTeamId: number }) {
  const [msgs, setMsgs] = useState(initial);
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const supabase = useRef(createClient()).current;
  const team = (id: number) => teams.find((t) => t.id === id);

  useEffect(() => {
    const ch = supabase
      .channel('league-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const m = payload.new as Msg;
        setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setErr(null);
    const { data, error } = await supabase.from('chat_messages').insert({ team_id: myTeamId, body: text }).select().single();
    if (error) return setErr('Message didn’t send. Check your connection and try again.');
    setBody('');
    setMsgs((cur) => (cur.some((x) => x.id === data.id) ? cur : [...cur, data as Msg]));
  }

  const pinned = msgs.filter((m) => m.pinned);
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {pinned.map((m) => (
        <div key={m.id} style={{ padding: '12px 18px', background: 'var(--ribbon)', borderBottom: '1px solid var(--ribbon-line)', fontSize: 13 }}>
          <b>Pinned · {team(m.team_id)?.name}:</b> {m.body}
        </div>
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '6px 0', maxHeight: 520, overflowY: 'auto' }}>
        {msgs.length === 0 && <div className="muted" style={{ padding: '14px 18px' }}>No chat yet. Start the banter.</div>}
        {msgs.map((m) => {
          const t = team(m.team_id);
          return (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr)', gap: 12, padding: '10px 18px' }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: HUES[(m.team_id - 1) % HUES.length], color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '600 12px var(--font)' }}>{t?.short_code}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span className="muted" style={{ fontSize: 12 }}><b style={{ color: 'var(--ink)', fontSize: 13 }}>{t?.name}</b> · {fmt(m.created_at)}</span>
                <span style={{ overflowWrap: 'anywhere' }}>{m.body}</span>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--line)' }}>
        <label htmlFor="chat-body" className="sr-only">Message the league</label>
        <input id="chat-body" className="input" style={{ flex: '1 1 auto' }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Say something to the league" maxLength={2000} />
        <button type="submit" className="btn dark">Send</button>
      </form>
      {err && <div role="alert" style={{ padding: '0 18px 12px', color: 'var(--red-fg)', fontSize: 13 }}>{err}</div>}
    </div>
  );
}
