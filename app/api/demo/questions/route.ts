import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * GET /api/demo/questions
 * Public endpoint (no auth) that returns questions with elo_beta for the MERS demo.
 * Read-only — no writes to the database.
 */
export async function GET() {
  try {
    const { data: questions, error } = await supabaseAdmin
      .from("questions")
      .select(
        "id, question_text, question_type, elo_beta, option_a, option_b, option_c, option_d, correct_option, associated_kc_id, hint, answer_explanation"
      )
      .not("elo_beta", "is", null)
      .order("elo_beta", { ascending: true });

    if (error) {
      console.error("Demo questions fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch questions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ questions: questions || [] });
  } catch (error) {
    console.error("Demo questions server error:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
