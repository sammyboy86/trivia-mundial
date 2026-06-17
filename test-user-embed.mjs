import { GoogleGenAI } from "@google/genai";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf-8");
const key = env.split("\n").find(line => line.startsWith("GEMINI_API_KEY=")).split("=")[1];
const ai = new GoogleGenAI({ apiKey: key });

async function main() {
    const texts = [
        "What is the meaning of life?",
        "What is the purpose of existence?",
        "How do I bake a cake?",
    ];

    try {
      const response = await ai.models.embedContent({
          model: 'text-embedding-004',
          contents: texts,
          config: { taskType: 'SEMANTIC_SIMILARITY' },
      });

      console.log(response);
    } catch (e) {
      console.log("ERROR:");
      console.log(e);
    }
}

main();
