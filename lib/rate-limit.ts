/**
 * A small safety valve for early deployments. Serverless instances do not share
 * memory, so this is a best-effort limit until we replace it with a database
 * backed per-user limit when authentication is added.
 */
import { getSupabaseAdmin } from "@/lib/supabase";

const requests = new Map<string, number>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function useInMemoryLimit(limit: number): boolean {
  const key = today();
  const count = requests.get(key) ?? 0;
  if (count >= limit) return false;
  requests.set(key, count + 1);
  return true;
}

export async function takeDailyChatRequest(limit: number): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return useInMemoryLimit(limit);
  const { data, error } = await supabase.rpc("take_daily_chat_request", { request_limit: limit });
  if (error) {
    console.error("Persistent rate limit failed; using in-memory fallback", error);
    return useInMemoryLimit(limit);
  }
  return data === true;
}
