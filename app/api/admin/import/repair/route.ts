import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/session";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { GoogleGenAI } from "@google/genai";

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
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { text } = body;
  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Raw text is required" }, { status: 400 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are a strict JSON extraction assistant. I will provide you with raw text that may contain a JSON array of generated assessments (questions), possibly wrapped in metadata, markdown, or containing syntax errors.
Your job is to extract ONLY the array of questions.
The expected structure of a question object is:
{
  "item_type": "multiple_choice" | "true_false" | "open_question",
  "question_text": "string",
  "options": { "a": "string", "b": "string", "c": "string", "d": "string" },
  "correct_answer": "string"
}

Identify all such objects and return them as a valid JSON array. Do not include anything else. Do not use markdown blocks. Ensure the output is strictly parseable JSON.

Raw text to extract from:
${text.substring(0, 50000)} // Ensure we don't blow up the prompt entirely if it's too huge
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ error: "Failed to parse repaired JSON from Gemini" }, { status: 500 });
    }

    if (!Array.isArray(parsed)) {
      // Sometimes it returns { "generated_assessments": [...] } or { "results": [...] }
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, any>;
        if (Array.isArray(obj.generated_assessments)) {
          parsed = obj.generated_assessments;
        } else if (Array.isArray(obj.results)) {
          parsed = obj.results;
        } else {
          return NextResponse.json({ error: "Extracted JSON is not an array" }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: "Extracted JSON is not an array" }, { status: 400 });
      }
    }

    return NextResponse.json({ questions: parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Repair failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
