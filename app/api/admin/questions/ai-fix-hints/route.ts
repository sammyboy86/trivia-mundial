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
        const { data: allQuestions, error: fetchError } = await supabaseAdmin
          .from("questions")
          .select("*")
          .order("created_at", { ascending: true });

        if (fetchError || !allQuestions) {
          throw new Error("Failed to fetch questions from database.");
        }

        if (allQuestions.length === 0) {
           sendEvent("done", { success: true });
           controller.close();
           return;
        }

        const ai = new GoogleGenAI({ apiKey });

        const chunkSize = 5;
        const totalChunks = Math.ceil(allQuestions.length / chunkSize);
        let processedCount = 0;

        for (let i = 0; i < totalChunks; i++) {
          const chunk = allQuestions.slice(i * chunkSize, (i + 1) * chunkSize);
          
          sendEvent("progress", {
            current: processedCount,
            total: allQuestions.length,
            heading: `Fixing chunk ${i + 1} of ${totalChunks}...`,
            status: "processing",
          });

          // Simplify chunk for Gemini so it doesn't get overwhelmed with metadata
          const chunkToCorrect = chunk.map(q => ({
             id: q.id,
             question_text: q.question_text,
             question_type: q.question_type,
             options: {
                a: q.option_a,
                b: q.option_b,
                c: q.option_c,
                d: q.option_d
             },
             correct_option: q.correct_option,
             hint: q.hint,
             answer_explanation: q.answer_explanation
          }));

          const fullPrompt = `${prompt}\n\nCRITICAL: Keep the exact JSON structure identical. DO NOT change, remove, or omit the 'id' field. Return an array of objects.\n\nHere is the JSON array of questions to correct:\n\n${JSON.stringify(chunkToCorrect, null, 2)}`;

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
                   if (Array.isArray((parsed as any).questions)) {
                      parsedArray = (parsed as any).questions;
                   } else if (Array.isArray((parsed as any).generated_assessments)) {
                      parsedArray = (parsed as any).generated_assessments;
                   } else {
                      parsedArray = [parsed];
                   }
                }
             } else {
                parsedArray = parsed;
             }

             const updates = [];
             for (const original of chunk) {
                // Find matching question by ID
                const corrected = parsedArray.find(q => String(q.id).trim() === String(original.id).trim());
                if (corrected) {
                   const updateData: any = { ...original };
                   
                   // Apply valid type
                   if (corrected.hint !== undefined) updateData.hint = corrected.hint;
                   if (corrected.answer_explanation !== undefined) updateData.answer_explanation = corrected.answer_explanation;
                   
                   // Map correct answer
                   let rawAnswer = String(corrected.correct_answer || corrected.correct_option || original.correct_option || "a").trim().toLowerCase();
                   
                   // Text fallback map
                   if (original.question_type === "multiple_choice") {
                      if (rawAnswer === String(original.option_a).trim().toLowerCase()) rawAnswer = "a";
                      else if (rawAnswer === String(original.option_b).trim().toLowerCase()) rawAnswer = "b";
                      else if (rawAnswer === String(original.option_c).trim().toLowerCase()) rawAnswer = "c";
                      else if (rawAnswer === String(original.option_d).trim().toLowerCase()) rawAnswer = "d";
                   } else if (original.question_type === "true_false") {
                      if (rawAnswer === "true") rawAnswer = "true";
                      else if (rawAnswer === "false") rawAnswer = "false";
                   }
                   
                   updateData.correct_option = rawAnswer;
                   updates.push(updateData);
                }
             }

             if (updates.length > 0) {
                 const { error: upsertError } = await supabaseAdmin.from("questions").upsert(updates);
                 if (upsertError) {
                     sendEvent("error", { message: `Database update failed for chunk ${i + 1}: ${upsertError.message}` });
                 }
             }
          }

          processedCount += chunk.length;
          
          sendEvent("progress", {
            current: processedCount,
            total: allQuestions.length,
            heading: `Fixed ${processedCount} of ${allQuestions.length}...`,
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
