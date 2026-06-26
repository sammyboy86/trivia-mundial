import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { GoogleGenAI } from "@google/genai";

// Allow long-running LLM simulation (up to 15 minutes)
export const maxDuration = 900;

function validateSession(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  const result = verifySessionToken(token);
  return result.valid;
}

// ── Personas ──

interface Persona {
  name: string;
  theta: number;
  count: number;
  systemPrompt: string;
}

const PERSONAS: Persona[] = [
  {
    name: "Casual Observer",
    theta: -1.5,
    count: 50,
    systemPrompt:
      "You are a casual spectator who only watches football during the World Cup every four years. You know the very basic rules (goals, no hands), but you do not understand the offside rule, VAR protocols, or tournament tie-breakers. Answer the following question using common sense. If you are confused, take a random guess.",
  },
  {
    name: "Casual Fan",
    theta: 0.0,
    count: 50,
    systemPrompt:
      "You are a casual football fan who watches weekend league matches. You understand the flow of the game well, but you easily get confused by specific rule exceptions, strict VAR protocols, or FIFA World Cup group stage tie-breakers. Answer the following question.",
  },
];

// ── Question type helpers ──

interface QuestionRow {
  id: string;
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_option: string;
}

/** Guessing parameter c_j by question type */
function guessingParam(questionType: string): number {
  if (questionType === "true_false") return 0.5;
  return 0.25; // default to multiple_choice
}

// ── MERS math ──

/**
 * Expected score with guessing parameter (base-10 Elo scale):
 * E(X) = c_j + (1 - c_j) * 1 / (1 + 10^((β_j - θ_i) / 4))
 */
function expectedScore(beta: number, theta: number, cj: number): number {
  return cj + (1 - cj) * (1 / (1 + Math.pow(10, (beta - theta) / 4)));
}

/** Decaying K-factor: K = kInitial / (1 + kDecay * n) */
function kFactor(nj: number, kInitial: number, kDecay: number): number {
  return kInitial / (1 + kDecay * nj);
}

/** Standard deviation of an array */
function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/** Fisher-Yates shuffle */
function shuffleArray<T>(array: T[]): T[] {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── LLM prompt builders ──

function buildTestTakerPrompt(q: QuestionRow): string {
  if (q.question_type === "true_false") {
    return [
      `Statement: ${q.question_text}`,
      "",
      `A) ${q.option_a || "True"}`,
      `B) ${q.option_b || "False"}`,
      "",
      "Reply with ONLY the letter of your chosen answer (A or B). Do not explain.",
    ].join("\n");
  }

  return [
    `Question: ${q.question_text}`,
    "",
    `A) ${q.option_a}`,
    `B) ${q.option_b}`,
    `C) ${q.option_c}`,
    `D) ${q.option_d}`,
    "",
    "Reply with ONLY the letter of your chosen answer (A, B, C, or D). Do not explain.",
  ].join("\n");
}

// ── LLM scoring ──

function scoreMcResponse(raw: string, correctOption: string): number {
  const cleaned = raw.trim().toUpperCase();
  // Extract the first letter A-D from the response
  const match = cleaned.match(/^([A-D])/);
  if (!match) return 0;
  return match[1].toLowerCase() === correctOption.toLowerCase() ? 1 : 0;
}

// ── Small delay utility ──

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── POST: Launch content-aware calibration ──

export async function POST(request: NextRequest) {
  if (!validateSession(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse configurable params
  const numAgents = Math.max(2, Math.min(500, Math.round(Number(body.numAgents ?? 100))));
  const kInitial = Math.max(0.01, Math.min(5, Number(body.kInitial ?? 0.8)));
  const kDecay = Math.max(0, Math.min(1, Number(body.kDecay ?? 0.05)));
  const temperature = Math.max(0, Math.min(2, Number(body.temperature ?? 1.0)));
  const concurrency = Math.max(1, Math.min(15, Math.round(Number(body.concurrency ?? 5))));

  const localPersonas = PERSONAS.map((p, i) => {
    const count = i === 0 ? Math.floor(numAgents / 2) : Math.ceil(numAgents / 2);
    let systemPrompt = p.systemPrompt;
    if (i === 0 && typeof body.persona1Prompt === "string" && body.persona1Prompt.trim()) {
      systemPrompt = body.persona1Prompt.trim();
    }
    if (i === 1 && typeof body.persona2Prompt === "string" && body.persona2Prompt.trim()) {
      systemPrompt = body.persona2Prompt.trim();
    }
    return { ...p, count, systemPrompt };
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: string, data: object) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        // 1. Fetch all questions
        const { data: allQuestions, error: fetchError } = await supabaseAdmin
          .from("questions")
          .select("id, question_text, question_type, option_a, option_b, option_c, option_d, correct_option");

        if (fetchError || !allQuestions || allQuestions.length === 0) {
          throw new Error("No questions found in database.");
        }

        const totalQuestions = allQuestions.length;
        const totalAgents = localPersonas.reduce((sum, p) => sum + p.count, 0);

        sendEvent("progress", {
          phase: "init",
          message: `Found ${totalQuestions} questions. Initializing β = 0 for all...`,
          agent: 0,
          totalAgents,
          question: 0,
          totalQuestions,
        });

        // 2. Reset all β_j = 0, response_count = 0
        const { error: resetError } = await supabaseAdmin
          .from("questions")
          .update({ elo_beta: 0, elo_response_count: 0 })
          .neq("id", "00000000-0000-0000-0000-000000000000");

        if (resetError) {
          throw new Error("Failed to reset β values: " + resetError.message);
        }

        // Create calibration run record
        const { data: runData, error: runError } = await supabaseAdmin
          .from("elo_calibration_runs")
          .insert({
            num_agents: totalAgents,
            theta_mean: 0,
            theta_std: 0,
            k_initial: kInitial,
            k_decay: kDecay,
            total_questions: totalQuestions,
            status: "running",
          })
          .select("id")
          .single();

        if (runError) {
          throw new Error("Failed to create calibration run record.");
        }
        const runId = runData.id;

        // In-memory β and n_j maps
        const betaMap: Record<string, number> = {};
        const njMap: Record<string, number> = {};
        for (const q of allQuestions) {
          betaMap[q.id] = 0;
          njMap[q.id] = 0;
        }

        // Initialize Gemini
        const ai = new GoogleGenAI({ apiKey });

        sendEvent("progress", {
          phase: "init",
          message: `Gemini ready. Starting ${totalAgents}-agent simulation (${localPersonas.map((p) => `${p.count}× ${p.name}`).join(", ")})...`,
          agent: 0,
          totalAgents,
          question: 0,
          totalQuestions,
        });

        // 3. Main simulation loop
        const logEntries: Array<{
          agent: number;
          persona: string;
          theta: number;
          correctRate: number;
          correct: number;
          total: number;
        }> = [];

        let globalAgentIndex = 0;

        for (const persona of localPersonas) {
          for (let p = 0; p < persona.count; p++) {
            globalAgentIndex++;
            const shuffledQuestions = shuffleArray(allQuestions);

            let correctCount = 0;
            let questionsProcessed = 0;

            // Process questions in concurrent batches
            for (let batchStart = 0; batchStart < totalQuestions; batchStart += concurrency) {
              const batchEnd = Math.min(batchStart + concurrency, totalQuestions);
              const batch = shuffledQuestions.slice(batchStart, batchEnd);

              // Fire concurrent LLM calls for this batch
              const batchResults = await Promise.allSettled(
                batch.map(async (q) => {
                  const userPrompt = buildTestTakerPrompt(q);
                  let outcome = 0;

                  try {
                    const resp = await ai.models.generateContent({
                      model: "gemini-2.5-flash",
                      contents: userPrompt,
                      config: {
                        systemInstruction: persona.systemPrompt,
                        temperature,
                        maxOutputTokens: 10,
                      },
                    });
                    const raw = resp.text ?? "";
                    outcome = scoreMcResponse(raw, q.correct_option);
                  } catch {
                    // LLM failure → treat as incorrect
                    outcome = 0;
                  }

                  return { questionId: q.id, outcome, questionType: q.question_type };
                })
              );

              // Apply β updates sequentially for this batch
              for (const settled of batchResults) {
                if (settled.status === "fulfilled") {
                  const { questionId, outcome, questionType } = settled.value;

                  const beta = betaMap[questionId];
                  const cj = guessingParam(questionType);
                  const ex = expectedScore(beta, persona.theta, cj);

                  const n = njMap[questionId];
                  const k = kFactor(n, kInitial, kDecay);
                  betaMap[questionId] = beta + k * (ex - outcome);
                  njMap[questionId] = n + 1;

                  if (outcome === 1) correctCount++;
                } else {
                  // Promise rejected — treat as incorrect, no β update
                }
                questionsProcessed++;
              }

              // Stream progress every batch
              const betaValues = Object.values(betaMap);
              const bMean = betaValues.reduce((a, b) => a + b, 0) / betaValues.length;
              const bStd = stdDev(betaValues);
              const bMin = Math.min(...betaValues);
              const bMax = Math.max(...betaValues);

              sendEvent("progress", {
                phase: "simulating",
                agent: globalAgentIndex,
                totalAgents,
                persona: persona.name,
                agentTheta: persona.theta,
                question: questionsProcessed,
                totalQuestions,
                stats: {
                  betaMean: Math.round(bMean * 1000) / 1000,
                  betaStd: Math.round(bStd * 1000) / 1000,
                  betaMin: Math.round(bMin * 1000) / 1000,
                  betaMax: Math.round(bMax * 1000) / 1000,
                },
                message: `Agent ${globalAgentIndex}/${totalAgents} [${persona.name}, θ=${persona.theta}] → Q ${questionsProcessed}/${totalQuestions} (${correctCount} correct so far)`,
              });

              // Small delay between batches to respect rate limits
              await delay(100);
            }

            // Agent completed
            const correctRate = correctCount / totalQuestions;
            logEntries.push({
              agent: globalAgentIndex,
              persona: persona.name,
              theta: persona.theta,
              correct: correctCount,
              total: totalQuestions,
              correctRate: Math.round(correctRate * 1000) / 1000,
            });

            sendEvent("progress", {
              phase: "agent_done",
              agent: globalAgentIndex,
              totalAgents,
              persona: persona.name,
              agentTheta: persona.theta,
              correctRate: Math.round(correctRate * 1000) / 1000,
              question: totalQuestions,
              totalQuestions,
              message: `✅ Agent ${globalAgentIndex}/${totalAgents} [${persona.name}] finished → ${correctCount}/${totalQuestions} correct (${(correctRate * 100).toFixed(1)}%)`,
            });
          }
        }

        // 4. Save final β values to database
        sendEvent("progress", {
          phase: "saving",
          message: "Saving calibrated β values to database...",
          agent: totalAgents,
          totalAgents,
          question: totalQuestions,
          totalQuestions,
        });

        const now = new Date().toISOString();
        const questionIds = Object.keys(betaMap);
        const chunkSize = 50;
        for (let c = 0; c < questionIds.length; c += chunkSize) {
          const chunk = questionIds.slice(c, c + chunkSize);
          const updates = chunk.map((qid) =>
            supabaseAdmin
              .from("questions")
              .update({
                elo_beta: Math.round(betaMap[qid] * 10000) / 10000,
                elo_response_count: njMap[qid],
                elo_calibrated_at: now,
              })
              .eq("id", qid)
          );
          await Promise.all(updates);
        }

        // Compute final stats
        const finalBetas = Object.values(betaMap);
        const finalMean = finalBetas.reduce((a, b) => a + b, 0) / finalBetas.length;
        const finalStd = stdDev(finalBetas);
        const finalMin = Math.min(...finalBetas);
        const finalMax = Math.max(...finalBetas);

        // Build β distribution (histogram buckets)
        const buckets: Record<string, number> = {};
        // Find safe bounds (at least covering -1 to 1 for visual center, but extending to real min/max)
        const minBound = Math.min(-1, Math.floor(finalMin * 2) / 2);
        const maxBound = Math.max(1, Math.ceil(finalMax * 2) / 2);

        for (let b = minBound; b <= maxBound; b += 0.5) {
          buckets[b.toFixed(1)] = 0;
        }
        for (const b of finalBetas) {
          const rounded = Math.round(b * 2) / 2;
          const key = rounded.toFixed(1);
          if (buckets[key] !== undefined) {
            buckets[key]++;
          } else {
            buckets[key] = 1;
          }
        }

        // Per-question results
        const questionResults = allQuestions.map((q) => ({
          id: q.id,
          question_text: q.question_text.substring(0, 120),
          question_type: q.question_type,
          beta: Math.round(betaMap[q.id] * 10000) / 10000,
          responseCount: njMap[q.id],
        })).sort((a, b) => a.beta - b.beta);

        // Per-persona summary
        const personaSummary = localPersonas.map((persona) => {
          const agentLogs = logEntries.filter((l) => l.persona === persona.name);
          const avgCorrectRate =
            agentLogs.reduce((sum, l) => sum + l.correctRate, 0) / agentLogs.length;
          return {
            name: persona.name,
            theta: persona.theta,
            count: persona.count,
            avgCorrectRate: Math.round(avgCorrectRate * 1000) / 1000,
          };
        });

        // Update calibration run record
        await supabaseAdmin
          .from("elo_calibration_runs")
          .update({
            completed_at: now,
            status: "completed",
            beta_mean: Math.round(finalMean * 10000) / 10000,
            beta_std: Math.round(finalStd * 10000) / 10000,
            beta_min: Math.round(finalMin * 10000) / 10000,
            beta_max: Math.round(finalMax * 10000) / 10000,
            log_summary: logEntries,
          })
          .eq("id", runId);

        sendEvent("done", {
          success: true,
          runId,
          stats: {
            betaMean: Math.round(finalMean * 10000) / 10000,
            betaStd: Math.round(finalStd * 10000) / 10000,
            betaMin: Math.round(finalMin * 10000) / 10000,
            betaMax: Math.round(finalMax * 10000) / 10000,
          },
          distribution: buckets,
          questions: questionResults,
          agents: logEntries,
          personaSummary,
          params: { kInitial, kDecay, temperature, concurrency, totalAgents },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Calibration failed";
        sendEvent("error", { message: msg });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// ── GET: Retrieve current calibration data ──

export async function GET(request: NextRequest) {
  if (!validateSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: runs, error: runError } = await supabaseAdmin
    .from("elo_calibration_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(5);

  if (runError) {
    return NextResponse.json({ error: "Failed to fetch calibration runs" }, { status: 500 });
  }

  const { data: questions, error: qError } = await supabaseAdmin
    .from("questions")
    .select("id, question_text, question_type, elo_beta, elo_response_count, elo_calibrated_at, option_a, option_b, option_c, option_d, correct_option, associated_kc_id, hint, answer_explanation")
    .order("elo_beta", { ascending: true });

  if (qError) {
    return NextResponse.json({ error: "Failed to fetch question betas" }, { status: 500 });
  }

  return NextResponse.json({ runs: runs || [], questions: questions || [] });
}
