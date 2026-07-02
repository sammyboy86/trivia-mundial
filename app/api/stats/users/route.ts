import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  try {
    // June 29 2026 00:00 CDMX is 2026-06-29T06:00:00Z (UTC)
    const { data, error } = await supabaseAdmin
      .from("quiz_sessions")
      .select("user_id")
      .gte("created_at", "2026-06-29T06:00:00Z")
      .eq("is_test", false);

    if (error) {
      console.error("Error fetching stats:", error);
      // Fallback
      return NextResponse.json({ count: 0 }, { status: 200 });
    }

    // Count unique user_ids
    const uniqueUsers = new Set(data.map((row: any) => row.user_id).filter(Boolean));
    const count = uniqueUsers.size;

    return NextResponse.json({ count }, { status: 200 });
  } catch (error) {
    console.error("Server error fetching stats:", error);
    return NextResponse.json({ count: 0 }, { status: 200 });
  }
}
