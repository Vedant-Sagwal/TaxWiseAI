import { embedQuery, vectorLiteral } from "@/lib/embeddings";
import { rerankChunks } from "@/lib/reranker";
import { getSupabaseAdmin } from "@/lib/supabase";

export type KnowledgeCitation = { title: string; sourceUrl: string; publishedAt: string | null; pageNumber: number; excerpt: string };
type KnowledgeChunk = { chunk_index: number; page_number: number; content: string; title: string; source_url: string; published_at: string | null };

export async function retrieveKnowledgeContext(query: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { context: "", citations: [] as KnowledgeCitation[], retrievalMode: "unavailable" };
  const embedding = await embedQuery(query).catch(() => null);
  const { data, error } = await supabase.rpc("match_knowledge_chunks", { query_text: query, query_embedding: embedding ? vectorLiteral(embedding) : null, candidate_count: 24, match_count: 24 });
  if (error || !data?.length) return { context: "", citations: [] as KnowledgeCitation[], retrievalMode: embedding ? "hybrid-unavailable" : "lexical" };
  const candidates = data as KnowledgeChunk[];
  const reranked = await rerankChunks(query, candidates.map((chunk) => ({ chunkIndex: chunk.chunk_index, pageNumber: chunk.page_number, content: chunk.content }))).catch(() => null);
  const selected = (reranked ? reranked.map((ranked) => candidates.find((candidate) => candidate.chunk_index === ranked.chunkIndex && candidate.page_number === ranked.pageNumber)!).filter(Boolean) : candidates).slice(0, 5);
  const citations = selected.map((chunk) => ({ title: chunk.title, sourceUrl: chunk.source_url, publishedAt: chunk.published_at, pageNumber: chunk.page_number, excerpt: chunk.content.slice(0, 280) + (chunk.content.length > 280 ? "…" : "") }));
  return { context: selected.map((chunk, index) => `[Official library source ${index + 1}: ${chunk.title}, page ${chunk.page_number}, published ${chunk.published_at ?? "date not supplied"}]\n${chunk.content}`).join("\n\n"), citations, retrievalMode: `${embedding ? "hybrid-rrf" : "lexical"}${reranked ? "+cross-encoder" : ""}` };
}
