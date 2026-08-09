import { getSupabaseAdmin } from "@/lib/supabase";
import { embedQuery, vectorLiteral } from "@/lib/embeddings";
import { rerankChunks, type RerankCandidate } from "@/lib/reranker";

export type Citation = { chunkIndex: number; pageNumber: number; excerpt: string };
export type DocumentChunk = { content: string; pageNumber: number };

export function chunkText(text: string, size = 1400, overlap = 220): string[] {
  const normalised = text.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  for (let start = 0; start < normalised.length; start += size - overlap) {
    const slice = normalised.slice(start, start + size).trim();
    if (slice.length >= 80) chunks.push(slice);
    if (start + size >= normalised.length) break;
  }
  return chunks;
}

export function chunkPages(pages: string[], size = 1400, overlap = 220): DocumentChunk[] {
  return pages.flatMap((page, pageIndex) =>
    chunkText(page, size, overlap).map((content) => ({ content, pageNumber: pageIndex + 1 })),
  );
}

export async function retrieveDocumentContext(documentId: string, ownerId: string, query: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { context: "", citations: [] as Citation[], retrievalMode: "unavailable" };

  type Chunk = RerankCandidate;
  let data: Chunk[] | null = null;
  let retrievalMode = "lexical";
  const embedding = await embedQuery(query).catch((error) => { console.error("Query embedding failed", error); return null; });
  if (embedding) {
    const hybrid = await supabase.rpc("match_document_chunks_hybrid", {
      query_document_id: documentId,
      query_owner_id: ownerId,
      query_text: query,
      query_embedding: vectorLiteral(embedding),
      candidate_count: 24,
      match_count: 24,
    });
    if (!hybrid.error && hybrid.data?.length) {
      data = hybrid.data;
      retrievalMode = "hybrid-rrf";
    } else if (hybrid.error) console.error("Hybrid retrieval failed; using lexical fallback", hybrid.error);
  }
  if (!data) {
    const lexical = await supabase.rpc("match_document_chunks", {
    query_document_id: documentId,
    query_owner_id: ownerId,
    query_text: query,
    match_count: 24,
  });
    if (lexical.error || !lexical.data) return { context: "", citations: [] as Citation[], retrievalMode };
    data = lexical.data;
  }
  if (!data) return { context: "", citations: [] as Citation[], retrievalMode };

  const reranked = await rerankChunks(query, data).catch((error) => { console.error("Reranking failed; using retrieval order", error); return null; });
  const selected = (reranked ?? data).slice(0, 5);
  if (reranked) retrievalMode += "+cross-encoder";

  const citations = selected.map((chunk: { chunkIndex?: number; chunk_index?: number; pageNumber?: number; page_number?: number; content: string }) => ({
    chunkIndex: chunk.chunkIndex ?? chunk.chunk_index ?? 0,
    pageNumber: chunk.pageNumber ?? chunk.page_number ?? 0,
    excerpt: chunk.content.slice(0, 280) + (chunk.content.length > 280 ? "…" : ""),
  }));
  const context = selected.map((chunk: { chunkIndex?: number; chunk_index?: number; pageNumber?: number; page_number?: number; content: string }) => `[Document excerpt ${(chunk.chunkIndex ?? chunk.chunk_index ?? 0) + 1}, page ${chunk.pageNumber ?? chunk.page_number}]\n${chunk.content}`).join("\n\n");
  return { context, citations, retrievalMode };
}
