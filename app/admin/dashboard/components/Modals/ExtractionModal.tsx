import React, { useState, useRef, useEffect } from "react";
import styles from "../../../admin.module.css";
import { MarkdownFile } from "../../types";

interface ExtractionModalProps {
  selectedFiles: Set<string>;
  mdFiles: MarkdownFile[];
  onClose: () => void;
  onComplete: () => void; // triggers fetchResults in parent
}

const DEFAULT_PROMPT = `Extract the most important facts...`; // I need to grab the exact DEFAULT_PROMPT

export default function ExtractionModal({
  selectedFiles,
  mdFiles,
  onClose,
  onComplete,
}: ExtractionModalProps) {
  const [separator, setSeparator] = useState<"#" | "##" | "###">("##");
  const [prompt, setPrompt] = useState("");
  const [customName, setCustomName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState({
    current: 0,
    total: 0,
    heading: "",
    status: "",
  });
  const [processResults, setProcessResults] = useState<object[]>([]);
  const [processComplete, setProcessComplete] = useState(false);
  const [processError, setProcessError] = useState("");
  const processLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedExtraction = localStorage.getItem("adminExtractionPrompt");
    if (savedExtraction) {
      setPrompt(savedExtraction);
    } else {
      setPrompt(DEFAULT_PROMPT); // Will be filled with correct prompt
    }
  }, []);

  async function startProcessing() {
    setProcessing(true);
    setProcessError("");
    setProcessResults([]);
    setProcessComplete(false);
    setProcessProgress({ current: 0, total: 0, heading: "", status: "" });

    try {
      const res = await fetch("/api/admin/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: Array.from(selectedFiles),
          separator,
          prompt,
          customName,
        }),
      });

      if (res.status === 401) {
        window.location.href = "/admin";
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setProcessError(data.error || "Processing failed");
        setProcessing(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setProcessError("No response stream");
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
                  setProcessProgress(data);
                  break;
                case "chunk":
                  setProcessResults((prev) => [...prev, data.result]);
                  setTimeout(() => {
                    processLogRef.current?.scrollTo({
                      top: processLogRef.current.scrollHeight,
                      behavior: "smooth",
                    });
                  }, 50);
                  break;
                case "complete":
                  setProcessComplete(true);
                  onComplete();
                  break;
                case "error":
                  setProcessError(data.message);
                  break;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch {
      setProcessError("Connection error");
    }
    setProcessing(false);
  }

  function downloadResults() {
    const blob = new Blob([JSON.stringify(processResults, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `results-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const progressPct =
    processProgress.total > 0
      ? Math.round((processProgress.current / processProgress.total) * 100)
      : 0;

  return (
    <div
      className={styles.modalOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget && !processing) onClose();
      }}
    >
      <div className={`${styles.modalCard} ${styles.processModal}`}>
        <h2 className={styles.modalTitle}>⚙️ Process Markdown</h2>

        {!processing && !processComplete && (
          <div className={styles.modalForm}>
            <div className={styles.processSection}>
              <label className="form-label">
                Selected Files ({selectedFiles.size})
              </label>
              <div className={styles.processFileList}>
                {Array.from(selectedFiles).map((f) => {
                  const md = mdFiles.find((m) => m.storageName === f);
                  return (
                    <div key={f} className={styles.processFileItem}>
                      📄 {md?.originalName || f}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="custom-name" className="form-label">
                Result Name
              </label>
              <input
                id="custom-name"
                type="text"
                className="form-input"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. History Questions Extracted"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Chunk Separator</label>
              <div className={styles.radioGroup}>
                {(["#", "##", "###"] as const).map((s) => (
                  <label key={s} className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="separator"
                      value={s}
                      checked={separator === s}
                      onChange={() => setSeparator(s)}
                      className={styles.radio}
                    />
                    <span className={styles.radioText}>
                      {s} (H{s.length})
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="process-prompt" className="form-label">
                Extraction Prompt
              </label>
              <textarea
                id="process-prompt"
                className="form-input"
                rows={8}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  localStorage.setItem("adminExtractionPrompt", e.target.value);
                }}
                maxLength={10000}
                placeholder="Write your extraction prompt..."
              />
              <p className={styles.uploadHint}>
                Include the JSON structure you want in the prompt.
                Each chunk will be appended after your prompt.
              </p>
            </div>

            {processError && (
              <div className={styles.loginError} role="alert">
                {processError}
              </div>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={startProcessing}
                disabled={!prompt.trim()}
                id="start-processing-btn"
              >
                🚀 Start Extraction
              </button>
            </div>
          </div>
        )}

        {/* Processing In Progress */}
        {processing && (
          <div className={styles.processProgress}>
            <div className={styles.progressInfo}>
              <span className={styles.progressLabel}>
                Processing chunk {processProgress.current} of{" "}
                {processProgress.total}
              </span>
              <span className={styles.progressPct}>{progressPct}%</span>
            </div>
            <div className={styles.progressBarLarge}>
              <div
                className={styles.progressFillLarge}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {processProgress.heading && (
              <p className={styles.progressHeading}>
                {processProgress.heading}
              </p>
            )}
            <div className={styles.processLog} ref={processLogRef}>
              {processResults.length === 0 && (
                <div className={styles.logPlaceholder}>
                  Waiting for first response...
                </div>
              )}
              {processResults.map((res, idx) => (
                <div key={idx} className={styles.logItem}>
                  <div className={styles.logItemHeader}>
                    Chunk {idx + 1} Result
                  </div>
                  <pre className={styles.logItemCode}>
                    {JSON.stringify(res, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Processing Complete */}
        {processComplete && !processing && (
          <div className={styles.processSuccess}>
            <div className={styles.successIcon}>🎉</div>
            <h3 className={styles.successTitle}>Extraction Complete!</h3>
            <p className={styles.successText}>
              Successfully processed {processProgress.total} chunks and
              extracted data.
            </p>
            <div className={styles.modalActions} style={{ marginTop: "2rem" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={downloadResults}
              >
                ⬇️ Download JSON
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
              >
                Close & View Results
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
