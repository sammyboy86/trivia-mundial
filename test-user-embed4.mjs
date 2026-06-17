import { GoogleGenAI } from "@google/genai";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf-8");
const key = env.split("\n").find(line => line.startsWith("GEMINI_API_KEY=")).split("=")[1];
const ai = new GoogleGenAI({ apiKey: key });

async function main() {
    try {
      const response = await ai.models.embedContent({
          model: 'text-embedding-004',
          contents: "Hello world"
      });
      console.log("text-embedding-004 SUCCESS");
    } catch (e) {
      console.log("text-embedding-004 ERROR:");
      console.log(e.message);
    }
    
    try {
      const response = await ai.models.embedContent({
          model: 'gemini-embedding-2',
          contents: ["What is the meaning of life?", "second test"],
          config: { taskType: 'SEMANTIC_SIMILARITY' },
      });
      console.log("gemini-embedding-2 SUCCESS!");
      console.log(response.embeddings.length);
    } catch (e) {
      console.log("gemini-embedding-2 ERROR:");
      console.log(e);
    }
}

main();
