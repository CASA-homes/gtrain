// One small helper for OpenAI chat completions. Key and model come from Vercel env vars:
// OPENAI_API_KEY (required), OPENAI_MODEL (optional, defaults to the cheap fast mini model).
export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';

export async function chat(messages: { role: string; content: string }[], json: boolean, maxTokens = json ? 2500 : 1500) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: OPENAI_MODEL, messages, reasoning_effort: 'low', ...(json ? { response_format: { type: 'json_object' } } : {}), max_completion_tokens: maxTokens }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message ?? `OpenAI ${r.status}`);
  return String(d.choices?.[0]?.message?.content ?? '');
}
