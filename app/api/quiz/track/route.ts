import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sessionId,
      questionId,
      questionText,
      questionType,
      userAnswer,
      isCorrect,
      usedHint,
      timeTakenSeconds,
      isCompleted,
      score,
      totalQuestions
    } = body;

    if (!sessionId || !questionId || !questionText) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Insert the answer
    const { error: answerError } = await supabaseAdmin
      .from("quiz_answers")
      .insert({
        session_id: sessionId,
        question_id: questionId,
        question_text: questionText,
        question_type: questionType,
        user_answer: userAnswer,
        is_correct: isCorrect,
        used_hint: usedHint || false,
        time_taken_seconds: timeTakenSeconds || 0,
      });

    if (answerError) {
      console.error("Error inserting answer:", answerError);
      return NextResponse.json({ error: "Failed to record answer" }, { status: 500 });
    }

    // Update the session's last activity and rolling score
    const sessionUpdate: Record<string, any> = {
      last_activity_at: new Date().toISOString(),
      score: score,
      total_questions: totalQuestions
    };

    const { error: sessionError } = await supabaseAdmin
      .from("quiz_sessions")
      .update(sessionUpdate)
      .eq("id", sessionId);

    if (sessionError) {
      console.error("Error updating session:", sessionError);
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Server error tracking answer:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
