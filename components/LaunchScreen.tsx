// Launch screen for the installed app. Android shows its own splash (sage + the mark) while the page loads;
// this picks up from it at first paint with the full KEEPERHQ lockup, then fades out by itself (pure CSS, no JS wait).
// Only in the installed app (display-mode: standalone), and only once per session.
import { KeeperMark } from '@/components/KeeperMark';

export function LaunchScreen() {
  return (
    <div className="ls" aria-hidden="true">
      <div className="ls-in">
        <KeeperMark size={88} className="ls-mark" />
        <span className="ls-wm">Keeper<b>HQ</b></span>
        <small>Your keeper league, sorted</small>
      </div>
    </div>
  );
}

/** Runs before paint: skip the launch screen if it already showed this session. */
export const LAUNCH_ONCE = `try{if(sessionStorage.getItem('khq_ls'))document.documentElement.classList.add('ls-seen');else sessionStorage.setItem('khq_ls','1')}catch(e){}`;
