"use client";

import { FormEvent, useState } from "react";
import { estimateIncomeTax, type TaxRegime } from "@/lib/tax-calculator";

type Citation = { chunkIndex: number; pageNumber: number; excerpt: string };
type WebSource = { title: string; url: string; excerpt: string; publishedDate?: string };
type KnowledgeCitation = { title: string; sourceUrl: string; publishedAt: string | null; pageNumber: number; excerpt: string };
type Message = { role: "user" | "assistant"; content: string; citations?: Citation[]; knowledgeCitations?: KnowledgeCitation[]; webSources?: WebSource[]; retrievalMode?: string };
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [documentSummary, setDocumentSummary] = useState("");
  const [verifyCurrent, setVerifyCurrent] = useState(false);
  const [income, setIncome] = useState("1200000");
  const [deductions, setDeductions] = useState("0");
  const [regime, setRegime] = useState<TaxRegime>("new");
  const [isSalaried, setIsSalaried] = useState(true);
  const [resident, setResident] = useState(true);
  const [ageBand, setAgeBand] = useState<"under60" | "senior" | "superSenior">("under60");
  const taxEstimate = estimateIncomeTax({ income: Number(income) || 0, deductions: Number(deductions) || 0, regime, isSalaried, resident, ageBand });

  async function uploadDocument(file: File) {
    setError("");
    setIsUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch("/api/documents", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to process this PDF.");
      setDocumentId(body.documentId);
      setDocumentName(`${body.fileName} · ${body.chunkCount} searchable sections`);
      setDocumentSummary(body.summary || "Document indexed successfully. Add your Groq API key to generate the automatic summary.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to process this PDF.");
    } finally {
      setIsUploading(false);
    }
  }

  async function removeDocument() {
    if (!documentId) return;
    setError("");
    try {
      const response = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to remove this document.");
      setDocumentId("");
      setDocumentName("");
      setDocumentSummary("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove this document.");
    }
  }

  async function askTaxHelper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || isLoading) return;

    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setQuestion("");
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, documentId: documentId || undefined, verifyCurrent }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to answer right now.");
      setMessages((current) => [...current, { role: "assistant", content: body.answer, citations: body.citations, knowledgeCitations: body.knowledgeCitations, webSources: body.webSources, retrievalMode: body.retrievalMode }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to answer right now.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="header">
        <a className="brand" href="#top">TaxWise <span>AI</span></a>
        <p>India · clear, source-aware tax assistance</p>
      </header>

      <section className="hero" id="top">
        <p className="eyebrow">YOUR TAX RESEARCH WORKSPACE</p>
        <h1>Understand tax documents.<br /><em>Ask better questions.</em></h1>
        <p className="lede">Upload an Indian tax PDF for a grounded summary, or clarify an ITR, TDS, Form 16, AIS, or deduction question. Always verify important decisions with a qualified professional.</p>
      </section>

      <section className="feature-grid" aria-label="TaxWise features">
        <article className="card upload-card">
          <p className="card-number">01</p>
          <h2>Analyze a tax PDF</h2>
          <p>Extract key dates, obligations, definitions, and evidence from Indian income-tax documents.</p>
          <label className="upload-target" htmlFor="tax-pdf">
            <input id="tax-pdf" type="file" accept="application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadDocument(file); }} disabled={isUploading} />
            <span className="upload-icon">↑</span>
            <strong>{isUploading ? "Reading PDF…" : documentName || "Choose a tax PDF"}</strong>
            <small>{documentId ? "Ask a question and TaxWise will retrieve relevant excerpts." : "Text-based PDF, maximum 10 MB. Redact PAN, Aadhaar, bank details, and passwords before upload."}</small>
          </label>
          {documentSummary ? <div className="document-summary"><strong>Document summary</strong><p>{documentSummary}</p></div> : null}
          {documentId ? <button type="button" className="remove-document" onClick={() => void removeDocument()}>Remove this document</button> : null}
        </article>

        <article className="card chat-card">
          <p className="card-number">02</p>
          <h2>Ask the tax helper</h2>
          <p>Normal questions search the trusted official library. To ask your private PDF, write <code>@ your question /</code>.</p>
          <div className="chat-log" aria-live="polite">
            {messages.length === 0 ? <p className="empty-state">Try: “What should I check in Form 16 before filing my ITR?” or, after upload, “@ What deadline does this PDF state? /”</p> : null}
            {messages.map((message, index) => (
              <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
                <span>{message.role === "user" ? "You" : "TaxWise"}</span>
                <p>{message.content}</p>
                {message.retrievalMode ? <p className="retrieval-mode">Document retrieval: {message.retrievalMode.replace("+", " + ")}</p> : null}
                {message.citations?.length ? <details className="sources"><summary>Retrieved document excerpts ({message.citations.length})</summary>{message.citations.map((citation) => <p key={citation.chunkIndex}><strong>Page {citation.pageNumber}, excerpt {citation.chunkIndex + 1}:</strong> {citation.excerpt}</p>)}</details> : null}
                {message.knowledgeCitations?.length ? <details className="sources" open><summary>Official library sources ({message.knowledgeCitations.length})</summary>{message.knowledgeCitations.map((citation) => <p key={`${citation.sourceUrl}-${citation.pageNumber}`}><strong>Page {citation.pageNumber}:</strong> <a href={citation.sourceUrl} target="_blank" rel="noreferrer">{citation.title}</a>{citation.publishedAt ? ` · Published ${citation.publishedAt}` : ""}</p>)}</details> : null}
                {message.webSources?.length ? <details className="sources" open><summary>Verified official sources ({message.webSources.length})</summary>{message.webSources.map((source, sourceIndex) => <p key={source.url}><strong>Official source {sourceIndex + 1}:</strong> <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>{source.publishedDate ? ` · ${source.publishedDate}` : ""}</p>)}</details> : null}
              </div>
            ))}
            {isLoading ? <p className="thinking">TaxWise is checking its response…</p> : null}
          </div>
          <form onSubmit={askTaxHelper} className="chat-form">
            <label className="sr-only" htmlFor="question">Your tax question</label>
            <textarea id="question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask an Indian income-tax question…" maxLength={2000} rows={3} />
            <label className="verify-current"><input type="checkbox" checked={verifyCurrent} onChange={(event) => setVerifyCurrent(event.target.checked)} /> Verify current information with official sources</label>
            <button type="submit" disabled={isLoading || !question.trim()}>{isLoading ? "Thinking…" : "Ask helper"}</button>
          </form>
          {error ? <p className="error" role="alert">{error}</p> : null}
        </article>
      </section>

      <section className="tools-grid" aria-label="Tax tools and official help">
        <article className="card calculator-card">
          <p className="card-number">03</p>
          <h2>Tax calculator</h2>
          <p>Educational estimate for FY 2026–27 / Tax Year 2026–27, for ordinary slab income.</p>
          <div className="calculator-fields">
            <label>Annual gross income (₹)<input inputMode="numeric" min="0" type="number" value={income} onChange={(event) => setIncome(event.target.value)} /></label>
            <label>Eligible deductions / exemptions (₹)<input inputMode="numeric" min="0" type="number" value={deductions} onChange={(event) => setDeductions(event.target.value)} /></label>
            <label>Regime<select value={regime} onChange={(event) => setRegime(event.target.value as TaxRegime)}><option value="new">New regime</option><option value="old">Old regime</option></select></label>
            <label>Age (old regime only)<select value={ageBand} onChange={(event) => setAgeBand(event.target.value as typeof ageBand)}><option value="under60">Below 60</option><option value="senior">60–79</option><option value="superSenior">80 or above</option></select></label>
            <label className="check-row"><input type="checkbox" checked={isSalaried} onChange={(event) => setIsSalaried(event.target.checked)} /> Salaried (standard deduction applied)</label>
            <label className="check-row"><input type="checkbox" checked={resident} onChange={(event) => setResident(event.target.checked)} /> Resident individual (87A rebate eligibility)</label>
          </div>
          <div className="tax-result"><span>Estimated tax payable</span><strong>{money.format(taxEstimate.totalTax)}</strong><p>Taxable income: {money.format(taxEstimate.taxableIncome)} · Income tax: {money.format(taxEstimate.incomeTax)} · Rebate: {money.format(taxEstimate.rebate)} · Cess: {money.format(taxEstimate.cess)}</p>{taxEstimate.notes.map((note) => <small key={note}>{note}</small>)}</div>
        </article>

        <article className="card resource-card">
          <p className="card-number">04</p>
          <h2>Forms, laws & help</h2>
          <p>Start with official sources; do not trust tax notices or refund links sent by message.</p>
          <div className="resource-list">
            <a href="https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/ITR1-FAQ" target="_blank" rel="noreferrer"><strong>Filing checklist</strong><span>Form 16/16A, AIS, Form 26AS, ITR guidance</span></a>
            <a href="https://www.incometax.gov.in/iec/foportal/latest-news" target="_blank" rel="noreferrer"><strong>Rules & notifications</strong><span>CBDT news, circulars and filing updates</span></a>
            <a href="https://www.incometax.gov.in/iec/foportal/contact-us" target="_blank" rel="noreferrer"><strong>Income Tax helpdesk</strong><span>1800 103 0025 · 1800 419 0025</span></a>
            <a href="https://cybercrime.gov.in/" target="_blank" rel="noreferrer"><strong>Suspected fraud</strong><span>Report financial cyber fraud quickly: call 1930 and use cybercrime.gov.in</span></a>
          </div>
          <p className="fraud-note"><strong>Scam check:</strong> The department does not ask for OTPs, passwords, or bank credentials by phone, email, or WhatsApp. Independently open the official portal rather than following a message link.</p>
        </article>
      </section>

      <footer>Educational assistance only — not tax, legal, or financial advice. Calculator uses FY 2026–27 / Tax Year 2026–27 ordinary slab assumptions; verify important or time-sensitive requirements at <a href="https://www.incometax.gov.in/iec/foportal/" target="_blank" rel="noreferrer">incometax.gov.in</a>.</footer>
    </main>
  );
}
