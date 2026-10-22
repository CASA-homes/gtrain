/** A player's photo: the commish-supplied/edited one first, then the AFL headshot DFS points to. */
export function photoUrl(p: { photo_path: string | null; dfs_id: string | null }): string | null {
  if (p.photo_path) return p.photo_path;
  if (p.dfs_id) return `https://s.afl.com.au/staticfile/AFL%20Tenant/AFL/Players/ChampIDImages/AFL/2026014/${p.dfs_id.replace('CD_I', '')}.png`;
  return null;
}
