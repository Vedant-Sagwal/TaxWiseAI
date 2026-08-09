export type WebSource = { title: string; url: string; excerpt: string; publishedDate?: string };

const OFFICIAL_DOMAINS = ["incometax.gov.in", "indiabudget.gov.in", "egazette.nic.in", "cybercrime.gov.in"];

export function needsCurrentInformation(question: string) {
  return /\b(latest|current|today|recent|newly|update(?:d)?|deadline|due date|notification|circular|amendment|this year|fy\s*2026|tax year\s*2026)\b/i.test(question);
}

export async function searchOfficialTaxSources(query: string): Promise<WebSource[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("Live verification is not configured.");
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query: `India income tax: ${query}`, search_depth: "advanced", max_results: 5, include_domains: OFFICIAL_DOMAINS }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Official-source search is temporarily unavailable.");
  const payload = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }> };
  return (payload.results ?? [])
    .filter((result) => {
      if (!result.url) return false;
      try {
        const hostname = new URL(result.url).hostname;
        return OFFICIAL_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
      } catch {
        return false;
      }
    })
    .slice(0, 5)
    .map((result) => ({ title: result.title?.trim() || "Official tax source", url: result.url!, excerpt: (result.content ?? "").replace(/\s+/g, " ").slice(0, 900), publishedDate: result.published_date }));
}
