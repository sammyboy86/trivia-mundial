import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { SESSION_COOKIE_NAME } from "@/lib/constants";

// Helper to validate admin session
function validateSession(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  const result = verifySessionToken(token);
  return result.valid;
}

// GET — Export all questions
export async function GET(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let allQuestions: any[] = [];
  let start = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("questions")
      .select("*")
      .order("created_at", { ascending: false })
      .range(start, start + PAGE_SIZE - 1);

    if (error) {
      console.error("Failed to fetch questions for export", error);
      return NextResponse.json({ error: "Failed to export questions" }, { status: 500 });
    }

    if (data && data.length > 0) {
      allQuestions = allQuestions.concat(data);
    }

    if (!data || data.length < PAGE_SIZE) {
      break;
    }

    start += PAGE_SIZE;
  }

  return NextResponse.json({ questions: allQuestions });
}
