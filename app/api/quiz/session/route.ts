import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST() {
  try {
    const { data, error } = await supabaseAdmin
      .from("quiz_sessions")
      .insert({})
      .select("id")
      .single();

    if (error) {
      console.error("Error creating session:", error);
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    return NextResponse.json({ sessionId: data.id }, { status: 201 });
  } catch (error) {
    console.error("Server error creating session:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
