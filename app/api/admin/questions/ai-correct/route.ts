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
            heading: `Correcting chunk ${i + 1} of ${totalChunks}...`,
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
             correct_answer: q.correct_option
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
                   if (["multiple_choice", "true_false", "open_ended"].includes(corrected.question_type)) {
                       updateData.question_type = corrected.question_type;
                   }
                   
                   if (corrected.question_text) updateData.question_text = corrected.question_text;
                   
                   // Parse options
                   if (updateData.question_type === "multiple_choice" || (corrected.options && Object.keys(corrected.options).length > 0)) {
                      updateData.option_a = corrected.options?.a || corrected.option_a || null;
                      updateData.option_b = corrected.options?.b || corrected.option_b || null;
                      updateData.option_c = corrected.options?.c || corrected.option_c || null;
                      updateData.option_d = corrected.options?.d || corrected.option_d || null;
                   } else if (updateData.question_type === "true_false") {
                      updateData.option_a = "True";
                      updateData.option_b = "False";
                      updateData.option_c = null;
                      updateData.option_d = null;
                   } else { // open ended
                      updateData.option_a = null;
                      updateData.option_b = null;
                      updateData.option_c = null;
                      updateData.option_d = null;
                   }

                   // Map correct answer
                   let rawAnswer = String(corrected.correct_answer || corrected.correct_option || "a").trim().toLowerCase();
                   
                   // Text fallback map
                   if (updateData.question_type === "multiple_choice") {
                      if (rawAnswer === String(updateData.option_a).trim().toLowerCase()) rawAnswer = "a";
                      else if (rawAnswer === String(updateData.option_b).trim().toLowerCase()) rawAnswer = "b";
                      else if (rawAnswer === String(updateData.option_c).trim().toLowerCase()) rawAnswer = "c";
                      else if (rawAnswer === String(updateData.option_d).trim().toLowerCase()) rawAnswer = "d";
                   } else if (updateData.question_type === "true_false") {
                      if (rawAnswer === "true") rawAnswer = "true";
                      else if (rawAnswer === "false") rawAnswer = "false";
                      else rawAnswer = "true";
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
            heading: `Corrected ${processedCount} of ${allQuestions.length}...`,
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
