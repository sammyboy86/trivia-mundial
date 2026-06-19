import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
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

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { prompt, kcsJson } = body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Prompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!kcsJson || typeof kcsJson !== "string" || kcsJson.trim().length === 0) {
    return new Response(JSON.stringify({ error: "KCs JSON is required" }), {
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
        const { data: allQuestions, error: fetchError } = await supabaseAdmin
          .from("questions")
          .select("id, question_text, question_type, option_a, option_b, option_c, option_d");

        if (fetchError || !allQuestions) {
          throw new Error("Failed to fetch questions from database.");
        }

        if (allQuestions.length === 0) {
           sendEvent("done", { success: true });
           controller.close();
           return;
        }

        const ai = new GoogleGenAI({ apiKey });

        const chunkSize = 5; // Small batches, high precision
        const totalChunks = Math.ceil(allQuestions.length / chunkSize);
        let processedCount = 0;

        for (let i = 0; i < totalChunks; i++) {
          const chunk = allQuestions.slice(i * chunkSize, (i + 1) * chunkSize);
          
          sendEvent("progress", {
            current: processedCount,
            total: allQuestions.length,
            heading: `Assigning KCs: Chunk ${i + 1} of ${totalChunks}...`,
            status: "processing",
          });

          // Simplify chunk for Gemini
          const chunkToProcess = chunk.map(q => ({
             id: q.id,
             question_text: q.question_text,
             options: {
                a: q.option_a,
                b: q.option_b,
                c: q.option_c,
                d: q.option_d
             }
          }));

          const fullPrompt = `${prompt}

Here is the JSON list of available Knowledge Components (KCs):
${kcsJson}

CRITICAL INSTRUCTIONS:
1. Return ONLY a JSON array.
2. Each object in the array MUST contain:
   - "id": the id of the question
   - "assigned_kcs": an array of strings representing the KCs assigned to this question (must be chosen from the provided KC list).

Here is the JSON array of questions to process:
${JSON.stringify(chunkToProcess, null, 2)}`;

          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: fullPrompt,
            config: {
              responseMimeType: "application/json",
            },
          });

          const responseText = response.text ?? "";
          let parsed: unknown;
          try {
            parsed = JSON.parse(responseText);
          } catch {
             sendEvent("error", { message: `Failed to parse AI response for chunk ${i + 1}` });
             parsed = null;
          }

          if (parsed) {
             let parsedArray: any[] = [];
             if (!Array.isArray(parsed)) {
                if (typeof parsed === "object" && parsed !== null) {
                   if (Array.isArray((parsed as any).results)) {
                      parsedArray = (parsed as any).results;
                   } else {
                      parsedArray = [parsed];
                   }
                }
             } else {
                parsedArray = parsed;
             }

             // Update Supabase for each question in the chunk
             const updatePromises = [];
             for (const original of chunk) {
                const assigned = parsedArray.find(q => String(q.id) === String(original.id));
                if (assigned && Array.isArray(assigned.assigned_kcs)) {
                   const kcString = assigned.assigned_kcs.join(", ");
                   updatePromises.push(
                       supabaseAdmin
                           .from("questions")
                           .update({ associated_kc_id: kcString })
                           .eq("id", original.id)
                   );
                }
             }

             if (updatePromises.length > 0) {
                 const results = await Promise.all(updatePromises);
                 const errors = results.filter(r => r.error);
                 if (errors.length > 0) {
                     sendEvent("error", { message: `Database update failed for chunk ${i + 1}: ${errors[0].error?.message}` });
                 }
             }
          }

          processedCount += chunk.length;
          
          sendEvent("progress", {
            current: processedCount,
            total: allQuestions.length,
            heading: `Processed ${processedCount} of ${allQuestions.length}...`,
            status: "processing",
          });
        }

        sendEvent("done", { success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Process failed";
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
