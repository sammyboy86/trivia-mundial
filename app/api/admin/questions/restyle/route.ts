import { NextRequest } from "next/server";
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
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: { prompt: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { prompt } = body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Prompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: string, data: object) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        const ai = new GoogleGenAI({ apiKey });

        sendEvent("progress", {
          current: 0,
          total: 0,
          heading: "Fetching questions from database...",
          status: "processing",
        });

        // 1. Fetch all questions
        const { data: allQuestions, error } = await supabaseAdmin
          .from("questions")
          .select("*");

        if (error || !allQuestions) {
          sendEvent("error", { message: "Failed to fetch questions from database." });
          controller.close();
          return;
        }

        if (allQuestions.length === 0) {
          sendEvent("error", { message: "No questions found in the database." });
          controller.close();
          return;
        }

        sendEvent("progress", {
          current: 0,
          total: allQuestions.length,
          heading: "Restyling questions...",
          status: "processing",
        });

        let completedCount = 0;
        const concurrencyLimit = 5;
        let currentIndex = 0;

        const worker = async () => {
          while (currentIndex < allQuestions.length) {
            const i = currentIndex++;
            const q = allQuestions[i];

            const systemInstruction = `You are an expert AI restyler. Your task is to apply the following style correction to a trivia question.
IMPORTANT: You MUST apply the style correction (e.g. language translation, tone change) to ALL fields, including the question text, the hint, ALL of the options (option_a, option_b, option_c, option_d), and the correct_option. The correct_option MUST still match one of the options (e.g., if you translate option_a, correct_option must still equal 'a').

You MUST output exactly ONE valid JSON object matching this schema (do not wrap in markdown):
{
  "associated_kc_id": "string or empty",
  "hint": "string or empty",
  "question_text": "string",
  "question_type": "multiple_choice | true_false | open_ended",
  "option_a": "string or empty",
  "option_b": "string or empty",
  "option_c": "string or empty",
  "option_d": "string or empty",
  "correct_option": "string"
}

User's Style Correction Prompt:
${prompt}

Original Question:
${JSON.stringify(q, null, 2)}`;

            try {
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

              // Update database
              const updateData: Record<string, string | null> = {
                question_text: (parsed.question_text || "").trim(),
                question_type: parsed.question_type || q.question_type,
                correct_option: (parsed.correct_option || q.correct_option).trim().toLowerCase(),
                hint: parsed.hint ? (parsed.hint as string).trim() : null,
                associated_kc_id: parsed.associated_kc_id ? (parsed.associated_kc_id as string).trim() : null,
                option_a: parsed.option_a ? (parsed.option_a as string).trim() : null,
                option_b: parsed.option_b ? (parsed.option_b as string).trim() : null,
                option_c: parsed.option_c ? (parsed.option_c as string).trim() : null,
                option_d: parsed.option_d ? (parsed.option_d as string).trim() : null,
              };

              const { error: updateError } = await supabaseAdmin
                .from("questions")
                .update(updateData)
                .eq("id", q.id);

              if (updateError) {
                throw new Error("Failed to update question in database");
              }
            } catch (err) {
              console.error(`Failed to process question ${q.id}:`, err);
            } finally {
              completedCount++;
              sendEvent("progress", {
                current: completedCount,
                total: allQuestions.length,
                heading: `Processed ${completedCount} / ${allQuestions.length} questions`,
                status: "processing",
              });
            }
          }
        };

        const workers = Array.from(
          { length: Math.min(concurrencyLimit, allQuestions.length) },
          () => worker()
        );
        await Promise.all(workers);

        sendEvent("done", { message: "All questions processed successfully!" });
      } catch (err) {
        console.error("Restyle process failed:", err);
        sendEvent("error", {
          message: err instanceof Error ? err.message : "Unknown error occurred",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
