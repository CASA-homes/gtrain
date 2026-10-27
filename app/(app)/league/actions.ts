'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCoach } from '@/lib/data';

export async function postNews(form: FormData) {
  const me = await getCoach();
  if (!me?.is_commish) return;
  const supabase = await createClient();
  const when = String(form.get('happens_at') || '');
  await supabase.from('news').insert({
    kind: String(form.get('kind') || 'News'),
    title: String(form.get('title') || '').slice(0, 120),
    details: String(form.get('details') || '').slice(0, 500) || null,
    location: String(form.get('location') || '') || null,
    happens_at: when ? new Date(when).toISOString() : null,
  });
  revalidatePath('/league');
}

export async function rsvp(newsId: string, answer: 'yes' | 'maybe' | 'no') {
  const supabase = await createClient();
  await supabase.from('rsvps').upsert({ news_id: newsId, answer });
  revalidatePath('/league');
}
