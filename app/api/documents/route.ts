import pdf from "pdf-parse";
import { NextResponse } from "next/server";
import { chunkPages } from "@/lib/document-rag";
import { createDocumentSummary } from "@/lib/document-summary";
import { getSession, sessionCookie } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { embedTexts, vectorLiteral } from "@/lib/embeddings";

export const runtime = "nodejs";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Document storage is not configured yet." }, { status: 503 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") {
    return NextResponse.json({ error: "Please upload a PDF file." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "PDFs must be 10 MB or smaller." }, { status: 413 });

  try {
    let pageNumber = 0;
    const parsed = await pdf(Buffer.from(await file.arrayBuffer()), {
      pagerender: async (pageData) => {
        pageNumber += 1;
        const textContent = await pageData.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
        return `<<<PAGE:${pageNumber}>>>${textContent.items.map((item: { str: string }) => item.str).join(" ")}`;
      },
    });
    const pages = parsed.text.split(/<<<PAGE:\d+>>>/).map((page) => page.trim()).filter(Boolean);
    const chunks = chunkPages(pages);
    if (!chunks.length) return NextResponse.json({ error: "No readable text was found in that PDF. Scanned PDFs need OCR support." }, { status: 422 });

    const session = await getSession();
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .insert({ owner_id: session.id, file_name: file.name, character_count: parsed.text.length })
      .select("id, file_name")
      .single();
    if (documentError || !document) throw documentError ?? new Error("Unable to create document.");

    const embeddings = await embedTexts(chunks.map((chunk) => chunk.content)).catch((error) => { console.error("Document embedding failed; lexical retrieval remains available", error); return null; });
    const { error: chunksError } = await supabase.from("document_chunks").insert(
      chunks.map((chunk, chunkIndex) => ({ document_id: document.id, chunk_index: chunkIndex, page_number: chunk.pageNumber, content: chunk.content, ...(embeddings ? { embedding: vectorLiteral(embeddings[chunkIndex]) } : {}) })),
    );
    if (chunksError) throw chunksError;

    const summary = await createDocumentSummary(chunks).catch((error) => { console.error("Document summary failed", error); return null; });
    const response = NextResponse.json({ documentId: document.id, fileName: document.file_name, chunkCount: chunks.length, summary });
    if (session.isNew) { const cookie = sessionCookie(session.id); response.cookies.set(cookie.name, cookie.value, cookie.options); }
    return response;
  } catch (error) {
    console.error("PDF ingestion failed", error);
    return NextResponse.json({ error: "We could not process this PDF. Please try a text-based PDF." }, { status: 500 });
  }
}
