import React, { useState } from "react";
import styles from "../../admin.module.css";
import { Question } from "../types";

interface ThematicClusteringTabProps {
  showToast: (message: string, type: "success" | "error") => void;
}

export default function ThematicClusteringTab({ showToast }: ThematicClusteringTabProps) {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  async function handleGenerateEmbeddings() {
    if (!confirm("This will process all questions through the Gemini embeddings model. Proceed?")) {
      return;
    }

    setProcessing(true);
    setProgress({ current: 0, total: 100 });

    try {
      showToast("Fetching all questions from database...", "success");
      // Fetch all questions
      const resExport = await fetch("/api/admin/questions/export");
      if (!resExport.ok) throw new Error("Failed to fetch questions");
      const { questions } = await resExport.json();

      if (!questions || questions.length === 0) {
        showToast("No questions found.", "error");
        setProcessing(false);
        return;
      }

      setProgress({ current: 0, total: questions.length });

      // Start generation
      const res = await fetch("/api/admin/embeddings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
      });

      if (!res.ok) throw new Error("Failed to start embedding generation");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream available");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        let eventType = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) eventType = line.slice(7).trim();
          else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === "progress") setProgress(data);
              else if (eventType === "complete") {
                showToast(`Successfully generated embeddings for ${data.processed} questions!`, "success");
                setProcessing(false);
              }
              else if (eventType === "error") {
                showToast(`Error: ${data.message}`, "error");
                setProcessing(false);
              }
            } catch (err) {
              console.error("Error parsing event stream data", err);
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "An unexpected error occurred.", "error");
      setProcessing(false);
    }
  }

  return (
    <div className={styles.tabContent}>
      <h2 style={{ marginBottom: "1rem" }}>🌌 Thematic Clustering</h2>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", maxWidth: "800px" }}>
        Generate high-quality semantic embeddings for every question in your database using Gemini's{" "}
        <code style={{ background: "var(--bg-card)", padding: "0.2rem 0.4rem", borderRadius: "4px" }}>
          text-embedding-004
        </code>{" "}
        model. These embeddings capture the core semantic meaning of each question and will be saved directly into the metadata field, unlocking future capabilities like automatic topic clustering and vector search.
      </p>

      <div style={{ background: "var(--bg-card)", padding: "2rem", borderRadius: "12px", border: "1px solid var(--border)", maxWidth: "800px" }}>
        <h3 style={{ marginBottom: "1rem" }}>Embedding Generator</h3>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
          This process runs entirely in the background. It will automatically stream through all your questions, generate semantic vectors, and upsert them safely back into the database.
        </p>
        
        <button 
          className="btn btn-primary" 
          onClick={handleGenerateEmbeddings} 
          disabled={processing}
          style={{ width: "100%", padding: "1rem", fontSize: "1.1rem" }}
        >
          {processing ? "⏳ Processing Embeddings..." : "🚀 Generate Embeddings for All Questions"}
        </button>

        {processing && progress.total > 0 && (
          <div style={{ marginTop: "2rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
              <span>Progress</span>
              <span>{progress.current} / {progress.total} processed</span>
            </div>
            <div style={{ width: "100%", height: "8px", background: "var(--bg-body)", borderRadius: "4px", overflow: "hidden" }}>
              <div 
                style={{ 
                  width: `${(progress.current / progress.total) * 100}%`, 
                  height: "100%", 
                  background: "var(--accent-blue)",
                  transition: "width 0.3s ease"
                }} 
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
