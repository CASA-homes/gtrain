// Shared by server and client: how the commish's league name is shown.
export const DEFAULT_LEAGUE_NAME = 'G-Train';

/** "G-Train" → "G-Train League"; a name that already ends in League is left alone. */
export const leagueTitle = (name: string) => (/\bleague$/i.test(name.trim()) ? name.trim() : `${name.trim()} League`);
