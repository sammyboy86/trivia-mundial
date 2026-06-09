import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const GEMINI_MODEL = "gemini-2.5-flash";

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { questionText, correctAnswer, studentAnswer } = body;

  if (!questionText || !correctAnswer || !studentAnswer) {
    return NextResponse.json(
      { error: "Missing required fields: questionText, correctAnswer, studentAnswer" },
      { status: 400 }
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `You are a trivia grader. Given the question, the official correct answer, and the student's answer, determine if the student's answer is correct. Be forgiving of minor spelling mistakes, slight translation differences, and phrasing, but strict on facts.
You MUST output exactly ONE valid JSON object matching this schema (do not wrap in markdown):
{
  "is_correct": boolean
}

Question: "${questionText}"
Official Correct Answer: "${correctAnswer}"
Student Answer: "${studentAnswer}"`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: systemInstruction,
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text ?? "";
    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      throw new Error("Gemini returned invalid JSON");
    }

    if (typeof parsed.is_correct === "boolean") {
      return NextResponse.json({ is_correct: parsed.is_correct });
    } else {
      throw new Error("Invalid schema from Gemini");
    }
  } catch (err) {
    console.error("Grading failed:", err);
    // Fallback to basic case-insensitive string match if Gemini fails
    const fallbackCorrect = studentAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
    return NextResponse.json({ is_correct: fallbackCorrect });
  }
}
