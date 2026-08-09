import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function DELETE(_: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Document storage is not configured yet." }, { status: 503 });
  const { documentId } = await params;
  const session = await getSession();
  const { error } = await supabase.from("documents").delete().eq("id", documentId).eq("owner_id", session.id);
  if (error) {
    console.error("Document deletion failed", error);
    return NextResponse.json({ error: "Unable to remove this document." }, { status: 500 });
  }
  return NextResponse.json({ deleted: true });
}
