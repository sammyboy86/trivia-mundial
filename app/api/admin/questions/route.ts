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

// Input validation for question data
function validateQuestionData(data: Record<string, unknown>): { valid: boolean; error?: string } {
  const { question_text, question_type, correct_option } = data;

  if (!question_text || typeof question_text !== "string" || question_text.trim().length === 0) {
    return { valid: false, error: "Question text is required" };
  }

  if (question_text.length > 1000) {
    return { valid: false, error: "Question text must be under 1000 characters" };
  }

  const validTypes = ["multiple_choice", "true_false", "open_ended"];
  if (!question_type || !validTypes.includes(question_type as string)) {
    return { valid: false, error: "Invalid question type" };
  }

  if (!correct_option || typeof correct_option !== "string" || correct_option.trim().length === 0) {
    return { valid: false, error: "Correct answer is required" };
  }

  if (question_type === "multiple_choice") {
    const { option_a, option_b, option_c, option_d } = data;
    if (!option_a || !option_b || !option_c || !option_d) {
      return { valid: false, error: "All four options are required for multiple choice" };
    }
    const validOptions = ["a", "b", "c", "d"];
    if (!validOptions.includes((correct_option as string).toLowerCase())) {
      return { valid: false, error: "Correct option must be a, b, c, or d" };
    }
  }

  if (question_type === "true_false") {
    const validOptions = ["true", "false"];
    if (!validOptions.includes((correct_option as string).toLowerCase())) {
      return { valid: false, error: "Correct option must be true or false" };
    }
  }

  return { valid: true };
}

// GET — List all questions
export async function GET(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from("questions")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Failed to fetch questions");
    return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 });
  }

  return NextResponse.json({ questions: data, total: count, page, limit });
}

// POST — Create a question
export async function POST(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = validateQuestionData(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const insertData: Record<string, string | null> = {
      question_text: (body.question_text as string).trim(),
      question_type: body.question_type as string,
      correct_option: (body.correct_option as string).trim().toLowerCase(),
      hint: body.hint ? (body.hint as string).trim() : null,
      answer_explanation: body.answer_explanation ? (body.answer_explanation as string).trim() : null,
      associated_kc_id: body.associated_kc_id ? (body.associated_kc_id as string).trim() : null,
    };

    if (body.question_type === "multiple_choice") {
      insertData.option_a = (body.option_a as string).trim();
      insertData.option_b = (body.option_b as string).trim();
      insertData.option_c = (body.option_c as string).trim();
      insertData.option_d = (body.option_d as string).trim();
    } else if (body.question_type === "true_false") {
      insertData.option_a = "True";
      insertData.option_b = "False";
    }

    const { data, error } = await supabaseAdmin
      .from("questions")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("Failed to create question");
      return NextResponse.json({ error: "Failed to create question" }, { status: 500 });
    }

    return NextResponse.json({ question: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

// PUT — Update a question
export async function PUT(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, ...updateFields } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Question ID is required" }, { status: 400 });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: "Invalid question ID format" }, { status: 400 });
    }

    const validation = validateQuestionData(updateFields);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const updateData: Record<string, string | null> = {
      question_text: (updateFields.question_text as string).trim(),
      question_type: updateFields.question_type as string,
      correct_option: (updateFields.correct_option as string).trim().toLowerCase(),
      hint: updateFields.hint ? (updateFields.hint as string).trim() : null,
      answer_explanation: updateFields.answer_explanation ? (updateFields.answer_explanation as string).trim() : null,
      associated_kc_id: updateFields.associated_kc_id ? (updateFields.associated_kc_id as string).trim() : null,
    };

    if (updateFields.question_type === "multiple_choice") {
      updateData.option_a = (updateFields.option_a as string).trim();
      updateData.option_b = (updateFields.option_b as string).trim();
      updateData.option_c = (updateFields.option_c as string).trim();
      updateData.option_d = (updateFields.option_d as string).trim();
    } else if (updateFields.question_type === "true_false") {
      updateData.option_a = "True";
      updateData.option_b = "False";
    }

    const { data, error } = await supabaseAdmin
      .from("questions")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update question");
      return NextResponse.json({ error: "Failed to update question" }, { status: 500 });
    }

    return NextResponse.json({ question: data });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

// DELETE — Remove a question
export async function DELETE(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Question ID is required" }, { status: 400 });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: "Invalid question ID format" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("questions")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Failed to delete question");
      return NextResponse.json({ error: "Failed to delete question" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
