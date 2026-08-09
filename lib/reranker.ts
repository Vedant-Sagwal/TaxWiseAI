export type RerankCandidate = { chunkIndex: number; pageNumber: number; content: string; rank?: number };

export async function rerankChunks(query: string, candidates: RerankCandidate[]) {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey || candidates.length < 2) return null;
  const response = await fetch("https://api.jina.ai/v1/rerank", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: process.env.RERANKER_MODEL ?? "jina-reranker-v2-base-multilingual", query, documents: candidates.map((candidate) => candidate.content), top_n: 5 }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("Reranking request failed.");
  const payload = await response.json() as { results?: Array<{ index: number; relevance_score?: number }> };
  const results = payload.results ?? [];
  if (!results.length) throw new Error("Reranking returned no results.");
  return results.filter((result) => Number.isInteger(result.index) && result.index >= 0 && result.index < candidates.length)
    .map((result) => ({ ...candidates[result.index], rank: result.relevance_score ?? 0 }));
}
