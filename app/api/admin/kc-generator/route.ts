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

// Utility to shuffle an array in-place
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
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
          .select("id, question_text, question_type, option_a, option_b, option_c, option_d");

        if (fetchError || !allQuestions) {
          throw new Error("Failed to fetch questions from database.");
        }

        if (allQuestions.length === 0) {
           sendEvent("done", { success: true, kcs: [] });
           controller.close();
           return;
        }

        // Randomize questions as requested
        const randomizedQuestions = shuffleArray(allQuestions);

        const ai = new GoogleGenAI({ apiKey });

        const chunkSize = 10;
        const totalChunks = Math.ceil(randomizedQuestions.length / chunkSize);
        let processedCount = 0;
        
        const allGeneratedKCs: any[] = [];

        for (let i = 0; i < totalChunks; i++) {
          const chunk = randomizedQuestions.slice(i * chunkSize, (i + 1) * chunkSize);
          
          sendEvent("progress", {
            current: processedCount,
            total: randomizedQuestions.length,
            heading: `Generating KCs: Chunk ${i + 1} of ${totalChunks}...`,
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

          const fullPrompt = `${prompt}\n\nCRITICAL: You must return ONLY a flat JSON array of strings (the KCs). Do not return an array of objects. Do not include question IDs.\n\nHere is the JSON array of questions to process:\n\n${JSON.stringify(chunkToProcess, null, 2)}`;

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
                   if (Array.isArray((parsed as any).kcs)) {
                      parsedArray = (parsed as any).kcs;
                   } else if (Array.isArray((parsed as any).results)) {
                      parsedArray = (parsed as any).results;
                   } else {
                      parsedArray = [parsed];
                   }
                }
             } else {
                parsedArray = parsed;
             }

             // Accumulate results
             allGeneratedKCs.push(...parsedArray);
          }

          processedCount += chunk.length;
          
          sendEvent("progress", {
            current: processedCount,
            total: randomizedQuestions.length,
            heading: `Processed ${processedCount} of ${randomizedQuestions.length}...`,
            status: "processing",
          });
        }

        const uniqueKcs = Array.from(new Set(allGeneratedKCs));
        sendEvent("done", { success: true, kcs: uniqueKcs });
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
