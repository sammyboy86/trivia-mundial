import React, { useState, useRef, useEffect } from "react";
import styles from "../../../admin.module.css";
import { ResultFile } from "../../types";

const DEFAULT_POST_PROMPT = `Convert the "results" JSON array into a valid JSON array of Question Objects.`;
const DEFAULT_RECURSIVE_PROMPT = `Further refine the JSON output. Provide additional analysis or formatting. Keep the output as valid JSON.`;

interface PostProcessModalProps {
  mode: "initial" | "recursive";
  selectedResults: Set<string>;
  resultFiles: ResultFile[];
  onClose: () => void;
  onComplete: () => void;
}

export default function PostProcessModal({
  mode,
  selectedResults,
  resultFiles,
  onClose,
  onComplete,
}: PostProcessModalProps) {
  const [postPrompt, setPostPrompt] = useState("");
  const [recursivePrompt, setRecursivePrompt] = useState("");
  const [postCustomName, setPostCustomName] = useState("");
  const [postProcessing, setPostProcessing] = useState(false);
  const [postProgress, setPostProgress] = useState({
    current: 0,
    total: 0,
    heading: "",
    status: "",
  });
  const [postResultsArr, setPostResultsArr] = useState<object[]>([]);
  const [postComplete, setPostComplete] = useState(false);
  const [postError, setPostError] = useState("");
  const postLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedPost = localStorage.getItem("adminPostPrompt");
    if (savedPost) setPostPrompt(savedPost);
    else setPostPrompt(DEFAULT_POST_PROMPT);

    const savedRecursive = localStorage.getItem("adminRecursivePrompt");
    if (savedRecursive) setRecursivePrompt(savedRecursive);
    else setRecursivePrompt(DEFAULT_RECURSIVE_PROMPT);
  }, []);

  async function startPostProcessing() {
    setPostProcessing(true);
    setPostResultsArr([]);
    setPostComplete(false);
    setPostError("");
    setPostProgress({ current: 0, total: 0, heading: "", status: "" });

    try {
      const res = await fetch("/api/admin/post-process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: Array.from(selectedResults),
          prompt: mode === "initial" ? postPrompt : recursivePrompt,
          customName: postCustomName,
        }),
      });

      if (res.status === 401) {
        window.location.href = "/admin";
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setPostError(data.error || "Post-processing failed");
        setPostProcessing(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setPostError("No response stream");
        setPostProcessing(false);
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
                  setPostProgress(data);
                  break;
                case "chunk":
                  setPostResultsArr((prev) => [...prev, data.result]);
                  setTimeout(() => {
                    postLogRef.current?.scrollTo({
                      top: postLogRef.current.scrollHeight,
                      behavior: "smooth",
                    });
                  }, 50);
                  break;
                case "complete":
                  setPostComplete(true);
                  onComplete();
                  break;
                case "error":
                  setPostError(data.message);
                  break;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch {
      setPostError("Connection error");
    }

    setPostProcessing(false);
  }

  function downloadPostResults() {
    const blob = new Blob([JSON.stringify(postResultsArr, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `post-results-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const postProgressPct =
    postProgress.total > 0
      ? Math.round((postProgress.current / postProgress.total) * 100)
      : 0;

  return (
    <div
      className={styles.modalOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget && !postProcessing) onClose();
      }}
    >
      <div className={`${styles.modalCard} ${styles.processModal}`}>
        <h2 className={styles.modalTitle}>✨ Post-Process Results</h2>

        {!postProcessing && !postComplete && (
          <div className={styles.modalForm}>
            <div className={styles.processSection}>
              <label className="form-label">
                Selected Extraction Files ({selectedResults.size})
              </label>
              <div className={styles.processFileList}>
                {Array.from(selectedResults).map((f) => {
                  const rf = resultFiles.find((m) => m.storageName === f);
                  return (
                    <div key={f} className={styles.processFileItem}>
                      📊 {rf?.customName || f}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="post-custom-name" className="form-label">
                Post-Process Result Name
              </label>
              <input
                id="post-custom-name"
                type="text"
                className="form-input"
                value={postCustomName}
                onChange={(e) => setPostCustomName(e.target.value)}
                placeholder="e.g. Translated JSON Results"
              />
            </div>

            <div className="form-group">
              <label htmlFor="post-process-prompt" className="form-label">
                Post-Processing Prompt
              </label>
              <textarea
                id="post-process-prompt"
                className="form-input"
                rows={8}
                value={mode === "initial" ? postPrompt : recursivePrompt}
                onChange={(e) => {
                  if (mode === "initial") {
                    setPostPrompt(e.target.value);
                    localStorage.setItem("adminPostPrompt", e.target.value);
                  } else {
                    setRecursivePrompt(e.target.value);
                    localStorage.setItem("adminRecursivePrompt", e.target.value);
                  }
                }}
                maxLength={10000}
                placeholder="Write your post-processing prompt..."
              />
              <p className={styles.uploadHint}>
                This prompt will be sent with each individual JSON object from
                the selected results. Ensure you instruct it to return valid
                JSON.
              </p>
            </div>

            {postError && (
              <div className={styles.loginError} role="alert">
                {postError}
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
                onClick={startPostProcessing}
                disabled={!(mode === "initial" ? postPrompt : recursivePrompt).trim()}
                id="start-post-process-btn"
              >
                🚀 Start Post-Processing
              </button>
            </div>
          </div>
        )}

        {/* Processing In Progress */}
        {postProcessing && (
          <div className={styles.processProgress}>
            <div className={styles.progressInfo}>
              <span className={styles.progressLabel}>
                Processing chunk {postProgress.current} of {postProgress.total}
              </span>
              <span className={styles.progressPct}>{postProgressPct}%</span>
            </div>
            <div className={styles.progressBarLarge}>
              <div
                className={styles.progressFillLarge}
                style={{ width: `${postProgressPct}%` }}
              />
            </div>
            {postProgress.heading && (
              <p className={styles.progressHeading}>
                📝 {postProgress.heading}
              </p>
            )}
            <div className={styles.processLog} ref={postLogRef}>
              {postResultsArr.length === 0 && (
                <div className={styles.logPlaceholder}>
                  Waiting for first response...
                </div>
              )}
              {postResultsArr.map((res, idx) => (
                <div key={idx} className={styles.logItem}>
                  <div className={styles.logItemHeader}>
                    Processed Item {idx + 1}
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
        {postComplete && !postProcessing && (
          <div className={styles.processComplete}>
            <div className={styles.completeIcon}>✅</div>
            <h3 className={styles.completeTitle}>Post-Processing Complete</h3>
            <p className={styles.completeSubtitle}>
              {postResultsArr.length} results extracted from{" "}
              {postProgress.total} chunks
            </p>

            <div className={styles.processLog} ref={postLogRef}>
              <pre className={styles.codeBlock}>
                {JSON.stringify(postResultsArr, null, 2)}
              </pre>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={downloadPostResults}
              >
                📥 Download JSON
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
