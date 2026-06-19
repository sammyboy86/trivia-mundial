import { useState, useRef, useEffect } from "react";
import styles from "../../admin.module.css";

interface KcGeneratorTabProps {
  showToast: (msg: string, type: "success" | "error") => void;
}

const DEFAULT_PROMPT = `Analyze the provided questions and generate a comprehensive list of Knowledge Components (KCs). KCs are the specific concepts, facts, or skills required to answer the questions correctly.

Output your results as a simple JSON array of strings, representing the unique Knowledge Components identified in this batch.

Example JSON output structure:
[
  "World Geography",
  "Capital Cities",
  "Europe",
  "History",
  "World War II",
  "Key Dates"
]`;

const DEFAULT_ASSIGN_PROMPT = `Analyze each question and assign the most relevant Knowledge Components (KCs) from the provided list. 
Assign between 1 to 3 KCs per question. Ensure high precision.`;

export default function KcGeneratorTab({ showToast }: KcGeneratorTabProps) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, heading: "" });
  const [generatedKcs, setGeneratedKcs] = useState<any[]>([]);
  
  // Phase 2 State
  const [assignPrompt, setAssignPrompt] = useState(DEFAULT_ASSIGN_PROMPT);
  const [kcsJson, setKcsJson] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignProgress, setAssignProgress] = useState({ current: 0, total: 0, heading: "" });

  const eventSourceRef = useRef<EventSource | null>(null);

  // Auto-fill KCs JSON when Phase 1 completes
  useEffect(() => {
    if (generatedKcs.length > 0) {
      setKcsJson(JSON.stringify(generatedKcs, null, 2));
    }
  }, [generatedKcs]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleStartGeneration = async () => {
    if (!prompt.trim()) {
      showToast("Prompt cannot be empty", "error");
      return;
    }

    setIsRunning(true);
    setProgress({ current: 0, total: 0, heading: "Starting generation process..." });
    setGeneratedKcs([]);

    try {
      const res = await fetch("/api/admin/kc-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.statusText}`);
      }

      // Read SSE stream manually since EventSource only supports GET
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            const parts = line.split("\ndata: ");
            if (parts.length === 2) {
              const eventType = parts[0].replace("event: ", "").trim();
              const eventData = JSON.parse(parts[1].trim());

              if (eventType === "progress") {
                setProgress({
                  current: eventData.current,
                  total: eventData.total,
                  heading: eventData.heading,
                });
              } else if (eventType === "done") {
                setIsRunning(false);
                setProgress((p) => ({ ...p, heading: "Finished successfully!" }));
                if (eventData.kcs && eventData.kcs.length > 0) {
                  setGeneratedKcs(eventData.kcs);
                  downloadJson(eventData.kcs);
                  showToast("Generation complete and file downloaded!", "success");
                } else {
                  showToast("Generation complete but no KCs were returned.", "error");
                }
                return;
              } else if (eventType === "error") {
                showToast(eventData.message || "An error occurred", "error");
              }
            }
          }
        }
      }
    } catch (err: any) {
      setIsRunning(false);
      showToast(err.message || "Failed to start generation", "error");
    }
  };

  const handleStartAssignment = async () => {
    if (!assignPrompt.trim()) {
      showToast("Assign prompt cannot be empty", "error");
      return;
    }
    if (!kcsJson.trim()) {
      showToast("KCs JSON cannot be empty", "error");
      return;
    }

    setIsAssigning(true);
    setAssignProgress({ current: 0, total: 0, heading: "Starting assignment process..." });

    try {
      const res = await fetch("/api/admin/kc-generator/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: assignPrompt, kcsJson }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.statusText}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response body");

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            const parts = line.split("\ndata: ");
            if (parts.length === 2) {
              const eventType = parts[0].replace("event: ", "").trim();
              const eventData = JSON.parse(parts[1].trim());

              if (eventType === "progress") {
                setAssignProgress({
                  current: eventData.current,
                  total: eventData.total,
                  heading: eventData.heading,
                });
              } else if (eventType === "done") {
                setIsAssigning(false);
                setAssignProgress((p) => ({ ...p, heading: "Assignment finished successfully!" }));
                showToast("KC Assignment complete!", "success");
                return;
              } else if (eventType === "error") {
                showToast(eventData.message || "An error occurred", "error");
              }
            }
          }
        }
      }
    } catch (err: any) {
      setIsAssigning(false);
      showToast(err.message || "Failed to start assignment", "error");
    }
  };

  const downloadJson = (data: any[]) => {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `generated_kcs_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const percentGen = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const percentAssign = assignProgress.total > 0 ? Math.round((assignProgress.current / assignProgress.total) * 100) : 0;

  return (
    <div className={styles.tabContent}>
      <div className={styles.tabHeader}>
        <h2>🧠 KC Generator</h2>
        <p className={styles.tabSubtitle}>
          Send all questions to Gemini to generate Knowledge Components (KCs). Results will be grouped and downloaded as a JSON file.
        </p>
      </div>

      <div className={styles.adminCard}>
        <div className="form-group">
          <label className="form-label">Gemini Prompt</label>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
            This prompt will be sent with batches of 10 questions. Ensure it explicitly asks for a JSON array of strings.
          </p>
          <textarea
            className="form-input"
            rows={10}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isRunning}
            style={{ fontFamily: "monospace", resize: "vertical" }}
          />
        </div>

        {isRunning && (
          <div className={styles.progressSection} style={{ marginTop: "2rem", marginBottom: "1.5rem" }}>
            <div className={styles.progressHeading}>{progress.heading}</div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${percentGen}%`, transition: "width 0.3s ease" }}
              ></div>
            </div>
            <div className={styles.progressStats}>
              {percentGen}% • {progress.current} / {progress.total} questions processed
            </div>
          </div>
        )}

        <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem", alignItems: "center" }}>
          <button
            className="btn btn-primary"
            onClick={handleStartGeneration}
            disabled={isRunning}
          >
            {isRunning ? "Generating..." : "🚀 Start KC Generation"}
          </button>
          
          {generatedKcs.length > 0 && !isRunning && (
            <button
              className="btn btn-secondary"
              onClick={() => downloadJson(generatedKcs)}
            >
              📥 Download Previous JSON
            </button>
          )}
        </div>
      </div>

      <div className={styles.adminCard} style={{ marginTop: "2rem" }}>
        <h3>Phase 2: Assign KCs to Questions</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
          Provide the JSON list of Knowledge Components (auto-filled from Phase 1), and Gemini will assign them to the questions in small batches for high precision.
        </p>

        <div className="form-group">
          <label className="form-label">KCs JSON List</label>
          <textarea
            className="form-input"
            rows={6}
            value={kcsJson}
            onChange={(e) => setKcsJson(e.target.value)}
            disabled={isAssigning}
            style={{ fontFamily: "monospace", resize: "vertical" }}
            placeholder='e.g., ["Geography", "History"]'
          />
        </div>

        <div className="form-group">
          <label className="form-label">Assign Prompt</label>
          <textarea
            className="form-input"
            rows={4}
            value={assignPrompt}
            onChange={(e) => setAssignPrompt(e.target.value)}
            disabled={isAssigning}
            style={{ fontFamily: "monospace", resize: "vertical" }}
          />
        </div>

        {isAssigning && (
          <div className={styles.progressSection} style={{ marginTop: "2rem", marginBottom: "1.5rem" }}>
            <div className={styles.progressHeading}>{assignProgress.heading}</div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${percentAssign}%`, transition: "width 0.3s ease", background: "var(--accent-blue)" }}
              ></div>
            </div>
            <div className={styles.progressStats}>
              {percentAssign}% • {assignProgress.current} / {assignProgress.total} questions processed
            </div>
          </div>
        )}

        <div style={{ marginTop: "1.5rem" }}>
          <button
            className="btn btn-primary"
            onClick={handleStartAssignment}
            disabled={isAssigning}
          >
            {isAssigning ? "Assigning..." : "🎯 Start KC Assignment"}
          </button>
        </div>
      </div>
    </div>
  );
}
