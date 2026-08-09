import pdf from "pdf-parse";
import { NextResponse } from "next/server";
import { z } from "zod";
import { chunkPages } from "@/lib/document-rag";
import { embedTexts, vectorLiteral } from "@/lib/embeddings";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const metadataSchema = z.object({ title: z.string().trim().min(3).max(240), sourceUrl: z.string().url().refine((url) => { try { const host = new URL(url).hostname; return host === "incometax.gov.in" || host.endsWith(".incometax.gov.in") || host === "indiabudget.gov.in" || host.endsWith(".indiabudget.gov.in") || host === "egazette.nic.in" || host.endsWith(".egazette.nic.in"); } catch { return false; } }, "Use an official source URL."), publishedAt: z.string().date().optional() });

export async function POST(request: Request) {
  if (!process.env.ADMIN_UPLOAD_KEY || request.headers.get("x-admin-key") !== process.env.ADMIN_UPLOAD_KEY) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const supabase = getSupabaseAdmin(); if (!supabase) return NextResponse.json({ error: "Storage is not configured." }, { status: 503 });
  const form = await request.formData(); const file = form.get("file");
  const metadata = metadataSchema.safeParse({ title: form.get("title"), sourceUrl: form.get("sourceUrl"), publishedAt: form.get("publishedAt") || undefined });
  if (!(file instanceof File) || file.type !== "application/pdf" || !metadata.success) return NextResponse.json({ error: "Provide an official PDF, title, official source URL, and optional YYYY-MM-DD publication date." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "Official PDFs must be 15 MB or smaller." }, { status: 413 });
  try {
    let pageNumber = 0;
    const parsed = await pdf(Buffer.from(await file.arrayBuffer()), { pagerender: async (page) => { pageNumber += 1; const text = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false }); return `<<<PAGE:${pageNumber}>>>${text.items.map((item: { str: string }) => item.str).join(" ")}`; } });
    const chunks = chunkPages(parsed.text.split(/<<<PAGE:\d+>>>/).map((page) => page.trim()).filter(Boolean));
    if (!chunks.length) return NextResponse.json({ error: "No readable text was found; scanned PDFs need OCR." }, { status: 422 });
    const { data: document, error: documentError } = await supabase.from("knowledge_documents").insert({ title: metadata.data.title, source_url: metadata.data.sourceUrl, published_at: metadata.data.publishedAt ?? null, file_name: file.name }).select("id").single();
    if (documentError || !document) throw documentError ?? new Error("Document insert failed.");
    const embeddings = await embedTexts(chunks.map((chunk) => chunk.content)).catch((error) => { console.error("Knowledge embedding failed", error); return null; });
    const { error: chunksError } = await supabase.from("knowledge_chunks").insert(chunks.map((chunk, index) => ({ document_id: document.id, chunk_index: index, page_number: chunk.pageNumber, content: chunk.content, ...(embeddings ? { embedding: vectorLiteral(embeddings[index]) } : {}) })));
    if (chunksError) throw chunksError;
    return NextResponse.json({ documentId: document.id, chunkCount: chunks.length, embeddingIndexed: Boolean(embeddings) }, { status: 201 });
  } catch (error) { console.error("Knowledge upload failed", error); return NextResponse.json({ error: "Could not index the official PDF." }, { status: 500 }); }
}
