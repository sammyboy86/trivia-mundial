import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { GoogleGenAI } from "@google/genai";

/**
 * POST /api/demo/next-adaptive
 *
 * Demo-only endpoint for the LLM adaptive engine.
 * Receives the full answer history inline (no DB session lookups).
 * Does NOT write to quiz_sessions, quiz_answers, or any other table.
 * Only reads from `questions` and calls the Gemini LLM.
 *
 * Body: {
 *   answeredHistory: Array<{ questionId: string, questionText: string, isCorrect: boolean }>
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const answeredHistory: Array<{
      questionId: string;
      questionText: string;
      isCorrect: boolean;
    }> = body.answeredHistory || [];

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Extract answered IDs
    const answeredIds = answeredHistory.map((a) => a.questionId);

    // Fetch all questions (read-only)
    const { data: allQuestions, error: questionsError } = await supabaseAdmin
      .from("questions")
      .select("id, question_text, associated_kc_id, question_type");

    if (questionsError || !allQuestions) {
      return NextResponse.json(
        { error: "Failed to fetch questions" },
        { status: 500 }
      );
    }

    const availableQuestions = allQuestions.filter(
      (q) => !answeredIds.includes(q.id)
    );

    if (availableQuestions.length === 0) {
      return NextResponse.json({ question: null }, { status: 200 });
    }

    // Format user knowledge state from inline history
    const userKnowledgeState = answeredHistory.map((ans) => {
      const qInfo = allQuestions.find((q) => q.id === ans.questionId);
      return {
        q_id: ans.questionId,
        text: ans.questionText || qInfo?.question_text,
        KCs: qInfo?.associated_kc_id
          ? qInfo.associated_kc_id
              .split(",")
              .map((s: string) => s.trim())
          : [],
        X_i: ans.isCorrect ? 1 : 0,
      };
    });

    // Format available question pool
    const availableQuestionPool = availableQuestions.map((q) => ({
      q_id: q.id,
      text: q.question_text,
      KCs: q.associated_kc_id
        ? q.associated_kc_id.split(",").map((s: string) => s.trim())
        : [],
    }));

    // Construct prompt (same as the real endpoint)
    const prompt = `### ROLE AND OBJECTIVE
You are an expert adaptive routing engine for a mobile micro-learning application. Your objective is to select the single best next question to present to a user. Your goal is to maximize engagement and learning by simulating a Multidimensional Elo Rating System (MERS) heuristic: balancing the user's estimated ability with question difficulty across varied Knowledge Components (KCs).

### INPUT DATA STRUCTURE
1. USER_KNOWLEDGE_STATE (C_t): A sequential history of previous interactions (showing correct and incorrect answers per KC):
${JSON.stringify(userKnowledgeState, null, 2)}

2. AVAILABLE_QUESTION_POOL: A JSON array of remaining questions (including their respective KCs and difficulty contexts):
${JSON.stringify(availableQuestionPool, null, 2)}

### MERS HEURISTIC EVALUATION
To optimize the learning path, analyze the input using these two core principles:
1. KC Rotation (Diversity): Identify which Knowledge Components (KCs) the user has interacted with the least. Prioritize selecting a question from an underrepresented KC to ensure a balanced thematic coverage and prevent item-type fatigue.
2. Ability-Difficulty Matching: Within the prioritized KC, dynamically infer the user's current ability based on their history (e.g., a streak of correct answers implies higher ability; failures imply lower ability). Select a question whose difficulty provides a moderate, engaging challenge relative to that ability. Avoid questions that are trivially easy or frustratingly hard.

### RULES AND CONSTRAINTS
- You must ONLY select a question that exists within the provided AVAILABLE_QUESTION_POOL.
- You must output exactly ONE question selection.
- Do not provide conversational text, preambles, or postscript explanations outside of the requested JSON structure.
- The output must be valid JSON matching the specified schema exactly.

### OUTPUT SCHEMA
You must respond strictly with a JSON object containing ONLY the following keys:
{
  "motive": "string (Briefly explain your KC rotation and ability-difficulty reasoning for this choice)",
  "selected_q_id": "string (the exact ID of the chosen question)"
}`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text ?? "";
    let selectedQid: string | null = null;
    try {
      const parsed = JSON.parse(responseText);
      selectedQid = parsed.selected_q_id;
    } catch (e) {
      console.error("Demo: Failed to parse Gemini response:", responseText);
    }

    // Fallback if parsing fails or invalid ID
    if (
      !selectedQid ||
      !availableQuestions.find((q) => q.id === selectedQid)
    ) {
      selectedQid = availableQuestions[0].id;
    }

    // Fetch the full question details (read-only)
    const { data: fullQuestion, error: fqError } = await supabaseAdmin
      .from("questions")
      .select("*")
      .eq("id", selectedQid)
      .single();

    if (fqError || !fullQuestion) {
      return NextResponse.json(
        { error: "Failed to fetch selected question" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        question: fullQuestion,
        debug: {
          prompt,
          rawResponse: responseText,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Demo adaptive routing error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
