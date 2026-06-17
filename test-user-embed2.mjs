import { GoogleGenAI } from "@google/genai";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf-8");
const key = env.split("\n").find(line => line.startsWith("GEMINI_API_KEY=")).split("=")[1];
const ai = new GoogleGenAI({ apiKey: key });

async function main() {
    try {
      const response = await ai.models.embedContent({
          model: 'text-embedding-004',
          contents: ["What is the meaning of life?"],
      });
      console.log(response);
    } catch (e) {
      console.log("ERROR 004:");
      console.log(e.message);
    }

    try {
      const response = await ai.models.embedContent({
          model: 'text-embedding-001',
          contents: ["What is the meaning of life?"],
      });
      console.log("SUCCESS 001", response.embeddings.length);
    } catch (e) {
      console.log("ERROR 001:");
      console.log(e.message);
    }
}

main();
