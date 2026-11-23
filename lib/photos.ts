/**
 * The AFL's headshots are 1080×1080 PNGs (about 1 MB and seconds each). Their CDN resizes on request
 * (?im=Resize,width=N), so every AFL image goes out at the size it's shown: a 120px thumbnail loads ten times faster.
 */
export function aflSized(url: string | null | undefined, width = 240): string | null {
  if (!url) return null;
  if (!url.startsWith('https://s.afl.com.au/') || url.includes('?')) return url;
  return `${url}?im=Resize,width=${width}`;
}

/** A player's photo: the commish-supplied/edited one first, then the AFL headshot DFS points to (resized). */
export function photoUrl(p: { photo_path: string | null; dfs_id: string | null }, width = 240): string | null {
  if (p.photo_path) return p.photo_path;
  if (p.dfs_id) return aflSized(`https://s.afl.com.au/staticfile/AFL%20Tenant/AFL/Players/ChampIDImages/AFL/2026014/${p.dfs_id.replace('CD_I', '')}.png`, width);
  return null;
}
