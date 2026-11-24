import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy · Keeper HQ',
  description: 'What Keeper HQ collects and how it is used.',
};

const UPDATED = '24 November 2026';
const CONTACT = 'hello@keeperhq.au';

const wrap: React.CSSProperties = { maxWidth: 760, margin: '0 auto', padding: '48px 20px 80px', lineHeight: 1.65, color: '#1f2a24' };
const h1: React.CSSProperties = { fontSize: 32, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 4px' };
const h2: React.CSSProperties = { fontSize: 19, fontWeight: 700, margin: '32px 0 8px', color: '#2f5a43' };
const muted: React.CSSProperties = { color: '#6b7a71', fontSize: 14 };

export default function PrivacyPage() {
  return (
    <main style={wrap}>
      <p style={{ ...muted, marginBottom: 24 }}><Link href="/">← Keeper HQ</Link></p>
      <h1 style={h1}>Privacy Policy</h1>
      <p style={muted}>Last updated {UPDATED}</p>

      <p>
        Keeper HQ (keeperhq.au) is run by Christian Lopez in Perth, Western Australia. This policy explains what
        information we collect, why we collect it, and how we handle it. We collect only what we need to run your league,
        and we follow the Australian Privacy Principles as good practice.
      </p>

      <h2 style={h2}>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your email address and the name you give us.</li>
        <li><strong>League activity:</strong> your club name and badge, squads, lineups, trades, draft picks, contracts, tokens, messages and any other actions you take in a league.</li>
        <li><strong>Technical data:</strong> basic logs such as IP address, browser type and the time of each request. Our hosting providers record these automatically for security and to fix problems.</li>
      </ul>
      <p>We don&rsquo;t collect payment details, and we don&rsquo;t need your address, phone number or date of birth.</p>

      <h2 style={h2}>How we use it</h2>
      <ul>
        <li>to sign you in and keep your account secure;</li>
        <li>to run your league and show your activity to that league&rsquo;s members;</li>
        <li>to send emails you need, such as sign-in links, league invites and important notices about the site;</li>
        <li>to fix bugs, prevent abuse and improve Keeper HQ.</li>
      </ul>
      <p>We don&rsquo;t sell your information, and we don&rsquo;t use it for third-party advertising.</p>

      <h2 style={h2}>Who can see it</h2>
      <ul>
        <li><strong>Your league:</strong> members of a league can see your name, club and league activity in that league. Commissioners can also see members&rsquo; email addresses so they can manage invites.</li>
        <li><strong>Other leagues:</strong> members of other leagues can&rsquo;t see your information.</li>
        <li><strong>Service providers:</strong> we use a few providers to run the site: Supabase for the database and sign-in, Vercel for hosting, and Resend for sending emails. They handle data only on our behalf and store it outside Australia: our database is hosted in Japan, and some providers process data in the United States.</li>
        <li><strong>The law:</strong> we may share information if the law requires it, or to protect people or the site.</li>
      </ul>

      <h2 style={h2}>Cookies</h2>
      <p>
        We use cookies and browser storage only to keep you signed in and remember settings such as your selected league.
        We don&rsquo;t use advertising or tracking cookies.
      </p>

      <h2 style={h2}>How long we keep it</h2>
      <p>
        We keep your account details while your account is open. League records such as past trades, results and drafts are
        part of a league&rsquo;s history and may be kept after you leave, with your name removed or replaced if you ask.
        Logs are kept for a short period by our providers.
      </p>

      <h2 style={h2}>Security</h2>
      <p>
        Data is encrypted when it travels between your browser and our servers. Access to league data is restricted so each
        member can see only the leagues they belong to. No online service is perfectly secure, so please keep your email
        account safe, because sign-in links are sent there.
      </p>

      <h2 style={h2}>Your choices</h2>
      <ul>
        <li>You can view and change your name and club details in the app.</li>
        <li>You can ask us for a copy of your information, ask us to correct it, or ask us to delete your account by emailing us.</li>
        <li>If you aren&rsquo;t happy with how we handled a privacy matter, contact us first. You can also contact the Office of the Australian Information Commissioner (oaic.gov.au).</li>
      </ul>

      <h2 style={h2}>Changes</h2>
      <p>
        We&rsquo;ll update this page if our practices change, and we&rsquo;ll let users know on the site about any
        significant change.
      </p>

      <h2 style={h2}>Contact</h2>
      <p>
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. See also our <Link href="/terms">Terms of Use</Link>.
      </p>
    </main>
  );
}
