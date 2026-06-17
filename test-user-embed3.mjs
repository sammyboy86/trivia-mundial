import { GoogleGenAI } from "@google/genai";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf-8");
const key = env.split("\n").find(line => line.startsWith("GEMINI_API_KEY=")).split("=")[1];
const ai = new GoogleGenAI({ apiKey: key });

async function main() {
    const response = await ai.models.list();
    for await (const model of response) {
      if (model.name.includes("embed")) {
        console.log(model.name, model.supportedGenerationMethods);
      }
    }
}
main();
