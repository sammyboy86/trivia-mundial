import React, { useState } from "react";
import styles from "../../../admin.module.css";

interface AiCorrectModalProps {
  onClose: () => void;
  onComplete: () => void;
}

const DEFAULT_PROMPT = `Analyze the following questions. Based on their 'question_text' and 'question_type' (multiple_choice, true_false, open_ended), correct the 'options' and 'correct_answer' fields. If the options are mixed up, logically assign them. If it's true_false, ensure options are only True/False. Keep the exact JSON structure and the '_t_id'. Return only the corrected array of JSON objects.`;

export default function AiCorrectModal({ onClose, onComplete }: AiCorrectModalProps) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, heading: "", status: "" });
  const [isComplete, setIsComplete] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function startCorrection() {
    if (!prompt.trim()) {
      setErrorMsg("Please enter a prompt.");
      return;
    }

    setProcessing(true);
    setIsComplete(false);
    setErrorMsg("");
    setProgress({ current: 0, total: 0, heading: "", status: "" });

    try {
      const res = await fetch("/api/admin/questions/ai-correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (res.status === 401) {
        window.location.href = "/admin";
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setErrorMsg(data.error || "Correction failed");
        setProcessing(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setErrorMsg("No response stream");
        setProcessing(false);
        return;
      }

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
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              switch (eventType) {
                case "progress":
                  setProgress(data);
                  break;
                case "done":
                  setIsComplete(true);
                  break;
                case "error":
                  setErrorMsg(data.message);
                  break;
              }
            } catch {
              // Ignore parse errors on stream data
            }
          }
        }
      }
    } catch {
      setErrorMsg("Connection error");
    }

    setProcessing(false);
  }

  const progressPct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && !processing && onClose()}>
      <div className={styles.modalCard} style={{ maxWidth: 600 }}>
        <h2 className={styles.modalTitle}>🤖 AI Correct Answers</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
          Provide a prompt to instruct Gemini on how to correct the options and answers of <strong>ALL</strong> existing questions. 
          Gemini will analyze each question and rewrite its answers/options logic.
        </p>

        <div className="form-group">
          <label className="form-label">Correction Prompt</label>
          <textarea
            className="form-input"
            rows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={processing || isComplete}
            placeholder="Prompt logic here..."
          />
        </div>

        {errorMsg && (
          <div style={{ color: "var(--accent-red)", marginBottom: "1rem", fontSize: "0.9rem" }}>
            {errorMsg}
          </div>
        )}

        {processing && (
          <div className={styles.processProgress}>
            <div className={styles.processProgressHeader}>
              <span>{progress.heading || "Starting..."}</span>
              <span>{progressPct}%</span>
            </div>
            <div className={styles.processProgressBar}>
              <div
                className={styles.processProgressFill}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {progress.total > 0 && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Processed {progress.current} of {progress.total} questions
              </p>
            )}
          </div>
        )}

        {isComplete && (
          <div style={{ padding: '1rem', background: 'rgba(52, 211, 153, 0.1)', color: 'var(--accent-emerald)', borderRadius: 'var(--radius-md)', textAlign: 'center', marginBottom: '1.5rem', border: '1px solid var(--accent-emerald)' }}>
            🎉 All questions corrected successfully!
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
              onClick={startCorrection}
              disabled={processing || !prompt.trim()}
            >
              {processing ? "Correcting..." : "Start Correction All"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
