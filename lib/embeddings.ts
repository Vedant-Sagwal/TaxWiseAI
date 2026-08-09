const DIMENSIONS = 1536;

export function vectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!texts.length) return [];
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small", input: texts, dimensions: DIMENSIONS }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Embedding request failed.");
  const payload = await response.json() as { data?: Array<{ embedding?: number[] }> };
  const embeddings = payload.data?.map((item) => item.embedding ?? []) ?? [];
  if (embeddings.length !== texts.length || embeddings.some((embedding) => embedding.length !== DIMENSIONS)) throw new Error("Embedding provider returned an unexpected vector size.");
  return embeddings;
}

export async function embedQuery(query: string) {
  const embeddings = await embedTexts([query]);
  return embeddings?.[0] ?? null;
}
