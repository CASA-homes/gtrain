import { redirect } from 'next/navigation';

// Club contracts now live in the Clubhouse, under "Contracts".
export default async function ClubContractsRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/clubhouse/${id}?view=contracts`);
}
