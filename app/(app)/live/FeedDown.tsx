export function FeedDown({ error }: { error: string | null }) {
  return <div className="rh"><div className="rh-card rh-empty">Couldn’t reach the AFL Fantasy feed right now{error ? ` (${error})` : ''}. Try again in a minute.</div></div>;
}
