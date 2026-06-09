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

// Input validation for question data (simplified from singular route)
function validateQuestionData(data: any): { valid: boolean; error?: string } {
  const { question_text, question_type, correct_answer, options } = data;

  if (!question_text || typeof question_text !== "string" || question_text.trim().length === 0) {
    return { valid: false, error: "Question text is required" };
  }

  const validTypes = ["multiple_choice", "true_false", "open_ended"];
  if (!question_type || !validTypes.includes(question_type as string)) {
    return { valid: false, error: `Invalid question type: ${question_type}` };
  }

  if (!correct_answer || typeof correct_answer !== "string" || correct_answer.trim().length === 0) {
    return { valid: false, error: "Correct answer is required" };
  }

  return { valid: true };
}

// POST — Create multiple questions
export async function POST(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { questions } = body;

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "An array of questions is required" }, { status: 400 });
    }

    const insertDataArray = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const validation = validateQuestionData(q);
      if (!validation.valid) {
        return NextResponse.json(
          { error: `Validation failed at index ${i}: ${validation.error}` },
          { status: 400 }
        );
      }

      const insertData: Record<string, string | null> = {
        question_text: (q.question_text as string).trim(),
        question_type: q.question_type as string,
        correct_option: (q.correct_answer as string).trim().toLowerCase(),
        hint: q.hint ? (q.hint as string).trim() : null,
        answer_explanation: q.answer_explanation ? (q.answer_explanation as string).trim() : null,
        associated_kc_id: q.associated_kc_id ? (q.associated_kc_id as string).trim() : null,
      };

      if (q.question_type === "multiple_choice") {
        insertData.option_a = (q.options?.a as string)?.trim() || "";
        insertData.option_b = (q.options?.b as string)?.trim() || "";
        insertData.option_c = (q.options?.c as string)?.trim() || "";
        insertData.option_d = (q.options?.d as string)?.trim() || "";
      } else if (q.question_type === "true_false") {
        insertData.option_a = "True";
        insertData.option_b = "False";
      }

      insertDataArray.push(insertData);
    }

    // Supabase supports bulk insert
    const { data, error } = await supabaseAdmin
      .from("questions")
      .insert(insertDataArray)
      .select();

    if (error) {
      console.error("Failed to bulk create questions", error);
      return NextResponse.json({ error: "Failed to create questions" }, { status: 500 });
    }

    return NextResponse.json({ questions: data, total: data.length }, { status: 201 });
  } catch (e) {
    console.error("Error in bulk route", e);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
