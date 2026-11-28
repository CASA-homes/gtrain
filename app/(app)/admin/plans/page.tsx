import { redirect } from 'next/navigation';

// League plans now live on the site admin page, under Leagues.
export default function LeaguePlansPage() {
  redirect('/admin?tab=leagues');
}
