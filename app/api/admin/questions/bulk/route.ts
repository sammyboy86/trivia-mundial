import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import crypto from "crypto";

// Helper to validate admin session
function validateSession(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  const result = verifySessionToken(token);
  return result.valid;
}

// Input validation for question data (simplified from singular route)
function validateQuestionData(data: any): { valid: boolean; error?: string } {
  const { question_text, question_type, correct_answer } = data;

  if (question_text === undefined || question_text === null || String(question_text).trim().length === 0) {
    return { valid: false, error: "Question text is required" };
  }

  const validTypes = ["multiple_choice", "true_false", "open_ended"];
  const normalizedType = String(question_type).trim().toLowerCase().replace(" ", "_");
  if (!question_type || !validTypes.includes(normalizedType)) {
    return { valid: false, error: `Invalid question type: ${question_type}` };
  }

  const correct_val = data.correct_answer || data.correct_option;
  if (normalizedType !== "open_ended" && (correct_val === undefined || correct_val === null || String(correct_val).trim().length === 0)) {
    return { valid: false, error: "Correct answer/option is required" };
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

    let skipped = 0;
    const insertDataArray = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const validation = validateQuestionData(q);
      if (!validation.valid) {
        console.warn(`Skipping invalid question at index ${i}: ${validation.error} (Question: ${String(q.question_text).substring(0, 30)}...)`);
        skipped++;
        continue;
      }

      const normalizedType = String(q.question_type).trim().toLowerCase().replace(" ", "_");

      const insertData: Record<string, string | null | any> = {
        question_text: String(q.question_text).trim(),
        question_type: normalizedType,
        correct_option: String(q.correct_answer || q.correct_option || "").trim().toLowerCase(),
        hint: q.hint ? String(q.hint).trim() : null,
        answer_explanation: q.answer_explanation ? String(q.answer_explanation).trim() : null,
        associated_kc_id: q.associated_kc_id ? String(q.associated_kc_id).trim() : null,
        option_a: null,
        option_b: null,
        option_c: null,
        option_d: null,
      };

      if (q.id) {
        const idStr = String(q.id).trim();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(idStr)) {
          insertData.id = idStr;
        } else {
          console.warn(`Ignoring invalid UUID: ${idStr}`);
        }
      }
      if (q.metadata) insertData.metadata = q.metadata;

      if (normalizedType === "multiple_choice") {
        let optA = q.option_a ? String(q.option_a).trim() : (q.options?.a ? String(q.options.a).trim() : "");
        let optB = q.option_b ? String(q.option_b).trim() : (q.options?.b ? String(q.options.b).trim() : "");
        let optC = q.option_c ? String(q.option_c).trim() : (q.options?.c ? String(q.options.c).trim() : "");
        let optD = q.option_d ? String(q.option_d).trim() : (q.options?.d ? String(q.options.d).trim() : "");

        const currentCorrectLetter = insertData.correct_option;
        const optionsMap: Record<string, string> = { a: optA, b: optB, c: optC, d: optD };
        
        if (["a", "b", "c", "d"].includes(currentCorrectLetter)) {
          const keys = ["a", "b", "c", "d"];
          for (let i = keys.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [keys[i], keys[j]] = [keys[j], keys[i]];
          }
          
          insertData.option_a = optionsMap[keys[0]];
          insertData.option_b = optionsMap[keys[1]];
          insertData.option_c = optionsMap[keys[2]];
          insertData.option_d = optionsMap[keys[3]];
          
          const newCorrectIndex = keys.indexOf(currentCorrectLetter);
          insertData.correct_option = ["a", "b", "c", "d"][newCorrectIndex];
        } else {
          insertData.option_a = optA;
          insertData.option_b = optB;
          insertData.option_c = optC;
          insertData.option_d = optD;
        }
      } else if (normalizedType === "true_false") {
        insertData.option_a = "True";
        insertData.option_b = "False";
      }

      insertDataArray.push(insertData);
    }

    const newQuestions = insertDataArray.filter(d => !d.id);
    const questionTextsInBatch = newQuestions.map(d => d.question_text);

    // 1. Fetch existing questions to detect duplicates (only for new questions)
    let seenMap = new Set<string>();
    
    if (questionTextsInBatch.length > 0) {
      const { data: existingQuestions, error: fetchError } = await supabaseAdmin
        .from("questions")
        .select("question_text, question_type")
        .in("question_text", questionTextsInBatch);
        
      if (existingQuestions && !fetchError) {
        existingQuestions.forEach(q => {
          seenMap.add(`${q.question_text.toLowerCase()}|${q.question_type}`);
        });
      }
    }

    const uniqueInsertData = [];
    const seenIds = new Set<string>();

    for (const data of insertDataArray) {
      if (data.id) {
        // Prevent duplicate IDs in the same upsert batch to avoid Postgres 21000 error
        if (seenIds.has(data.id)) {
          console.warn(`Skipping duplicate id in batch: ${data.id}`);
          skipped++;
          continue;
        }
        seenIds.add(data.id);
        
        // Upserts pass through textual deduplication
        uniqueInsertData.push(data);
        continue;
      }
      
      const key = `${String(data.question_text).toLowerCase()}|${data.question_type}`;
      if (!seenMap.has(key)) {
        seenMap.add(key);
        uniqueInsertData.push(data);
      } else {
        skipped++;
      }
    }

    if (uniqueInsertData.length === 0) {
      // Don't error out, just let the frontend know this batch yielded 0 new questions
      return NextResponse.json({ questions: [], total: 0, skipped }, { status: 201 });
    }

    // Ensure all objects have an ID to prevent Supabase mixed schema nullification
    uniqueInsertData.forEach(d => {
      if (!d.id) {
        d.id = crypto.randomUUID();
      }
    });

    // Supabase supports bulk upsert
    const { data, error } = await supabaseAdmin
      .from("questions")
      .upsert(uniqueInsertData, { onConflict: "id" })
      .select();

    if (error) {
      console.error("Failed to bulk create questions", error);
      return NextResponse.json({ error: `Failed to create questions: ${error.message || JSON.stringify(error)}` }, { status: 500 });
    }

    return NextResponse.json({ questions: data, total: data.length, skipped }, { status: 201 });
  } catch (e) {
    console.error("Error in bulk route", e);
    return NextResponse.json({ error: `Invalid request body: ${(e as Error).message}` }, { status: 400 });
  }
}

// DELETE — Remove all questions
export async function DELETE(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Delete all questions by targeting all non-null IDs
    const { error } = await supabaseAdmin
      .from("questions")
      .delete()
      .not("id", "is", null);

    if (error) {
      console.error("Failed to delete all questions", error);
      return NextResponse.json({ error: "Failed to delete all questions" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Error deleting all questions", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
