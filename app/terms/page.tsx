import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Use · Keeper HQ',
  description: 'The rules for using Keeper HQ.',
};

const UPDATED = '24 November 2026';
const CONTACT = 'hello@keeperhq.au';

const wrap: React.CSSProperties = { maxWidth: 760, margin: '0 auto', padding: '48px 20px 80px', lineHeight: 1.65, color: '#1f2a24' };
const h1: React.CSSProperties = { fontSize: 32, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 4px' };
const h2: React.CSSProperties = { fontSize: 19, fontWeight: 700, margin: '32px 0 8px', color: '#2f5a43' };
const muted: React.CSSProperties = { color: '#6b7a71', fontSize: 14 };

export default function TermsPage() {
  return (
    <main style={wrap}>
      <p style={{ ...muted, marginBottom: 24 }}><Link href="/">← Keeper HQ</Link></p>
      <h1 style={h1}>Terms of Use</h1>
      <p style={muted}>Last updated {UPDATED}</p>

      <p>
        These terms cover your use of Keeper HQ (keeperhq.au), a platform for running AFL fantasy keeper and dynasty
        leagues. Keeper HQ is run by Christian Lopez in Perth, Western Australia (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
        By creating an account, joining a league or using the site, you agree to these terms. If you don&rsquo;t agree,
        please don&rsquo;t use Keeper HQ.
      </p>

      <h2 style={h2}>1. Not affiliated with the AFL</h2>
      <p>
        Keeper HQ is an independent fan-made product. It isn&rsquo;t endorsed by, sponsored by or connected with the
        Australian Football League, AFL Fantasy, any AFL club or Champion Data. Club and player names are used only to
        identify real-world teams and players.
      </p>

      <h2 style={h2}>2. Your account</h2>
      <ul>
        <li>You must be 18 or older, or have a parent or guardian&rsquo;s permission, to create an account.</li>
        <li>Use an email address you control. We sign you in with emailed links, so anyone with access to your inbox can access your account.</li>
        <li>One person per account. Don&rsquo;t share your account or sign in as someone else.</li>
        <li>You&rsquo;re responsible for what happens under your account and for keeping your details accurate.</li>
      </ul>

      <h2 style={h2}>3. Leagues and commissioners</h2>
      <ul>
        <li>Anyone who starts a league becomes its commissioner. Commissioners set their league&rsquo;s rules, invite and remove coaches, and can edit squads, scores, picks and other league records.</li>
        <li>Each league is run by its own members. We don&rsquo;t referee disputes between coaches or commissioners, and we aren&rsquo;t responsible for how a commissioner runs their league.</li>
        <li>We may step in if a league is used to break these terms or the law.</li>
      </ul>

      <h2 style={h2}>4. Tokens, side games and money</h2>
      <ul>
        <li>Keeper HQ is free and offers no prizes of its own.</li>
        <li>Tokens, side games, cups, bets and anything similar on the site are in-game features. Tokens have no cash value, can&rsquo;t be exchanged for money through Keeper HQ, and can be changed or reset by the league commissioner.</li>
        <li>Keeper HQ doesn&rsquo;t collect, hold or pay out money. Any money arrangement inside a league (for example entry fees or a buy-in paid to a commissioner) is strictly between the members of that league. You&rsquo;re responsible for making sure it&rsquo;s legal where you live.</li>
      </ul>

      <h2 style={h2}>5. Fair use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>harass, abuse or impersonate other members, or post offensive or unlawful content (club names, badges, messages and so on);</li>
        <li>try to access leagues, accounts or data you aren&rsquo;t a member of, or get around security or league rules;</li>
        <li>scrape, copy or resell the site or its data, or overload it with automated requests;</li>
        <li>use Keeper HQ for anything unlawful.</li>
      </ul>
      <p>We may suspend or remove accounts, content or leagues that break these rules.</p>

      <h2 style={h2}>6. Stats, scores and ratings</h2>
      <p>
        Player stats and scores come from publicly available sources and can be late, incomplete or wrong. Player ratings,
        values, projections, scouting notes and other analysis are opinions and estimates, not facts or advice.
        Commissioners can correct scores in their own league, and the commissioner&rsquo;s figures are final for that league.
      </p>

      <h2 style={h2}>7. Your content</h2>
      <p>
        You keep ownership of what you add, such as club names, badges and messages. You let us store and show it so the
        site works for you and your league. The Keeper HQ name, logo, design and code belong to us.
      </p>

      <h2 style={h2}>8. Availability and changes</h2>
      <p>
        Keeper HQ is provided as is. We aim to keep it running smoothly but can&rsquo;t promise it will always be
        available, error-free or keep every feature. We may change, pause or stop parts of the site, and we may update these
        terms. If we make a significant change, we&rsquo;ll post it on the site. If you keep using Keeper HQ after a change,
        that means you accept the updated terms.
      </p>

      <h2 style={h2}>9. Liability</h2>
      <p>
        Nothing in these terms limits rights you have under the Australian Consumer Law that can&rsquo;t be excluded.
        Otherwise, to the extent the law allows, we aren&rsquo;t liable for any indirect loss, lost data, lost results or
        disputes within a league that come from using Keeper HQ. Because the service is free, our total liability is
        limited to resupplying the service.
      </p>

      <h2 style={h2}>10. Closing your account</h2>
      <p>
        You can stop using Keeper HQ at any time. To have your account deleted, email us. A league&rsquo;s history (past
        trades, results and drafts) may stay in that league with your name removed or replaced.
      </p>

      <h2 style={h2}>11. Disputes and governing law</h2>
      <p>
        If you have a problem, email us first and we&rsquo;ll try to sort it out within 30 days. These terms are governed by
        the laws of Western Australia, and the courts of Western Australia have jurisdiction.
      </p>

      <h2 style={h2}>12. Contact</h2>
      <p>
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. See also our <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </main>
  );
}
