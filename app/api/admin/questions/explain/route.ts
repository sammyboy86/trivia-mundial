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
          heading: "Generating explanations...",
          status: "processing",
        });

        let completedCount = 0;
        const concurrencyLimit = 5;
        let currentIndex = 0;

        const worker = async () => {
          while (currentIndex < allQuestions.length) {
            const i = currentIndex++;
            const q = allQuestions[i];

            const systemInstruction = `You are an expert trivia tutor. Your task is to provide a very brief, concise explanation (1-2 sentences) of why the correct answer is correct for the given trivia question.
The explanation MUST be in Spanish.

You MUST output exactly ONE valid JSON object matching this schema (do not wrap in markdown):
{
  "answer_explanation": "string"
}

Trivia Question Context:
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

              if (parsed.answer_explanation) {
                const { error: updateError } = await supabaseAdmin
                  .from("questions")
                  .update({ answer_explanation: parsed.answer_explanation.trim() })
                  .eq("id", q.id);

                if (updateError) {
                  throw new Error("Failed to update question in database");
                }
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

        sendEvent("done", { message: "All explanations generated successfully!" });
      } catch (err) {
        console.error("Explanation process failed:", err);
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
