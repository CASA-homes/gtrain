// Keeper HQ brand: the "Through" mark (goal and behind posts with the ball going through) and the KEEPERHQ wordmark.
// Colours come from CSS variables so the mark works on light and sage grounds: --km-post (posts) and --km-ball (ball).

export function KeeperMark({ size = 32, tile = false, className }: { size?: number; tile?: boolean; className?: string }) {
  const posts = (
    <>
      <rect x="10" y="44" width="11" height="44" fill="var(--km-post, var(--khq-sage))" />
      <rect x="30" y="12" width="11" height="76" fill="var(--km-post, var(--khq-sage))" />
      <rect x="59" y="12" width="11" height="76" fill="var(--km-post, var(--khq-sage))" />
      <rect x="79" y="44" width="11" height="44" fill="var(--km-post, var(--khq-sage))" />
      <circle cx="50" cy="26" r="6.5" fill="var(--km-ball, var(--khq-brass))" />
    </>
  );
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Keeper HQ">
      {tile ? (
        <>
          <rect width="100" height="100" rx="24" fill="var(--khq-sage)" />
          <g transform="translate(15 13) scale(.7)" style={{ ['--km-post' as string]: '#fff' }}>{posts}</g>
        </>
      ) : posts}
    </svg>
  );
}

export function KeeperWordmark({ sub, className }: { sub?: string; className?: string }) {
  return (
    <span className={`khq-wm ${className ?? ''}`}>
      Keeper<b>HQ</b>
      {sub && <small>{sub}</small>}
    </span>
  );
}
