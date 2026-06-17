import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { GoogleGenAI } from "@google/genai";

const GEMINI_MODEL = "gemini-2.5-flash";

function validateSession(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  const result = verifySessionToken(token);
  return result.valid;
}

export async function POST(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  try {
    const { customPrompt } = await request.json();
    if (!customPrompt) {
      return NextResponse.json({ error: "customPrompt is required" }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // 1. Fetch all questions
    const { data: allQuestions, error } = await supabaseAdmin
      .from("questions")
      .select("id, question_text, associated_kc_id");

    if (error || !allQuestions) {
      return NextResponse.json({ error: "Failed to fetch questions from database" }, { status: 500 });
    }

    if (allQuestions.length === 0) {
      return NextResponse.json({ error: "No questions found in the database" }, { status: 400 });
    }

    // Pass all questions (only id, text, kc)
    const questionsPayload = JSON.stringify(allQuestions, null, 2);

    const systemInstruction = `${customPrompt}

You MUST return exactly ONE valid JSON object. 
The JSON object MUST be a map of question IDs (keys) to their generated topic strings (values).
Do NOT wrap the JSON in markdown code blocks.
Example schema:
{
  "uuid-1": "Topic Name",
  "uuid-2": "Another Topic Name"
}

Questions to categorize:
${questionsPayload}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: systemInstruction,
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text ?? "";
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ error: "Gemini returned invalid JSON" }, { status: 500 });
    }

    // Bulk update database
    let updatedCount = 0;
    for (const [id, topic] of Object.entries(parsed)) {
      if (typeof topic === "string") {
        const { error: updateError } = await supabaseAdmin
          .from("questions")
          .update({ topic: topic.trim() })
          .eq("id", id);
        
        if (!updateError) {
          updatedCount++;
        }
      }
    }

    return NextResponse.json({ success: true, updatedCount, total: allQuestions.length });
  } catch (err) {
    console.error("Topic generation failed:", err);
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : "Unknown error occurred" 
    }, { status: 500 });
  }
}
