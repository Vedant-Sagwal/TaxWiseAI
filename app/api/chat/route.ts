import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { takeDailyChatRequest } from "@/lib/rate-limit";
import { retrieveDocumentContext } from "@/lib/document-rag";
import { getSession } from "@/lib/session";
import { TAX_SYSTEM_PROMPT } from "@/lib/tax-assistant";
import { needsCurrentInformation, searchOfficialTaxSources, type WebSource } from "@/lib/current-web";
import { retrieveKnowledgeContext, type KnowledgeCitation } from "@/lib/knowledge-rag";

export const runtime = "nodejs";

const requestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(2000),
  })).min(1).max(12),
  documentId: z.string().uuid().optional(),
  verifyCurrent: z.boolean().optional(),
});

export async function POST(request: Request) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "The chat service is not configured yet. Add GROQ_API_KEY to .env.local." }, { status: 503 });
  }

  const limit = Number.parseInt(process.env.DAILY_CHAT_LIMIT ?? "20", 10);
  if (!await takeDailyChatRequest(Number.isFinite(limit) ? limit : 20)) {
    return NextResponse.json({ error: "Today's demo request limit has been reached. Please try again tomorrow." }, { status: 429 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please send a valid conversation with a question." }, { status: 400 });
  }

  try {
    let documentContext = "";
    let citations: Array<{ chunkIndex: number; excerpt: string }> = [];
    let retrievalMode: string | undefined;
    let webSources: WebSource[] = [];
    let knowledgeCitations: KnowledgeCitation[] = [];
    const rawQuestion = parsed.data.messages.filter((message) => message.role === "user").at(-1)?.content ?? "";
    const privatePdfQuestion = rawQuestion.match(/^@\s*([\s\S]*?)\s*\/\s*$/);
    if (rawQuestion.trim().startsWith("@") && !privatePdfQuestion) return NextResponse.json({ error: "To ask your uploaded PDF, use: @ your question /" }, { status: 400 });
    const question = privatePdfQuestion?.[1].trim() || rawQuestion;
    if (privatePdfQuestion && !parsed.data.documentId) return NextResponse.json({ error: "Upload a private PDF first, then use: @ your question /" }, { status: 400 });
    if (privatePdfQuestion && parsed.data.documentId) {
      const session = await getSession();
      const retrieved = await retrieveDocumentContext(parsed.data.documentId, session.id, question);
      documentContext = retrieved.context;
      citations = retrieved.citations;
      retrievalMode = retrieved.retrievalMode;
    } else {
      const retrieved = await retrieveKnowledgeContext(question);
      documentContext = retrieved.context;
      knowledgeCitations = retrieved.citations;
      retrievalMode = retrieved.retrievalMode;
    }
    if (parsed.data.verifyCurrent || needsCurrentInformation(question)) {
      if (!process.env.TAVILY_API_KEY) {
        return NextResponse.json({ error: "Live verification is not configured. Add TAVILY_API_KEY or verify this question directly at incometax.gov.in." }, { status: 503 });
      }
      webSources = await searchOfficialTaxSources(question);
      if (!webSources.length) return NextResponse.json({ error: "No official current sources were found. Please try a more specific question or check incometax.gov.in." }, { status: 404 });
    }
    const webContext = webSources.length ? `\n\nThe user requested current information. Use only these official-source excerpts for time-sensitive claims. Cite them in the answer as “Official source 1”, “Official source 2”, etc.\n\n${webSources.map((source, index) => `[Official source ${index + 1}: ${source.title}]\n${source.excerpt}`).join("\n\n")}` : "";
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      max_completion_tokens: 700,
      messages: [{ role: "system", content: TAX_SYSTEM_PROMPT + (documentContext ? `\n\nUse supplied excerpts as the primary authority for claims covered by them. If they do not answer the question, say so. Cite private-PDF excerpts as “Document excerpt N” and shared-library excerpts as “Official library source N”.\n\n${documentContext}` : "") + webContext }, ...parsed.data.messages.map((message, index, all) => index === all.length - 1 && message.role === "user" ? { ...message, content: question } : message)],
    });
    const answer = completion.choices[0]?.message.content?.trim();
    if (!answer) throw new Error("The model returned no text.");
    return NextResponse.json({ answer, citations, knowledgeCitations, webSources, retrievalMode });
  } catch (error) {
    console.error("Groq chat request failed", error);
    return NextResponse.json({ error: "The model could not answer right now. Please retry shortly." }, { status: 502 });
  }
}
