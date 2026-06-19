import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { GoogleGenAI } from "@google/genai";

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    // 1. Fetch user's previous answers
    const { data: previousAnswers, error: answersError } = await supabaseAdmin
      .from("quiz_answers")
      .select("question_id, question_text, user_answer, is_correct")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (answersError) {
      console.error("Error fetching answers:", answersError);
      return NextResponse.json({ error: "Failed to fetch session history" }, { status: 500 });
    }

    // Extract answered IDs
    const answeredIds = previousAnswers?.map(a => a.question_id) || [];

    // 2. Fetch available questions pool (filter out answered ones)
    // To ensure precision and limit token usage, we select all questions
    // then randomly pick a subset if it's too large, or just use all if small enough.
    const { data: allQuestions, error: questionsError } = await supabaseAdmin
      .from("questions")
      .select("id, question_text, associated_kc_id, question_type");

    if (questionsError || !allQuestions) {
      return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 });
    }

    const availableQuestions = allQuestions.filter(q => !answeredIds.includes(q.id));

    if (availableQuestions.length === 0) {
      // No questions left
      return NextResponse.json({ question: null }, { status: 200 });
    }

    // To prevent exceeding context limits and maximize speed, shuffle and take max 15 questions for the pool
    const poolSubset = [...availableQuestions]
      .sort(() => Math.random() - 0.5)
      .slice(0, 30);

    // 3. Format USER_KNOWLEDGE_STATE
    const userKnowledgeState = previousAnswers?.map((ans, idx) => ({
      q_id: ans.question_id,
      X_i: ans.is_correct ? 1 : 0
    })) || [];

    // 4. Format AVAILABLE_QUESTION_POOL
    const availableQuestionPool = poolSubset.map(q => ({
      q_id: q.id,
      text: q.question_text,
      KCs: q.associated_kc_id ? q.associated_kc_id.split(",").map((s: string) => s.trim()) : []
    }));

    // 5. Construct Prompt
    const prompt = `### ROLE AND OBJECTIVE
You are an expert pedagogical agent and adaptive routing engine for a mobile micro-learning application. Your objective is to select the single best next question to present to a user watching the FIFA World Cup 2026. Your goal is to maximize thematic coverage, maintain optimal cognitive engagement, and dynamically bridge gaps in the user's understanding of tournament regulations.

### INPUT DATA STRUCTURE
1. USER_KNOWLEDGE_STATE (C_t): A sequential history of previous interactions:
${JSON.stringify(userKnowledgeState, null, 2)}

2. AVAILABLE_QUESTION_POOL: A JSON array of remaining questions:
${JSON.stringify(availableQuestionPool, null, 2)}

### PEDAGOGICAL EVALUATION FRAMEWORK
To mitigate the cold-start problem and optimize learning paths, analyze the input using these principles:
- Knowledge Component (KC) Extraction & Tracking: Semantically infer the user's mastery level across core domains.
- Zone of Proximal Development (ZPD): Avoid questions that are too easy (boredom) or too complex relative to their current mastery (frustration). If a user fails a High-difficulty item, route them to an Intermediate scaffolding item targeting the same KC.
- Diversity & Coverage Constraints: Prevent item-type fatigue. Do not recommend the same KC more than twice consecutively unless remediation is explicitly required. Balance proximal reinforcement with exploration of unvisited conceptual nodes.
- Temporal Contextualization: Prioritize macro-level tournament rules (e.g., points, qualification, substitutions) that dynamically affect active match-play viewing experiences.

### RULES AND CONSTRAINTS
- You must ONLY select a question that exists within the provided AVAILABLE_QUESTION_POOL.
- You must output exactly ONE question selection.
- Do not provide conversational text, preambles, or postscript explanations outside of the requested JSON structure.
- The output must be valid JSON matching the specified schema exactly.

### OUTPUT SCHEMA
You must respond strictly with a JSON object containing ONLY the following key:
{
  "selected_q_id": "string (the exact ID of the chosen question)"
}`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const responseText = response.text ?? "";
    console.log("Gemini Adaptive Response:", responseText);
    let selectedQid: string | null = null;
    try {
      const parsed = JSON.parse(responseText);
      selectedQid = parsed.selected_q_id;
    } catch (e) {
      console.error("Failed to parse Gemini response:", responseText);
    }

    // Fallback if parsing fails or invalid ID
    if (!selectedQid || !poolSubset.find(q => q.id === selectedQid)) {
      selectedQid = poolSubset[0].id; // Fallback to a random one in the pool
    }

    // We must fetch the FULL question details for the selected question since we only grabbed subset above
    const { data: fullQuestion, error: fqError } = await supabaseAdmin
      .from("questions")
      .select("*")
      .eq("id", selectedQid)
      .single();

    if (fqError || !fullQuestion) {
      return NextResponse.json({ error: "Failed to fetch final selected question" }, { status: 500 });
    }

    return NextResponse.json({ question: fullQuestion }, { status: 200 });

  } catch (error) {
    console.error("Adaptive routing error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
