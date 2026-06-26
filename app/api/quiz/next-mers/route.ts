import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { processAnswer, getNextQuestion, QuestionData } from "@/lib/mers";

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    // 1. Fetch user's previous answers
    const { data: previousAnswers, error: answersError } = await supabaseAdmin
      .from("quiz_answers")
      .select("question_id, is_correct")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (answersError) {
      return NextResponse.json({ error: "Failed to fetch session history" }, { status: 500 });
    }

    // 2. Fetch all questions
    const { data: allQuestions, error: questionsError } = await supabaseAdmin
      .from("questions")
      .select("*")
      .not("elo_beta", "is", null);

    if (questionsError || !allQuestions) {
      return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 });
    }

    // 3. Reconstruct user state from history
    let userState: Record<string, { theta: number; n: number }> = {};
    const answeredIds = new Set<string>();

    for (const ans of (previousAnswers || [])) {
      answeredIds.add(ans.question_id);
      const q = allQuestions.find(q => q.id === ans.question_id) as QuestionData | undefined;
      if (q) {
        userState = processAnswer(userState, q, ans.is_correct).newState;
      }
    }

    // 4. Filter available questions
    const availableQuestions = allQuestions.filter(q => !answeredIds.has(q.id)) as QuestionData[];

    if (availableQuestions.length === 0) {
      return NextResponse.json({ question: null }, { status: 200 });
    }

    const stateStr = Object.entries(userState)
      .map(([kc, s]) => `KC${kc}: θ=${s.theta.toFixed(3)}`)
      .join(', ');
    console.log(`[MERS] Current Ability: ${stateStr || "New User"}`);

    // 5. Select next best question using MERS math
    const nextQ = getNextQuestion(userState, availableQuestions);

    if (!nextQ || !nextQ.question) {
      // Fallback
      return NextResponse.json({ question: availableQuestions[Math.floor(Math.random() * availableQuestions.length)] }, { status: 200 });
    }

    return NextResponse.json({ question: nextQ.question }, { status: 200 });
  } catch (error) {
    console.error("MERS routing error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
