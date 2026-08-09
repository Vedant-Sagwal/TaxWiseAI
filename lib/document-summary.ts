import Groq from "groq-sdk";
import type { DocumentChunk } from "@/lib/document-rag";

export async function createDocumentSummary(chunks: DocumentChunk[]): Promise<string | null> {
  if (!process.env.GROQ_API_KEY) return null;
  const context = chunks.slice(0, 8).map((chunk) => `[Page ${chunk.pageNumber}] ${chunk.content}`).join("\n\n");
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.1,
    max_completion_tokens: 700,
    messages: [{ role: "system", content: "You summarise Indian tax documents for educational use. Use only the supplied excerpts. Return concise Markdown with these headings: Document purpose, Key points, Dates or amounts to verify, Suggested follow-up questions. Do not invent facts, rates, deadlines, or legal conclusions. Mention the page number for every document-specific point." }, { role: "user", content: context }],
  });
  return completion.choices[0]?.message.content?.trim() || null;
}
