import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { retrieveDocumentContext } from "@/lib/document-rag";

export const runtime = "nodejs";
const evaluationSchema = z.object({ documentId: z.string().uuid(), ownerId: z.string().uuid(), question: z.string().min(1).max(2_000), answer: z.string().min(1).max(5_000), relevantChunkIndexes: z.array(z.number().int().nonnegative()).min(1).optional() });

function parseScores(text: string) {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Judge returned no JSON.");
  const parsed = JSON.parse(json) as { faithfulness?: number; answerRelevance?: number; rationale?: string };
  const valid = (value: unknown) => typeof value === "number" && value >= 0 && value <= 1 ? value : null;
  const faithfulness = valid(parsed.faithfulness); const answerRelevance = valid(parsed.answerRelevance);
  if (faithfulness === null || answerRelevance === null) throw new Error("Judge scores were invalid.");
  return { faithfulness, answerRelevance, rationale: typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 500) : "" };
}

export async function POST(request: Request) {
  if (!process.env.EVALUATION_API_KEY || request.headers.get("x-evaluation-key") !== process.env.EVALUATION_API_KEY) return NextResponse.json({ error: "Unauthorized evaluation request." }, { status: 401 });
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: "GROQ_API_KEY is required for LLM judging." }, { status: 503 });
  const parsed = evaluationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid evaluation case." }, { status: 400 });
  try {
    const evaluation = parsed.data;
    const retrieved = await retrieveDocumentContext(evaluation.documentId, evaluation.ownerId, evaluation.question);
    const recallAt5 = evaluation.relevantChunkIndexes ? evaluation.relevantChunkIndexes.filter((index) => retrieved.citations.some((citation) => citation.chunkIndex === index)).length / evaluation.relevantChunkIndexes.length : undefined;
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({ model: "llama-3.3-70b-versatile", temperature: 0, max_completion_tokens: 240, messages: [{ role: "system", content: "You are a strict RAG evaluator. Score only from supplied context. Return exactly JSON: {\"faithfulness\": number 0-1, \"answerRelevance\": number 0-1, \"rationale\": \"brief reason\"}. Faithfulness means answer claims are supported by context; relevance means it directly answers the question." }, { role: "user", content: `Question:\n${evaluation.question}\n\nAnswer:\n${evaluation.answer}\n\nRetrieved context:\n${retrieved.context || "(none)"}` }] });
    return NextResponse.json({ ...parseScores(completion.choices[0]?.message.content ?? ""), recallAt5, retrievedChunkIndexes: retrieved.citations.map((citation) => citation.chunkIndex), retrievalMode: retrieved.retrievalMode });
  } catch (error) { console.error("RAG evaluation failed", error); return NextResponse.json({ error: "Evaluation could not be completed." }, { status: 502 }); }
}
