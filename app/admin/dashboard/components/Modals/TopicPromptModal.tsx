import React, { useState } from "react";
import styles from "../../../admin.module.css";

interface TopicPromptModalProps {
  onClose: () => void;
  onComplete: () => void;
}

const DEFAULT_PROMPT = `You are an expert curriculum designer. Your task is to assign a single, highly relevant topic (e.g., "History", "Science", "Geography", "Pop Culture", etc.) to each trivia question.
You are free to come up with your own topics based purely on the KCs and question text. Keep topics concise (1-3 words).`;

export default function TopicPromptModal({ onClose, onComplete }: TopicPromptModalProps) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [processing, setProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [results, setResults] = useState<{ updatedCount: number; total: number } | null>(null);

  async function startGenerating() {
    setProcessing(true);
    setIsComplete(false);
    setErrorMsg("");

    try {
      const res = await fetch("/api/admin/questions/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customPrompt: prompt }),
      });

      if (res.status === 401) {
        window.location.href = "/admin";
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Generation failed");
        setProcessing(false);
        return;
      }

      setResults({ updatedCount: data.updatedCount, total: data.total });
      setIsComplete(true);
    } catch {
      setErrorMsg("Connection error");
    }

    setProcessing(false);
  }

  return (
    <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && !processing && onClose()}>
      <div className={styles.modalCard} style={{ maxWidth: 600 }}>
        <h2 className={styles.modalTitle}>🏷️ Auto-Generate Topics</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1rem", fontSize: "0.95rem" }}>
          Gemini will automatically categorize all questions by assigning a topic based on their content and KCs.
        </p>

        <div className="form-group">
          <label htmlFor="topic-prompt" className="form-label">
            LLM Prompt Instruction
          </label>
          <textarea
            id="topic-prompt"
            className="form-input"
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={processing || isComplete}
          />
        </div>

        {errorMsg && (
          <div style={{ color: "var(--accent-red)", marginBottom: "1rem", fontSize: "0.9rem" }}>
            {errorMsg}
          </div>
        )}

        {processing && (
          <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-blue)', borderRadius: 'var(--radius-md)', textAlign: 'center', marginBottom: '1.5rem', border: '1px solid var(--accent-blue)' }}>
            Generating and saving topics... This may take a moment.
          </div>
        )}

        {isComplete && results && (
          <div style={{ padding: '1rem', background: 'rgba(52, 211, 153, 0.1)', color: 'var(--accent-emerald)', borderRadius: 'var(--radius-md)', textAlign: 'center', marginBottom: '1.5rem', border: '1px solid var(--accent-emerald)' }}>
            🎉 Topics generated! Updated {results.updatedCount} out of {results.total} questions.
          </div>
        )}

        <div className={styles.modalActions}>
          <button
            className="btn btn-secondary"
            onClick={() => {
              if (isComplete) onComplete();
              onClose();
            }}
            disabled={processing}
          >
            {isComplete ? "Close" : "Cancel"}
          </button>
          {!isComplete && (
            <button
              className="btn btn-primary"
              onClick={startGenerating}
              disabled={processing || !prompt.trim()}
            >
              {processing ? "Generating..." : "Start Auto-Generation"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
