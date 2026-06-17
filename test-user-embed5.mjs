import { GoogleGenAI } from "@google/genai";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf-8");
const key = env.split("\n").find(line => line.startsWith("GEMINI_API_KEY=")).split("=")[1];
const ai = new GoogleGenAI({ apiKey: key });

async function main() {
    try {
      const texts = ["Hello", "World", "Test"];
      const promises = texts.map(t => ai.models.embedContent({
          model: 'gemini-embedding-2',
          contents: t,
          config: { taskType: 'SEMANTIC_SIMILARITY' }
      }));
      const results = await Promise.all(promises);
      console.log("Success! Embedded lengths:");
      console.log(results.map(r => r.embeddings[0].values.length));
    } catch (e) {
      console.log("ERROR:");
      console.log(e.message || e);
    }
}
main();
