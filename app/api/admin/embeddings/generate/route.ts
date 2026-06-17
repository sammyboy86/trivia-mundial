import { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/session";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { GoogleGenAI } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

  const { questions } = body;

  if (!Array.isArray(questions) || questions.length === 0) {
    return new Response(JSON.stringify({ error: "Questions array is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ai = new GoogleGenAI({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const chunkSize = 20; // 20 items per batch to avoid limits
        let processed = 0;

        for (let i = 0; i < questions.length; i += chunkSize) {
          const chunk = questions.slice(i, i + chunkSize);
          const contentsToEmbed = chunk.map(q => q.question_text || "");

          try {
            // Call Gemini Embeddings API individually for each string
            const embedPromises = contentsToEmbed.map(text => 
              ai.models.embedContent({
                model: "gemini-embedding-2",
                contents: text,
                config: {
                  taskType: "SEMANTIC_SIMILARITY",
                }
              })
            );

            const responses = await Promise.all(embedPromises);

            // Update database for each question
            for (let j = 0; j < chunk.length; j++) {
              const q = chunk[j];
              const embedding = responses[j]?.embeddings?.[0]?.values;

              if (embedding) {
                // Ensure existing metadata is preserved
                const currentMetadata = q.metadata || {};
                const newMetadata = { ...currentMetadata, embedding };

                const { error: dbError } = await supabaseAdmin
                  .from("questions")
                  .update({ metadata: newMetadata })
                  .eq("id", q.id);

                if (dbError) {
                  throw new Error(`DB Error: ${dbError.message || JSON.stringify(dbError)}`);
                }
              }
            }
          } catch (chunkErr: any) {
            console.error(`Error processing chunk at index ${i}:`, chunkErr);
            sendEvent("error", { message: `Chunk error: ${chunkErr.message || String(chunkErr)}` });
            // Let it continue or break? Let's continue for now.
          }

          processed += chunk.length;
          sendEvent("progress", { current: processed, total: questions.length });
        }

        sendEvent("complete", { success: true, processed });
      } catch (err: any) {
        console.error("Embedding generation stream error:", err);
        sendEvent("error", { message: err.message || "An error occurred during embedding generation" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
