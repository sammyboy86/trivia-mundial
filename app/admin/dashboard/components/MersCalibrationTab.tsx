import React, { useState, useEffect, useRef, useCallback } from "react";
import styles from "../../admin.module.css";
import MersPerformanceTest from "./MersPerformanceTest";
import LlmAdaptiveTest from "./LlmAdaptiveTest";

interface MersCalibrationTabProps {
  showToast: (msg: string, type: "success" | "error") => void;
}

interface SimParams {
  numAgents: number;
  kInitial: number;
  kDecay: number;
  temperature: number;
  concurrency: number;
  persona1Prompt: string;
  persona2Prompt: string;
}

interface LiveStats {
  betaMean: number;
  betaStd: number;
  betaMin: number;
  betaMax: number;
}

interface AgentLog {
  agent: number;
  persona: string;
  theta: number;
  correct: number;
  total: number;
  correctRate: number;
}

interface PersonaSummary {
  name: string;
  theta: number;
  count: number;
  avgCorrectRate: number;
}

interface QuestionResult {
  id: string;
  question_text: string;
  question_type: string;
  beta: number;
  responseCount: number;
}

interface CalibrationResult {
  stats: LiveStats;
  distribution: Record<string, number>;
  questions: QuestionResult[];
  agents: AgentLog[];
  personaSummary: PersonaSummary[];
  params: SimParams & { totalAgents: number };
  runId: string;
}

interface ProgressData {
  phase: string;
  message: string;
  agent: number;
  totalAgents: number;
  persona?: string;
  agentTheta?: number;
  question: number;
  totalQuestions: number;
  correctRate?: number;
  stats?: LiveStats;
}

const DEFAULT_PARAMS: SimParams = {
  numAgents: 100,
  kInitial: 0.8,
  kDecay: 0.05,
  temperature: 1.0,
  concurrency: 5,
  persona1Prompt: "You are a casual spectator who only watches football during the World Cup every four years. You know the very basic rules (goals, no hands), but you do not understand the offside rule, VAR protocols, or tournament tie-breakers. Answer the following question using common sense. If you are confused, take a random guess.",
  persona2Prompt: "You are a casual football fan who watches weekend league matches. You understand the flow of the game well, but you easily get confused by specific rule exceptions, strict VAR protocols, or FIFA World Cup group stage tie-breakers. Answer the following question.",
};

function getDifficultyTier(beta: number): { label: string; cssClass: string } {
  if (beta < -1.5) return { label: "Very Easy", cssClass: "mersTierVeryEasy" };
  if (beta < -0.5) return { label: "Easy", cssClass: "mersTierEasy" };
  if (beta <= 0.5) return { label: "Medium", cssClass: "mersTierMedium" };
  if (beta <= 1.5) return { label: "Hard", cssClass: "mersTierHard" };
  return { label: "Very Hard", cssClass: "mersTierVeryHard" };
}

export default function MersCalibrationTab({ showToast }: MersCalibrationTabProps) {
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [showEquations, setShowEquations] = useState(true);
  const [showPersonas, setShowPersonas] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [sortField, setSortField] = useState<"beta" | "question_text">("beta");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const logRef = useRef<HTMLDivElement>(null);
  const [activeSubTab, setActiveSubTab] = useState<"calibration" | "performance" | "llm-test">("calibration");

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const handleParamChange = useCallback((field: keyof SimParams, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setParams((p) => ({ ...p, [field]: num }));
    }
  }, []);

  const handleTextParamChange = useCallback((field: keyof SimParams, value: string) => {
    setParams((p) => ({ ...p, [field]: value }));
  }, []);

  const handleRunCalibration = async () => {
    setIsRunning(true);
    setProgress(null);
    setLogs([]);
    setResult(null);
    setShowResults(false);

    try {
      const res = await fetch("/api/admin/elo-calibration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `HTTP ${res.status}`);
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
              let eventData;
              try {
                eventData = JSON.parse(parts[1].trim());
              } catch {
                continue;
              }

              if (eventType === "progress") {
                setProgress(eventData as ProgressData);
                if (eventData.message) {
                  setLogs((prev) => [...prev.slice(-300), eventData.message]);
                }
              } else if (eventType === "done") {
                setIsRunning(false);
                setResult(eventData as CalibrationResult);
                setShowResults(true);
                showToast("Calibration complete! β values saved to database.", "success");
              } else if (eventType === "error") {
                setIsRunning(false);
                showToast(eventData.message || "Calibration failed", "error");
                setLogs((prev) => [...prev, `❌ ERROR: ${eventData.message}`]);
              }
            }
          }
        }
      }
    } catch (err: unknown) {
      setIsRunning(false);
      const message = err instanceof Error ? err.message : "Failed to start calibration";
      showToast(message, "error");
    }
  };

  const handleExportJson = () => {
    if (!result) return;
    const exportData = {
      calibratedAt: new Date().toISOString(),
      params: result.params,
      stats: result.stats,
      personaSummary: result.personaSummary,
      questions: result.questions,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mers_calibration_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const agentPct = progress && progress.totalAgents > 0
    ? Math.round((progress.agent / progress.totalAgents) * 100)
    : 0;

  const questionPct = progress && progress.totalQuestions > 0
    ? Math.round((progress.question / progress.totalQuestions) * 100)
    : 0;

  const sortedQuestions = result?.questions
    ? [...result.questions].sort((a, b) => {
        const mul = sortDir === "asc" ? 1 : -1;
        if (sortField === "beta") return mul * (a.beta - b.beta);
        return mul * a.question_text.localeCompare(b.question_text);
      })
    : [];

  return (
    <div className={styles.tabContent}>
      {/* Header */}
      <div className={styles.mersHeader}>
        <div className={styles.mersHeaderLeft}>
          <h2 className={styles.mersTitle}>⚡ MERS Adaptive Engine</h2>
          <p className={styles.mersSubtitle}>
            Calibrate item difficulty via LLM simulation, then test the live adaptive learning algorithms.
          </p>
        </div>
      </div>
      
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem" }}>
        <button 
          className={`btn ${activeSubTab === "calibration" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveSubTab("calibration")}
        >
          🧪 Calibration (Offline)
        </button>
        <button 
          className={`btn ${activeSubTab === "performance" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveSubTab("performance")}
        >
          🎮 Test Offline Adaptive (Math)
        </button>
        <button 
          className={`btn ${activeSubTab === "llm-test" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveSubTab("llm-test")}
        >
          🧠 Test LLM Adaptive (Live Prompting)
        </button>
      </div>

      {activeSubTab === "performance" && <MersPerformanceTest />}
      {activeSubTab === "llm-test" && <LlmAdaptiveTest />}

      {activeSubTab === "calibration" && (
        <>
      {/* ──── Cognitive Personas ──── */}
      <div className={styles.mersCard}>
        <button
          className={styles.mersCardToggle}
          onClick={() => setShowPersonas(!showPersonas)}
          type="button"
        >
          <span className={styles.mersCardToggleIcon}>{showPersonas ? "▼" : "▶"}</span>
          <span className={styles.mersCardToggleLabel}>🎭 Cognitive Personas (LLM Agents)</span>
        </button>

        {showPersonas && (
          <div className={styles.mersEquationsGrid} style={{ marginTop: "1rem" }}>
            {/* Persona 1 */}
            <div className={styles.mersEquationBox} style={{ borderLeftColor: "rgba(248, 113, 113, 0.4)", borderLeftWidth: "3px" }}>
              <div className={styles.mersEquationLabel}>Persona 1 — The Casual Observer</div>
              <div className={styles.mersEquationFormula} style={{ fontSize: "0.85rem", textAlign: "left" }}>
                θ<sub>true</sub> = −1.5 &nbsp;·&nbsp; {Math.floor(params.numAgents / 2)} agents
              </div>
              <div className={styles.mersEquationDesc} style={{ lineHeight: 1.6 }}>
                <textarea
                  className="form-input"
                  style={{ width: "100%", height: "120px", resize: "vertical", fontSize: "0.85rem", fontStyle: "italic", marginTop: "0.5rem" }}
                  value={params.persona1Prompt}
                  onChange={(e) => handleTextParamChange("persona1Prompt", e.target.value)}
                  disabled={isRunning}
                />
              </div>
            </div>

            {/* Persona 2 */}
            <div className={styles.mersEquationBox} style={{ borderLeftColor: "rgba(96, 165, 250, 0.4)", borderLeftWidth: "3px" }}>
              <div className={styles.mersEquationLabel}>Persona 2 — The Casual Fan</div>
              <div className={styles.mersEquationFormula} style={{ fontSize: "0.85rem", textAlign: "left" }}>
                θ<sub>true</sub> = 0.0 &nbsp;·&nbsp; {Math.ceil(params.numAgents / 2)} agents
              </div>
              <div className={styles.mersEquationDesc} style={{ lineHeight: 1.6 }}>
                <textarea
                  className="form-input"
                  style={{ width: "100%", height: "120px", resize: "vertical", fontSize: "0.85rem", fontStyle: "italic", marginTop: "0.5rem" }}
                  value={params.persona2Prompt}
                  onChange={(e) => handleTextParamChange("persona2Prompt", e.target.value)}
                  disabled={isRunning}
                />
              </div>
            </div>

            {/* Evaluation Flow */}
            <div className={`${styles.mersEquationBox} ${styles.mersParamLegend}`}>
              <div className={styles.mersEquationLabel}>Content-Aware Evaluation Flow</div>
              <div className={styles.mersParamGrid}>
                <div className={styles.mersParamItem}>
                  <span className={styles.mersParamSymbol} style={{ minWidth: "30px" }}>MC</span>
                  <span className={styles.mersParamName}>
                    LLM reads question + 4 options → replies A/B/C/D → compared to correct answer (c<sub>j</sub> = 0.25)
                  </span>
                </div>
                <div className={styles.mersParamItem}>
                  <span className={styles.mersParamSymbol} style={{ minWidth: "30px" }}>T/F</span>
                  <span className={styles.mersParamName}>
                    LLM reads statement → replies A/B → compared to correct answer (c<sub>j</sub> = 0.50)
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ──── Theory & Equations ──── */}
      <div className={styles.mersCard}>
        <button
          className={styles.mersCardToggle}
          onClick={() => setShowEquations(!showEquations)}
          type="button"
        >
          <span className={styles.mersCardToggleIcon}>{showEquations ? "▼" : "▶"}</span>
          <span className={styles.mersCardToggleLabel}>📐 MERS Equations & Parameters</span>
        </button>

        {showEquations && (
          <div className={styles.mersEquationsGrid}>
            {/* Expected Score with guessing */}
            <div className={styles.mersEquationBox}>
              <div className={styles.mersEquationLabel}>Expected Score (with Guessing Parameter)</div>
              <div className={styles.mersEquationFormula}>
                E(X<sub>ij</sub>) = c<sub>j</sub> + (1 − c<sub>j</sub>) · <span style={{ fontSize: "0.9em" }}>1 / (1 + 10<sup>(β<sub>j</sub> − θ<sub>i</sub>) / 4</sup>)</span>
              </div>
              <div className={styles.mersEquationDesc}>
                Probability of correct answer accounting for guessing chance. Uses base-10 Elo scale with spread factor 4.
                <br />
                <strong>c<sub>j</sub></strong>: 0.25 (MC), 0.50 (T/F)
              </div>
            </div>

            {/* β Update Rule */}
            <div className={styles.mersEquationBox}>
              <div className={styles.mersEquationLabel}>β Update Rule</div>
              <div className={styles.mersEquationFormula}>
                β<sub>j</sub><sup>(t)</sup> = β<sub>j</sub><sup>(t−1)</sup> + K<sub>β</sub>(n<sub>j</sub>) · (E(X<sub>ij</sub>) − X<sub>ij</sub>)
              </div>
              <div className={styles.mersEquationDesc}>
                After each LLM response, β adjusts toward the &quot;surprise&quot; direction.
                If the persona got it wrong unexpectedly (E(X) was high but X=0), β increases (harder).
              </div>
            </div>

            {/* Decaying K-factor */}
            <div className={styles.mersEquationBox}>
              <div className={styles.mersEquationLabel}>Decaying K-Factor</div>
              <div className={styles.mersEquationFormula}>
                K<sub>β</sub>(n<sub>j</sub>) = {params.kInitial} / (1 + {params.kDecay} · n<sub>j</sub>)
              </div>
              <div className={styles.mersEquationDesc}>
                Learning rate shrinks as more responses accumulate. With {params.numAgents} agents, n<sub>j</sub> reaches {params.numAgents} and K converges toward near zero.
              </div>
            </div>

            {/* Parameter Legend */}
            <div className={`${styles.mersEquationBox} ${styles.mersParamLegend}`}>
              <div className={styles.mersEquationLabel}>Parameter Legend</div>
              <div className={styles.mersParamGrid}>
                <div className={styles.mersParamItem}>
                  <span className={styles.mersParamSymbol}>θ<sub>i</sub></span>
                  <span className={styles.mersParamName}>Fixed ability of the persona (−1.5 or 0.0)</span>
                </div>
                <div className={styles.mersParamItem}>
                  <span className={styles.mersParamSymbol}>β<sub>j</sub></span>
                  <span className={styles.mersParamName}>Estimated question difficulty (calibrated)</span>
                </div>
                <div className={styles.mersParamItem}>
                  <span className={styles.mersParamSymbol}>c<sub>j</sub></span>
                  <span className={styles.mersParamName}>Guessing parameter (0.25 MC, 0.50 TF)</span>
                </div>
                <div className={styles.mersParamItem}>
                  <span className={styles.mersParamSymbol}>K<sub>β</sub></span>
                  <span className={styles.mersParamName}>Decaying learning rate for question j</span>
                </div>
                <div className={styles.mersParamItem}>
                  <span className={styles.mersParamSymbol}>n<sub>j</sub></span>
                  <span className={styles.mersParamName}>Total responses collected for question j</span>
                </div>
                <div className={styles.mersParamItem}>
                  <span className={styles.mersParamSymbol}>X<sub>ij</sub></span>
                  <span className={styles.mersParamName}>LLM outcome (1 = correct, 0 = incorrect)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ──── Simulation Controls ──── */}
      <div className={styles.mersCard}>
        <h3 className={styles.mersCardTitle}>🎛️ Simulation Parameters</h3>
        <div className={styles.mersControlsGrid}>
          <div className="form-group">
            <label className="form-label">Number of Agents</label>
            <input
              type="number"
              className="form-input"
              value={params.numAgents}
              onChange={(e) => handleParamChange("numAgents", e.target.value)}
              min={2}
              max={500}
              step={2}
              disabled={isRunning}
            />
            <span className={styles.mersInputHint}>Total simulated users</span>
          </div>
          <div className="form-group">
            <label className="form-label">K Initial</label>
            <input
              type="number"
              className="form-input"
              value={params.kInitial}
              onChange={(e) => handleParamChange("kInitial", e.target.value)}
              min={0.01}
              max={5}
              step={0.05}
              disabled={isRunning}
            />
            <span className={styles.mersInputHint}>Starting learning rate (0.8 default)</span>
          </div>
          <div className="form-group">
            <label className="form-label">K Decay Rate</label>
            <input
              type="number"
              className="form-input"
              value={params.kDecay}
              onChange={(e) => handleParamChange("kDecay", e.target.value)}
              min={0}
              max={1}
              step={0.01}
              disabled={isRunning}
            />
            <span className={styles.mersInputHint}>How fast K shrinks per response</span>
          </div>
          <div className="form-group">
            <label className="form-label">LLM Temperature</label>
            <input
              type="number"
              className="form-input"
              value={params.temperature}
              onChange={(e) => handleParamChange("temperature", e.target.value)}
              min={0}
              max={2}
              step={0.1}
              disabled={isRunning}
            />
            <span className={styles.mersInputHint}>Higher = more answer variance across agents</span>
          </div>
          <div className="form-group">
            <label className="form-label">API Concurrency</label>
            <input
              type="number"
              className="form-input"
              value={params.concurrency}
              onChange={(e) => handleParamChange("concurrency", e.target.value)}
              min={1}
              max={15}
              step={1}
              disabled={isRunning}
            />
            <span className={styles.mersInputHint}>Parallel Gemini calls per batch</span>
          </div>
        </div>

        {/* Pool summary */}
        <div className={styles.mersPoolSummary}>
          <span>🤖 <strong>{params.numAgents} agents</strong> total</span>
          <span className={styles.mersPoolDivider}>·</span>
          <span style={{ color: "#f87171" }}>{Math.floor(params.numAgents / 2)}× Casual Observer (θ=−1.5)</span>
          <span className={styles.mersPoolDivider}>·</span>
          <span style={{ color: "#60a5fa" }}>{Math.ceil(params.numAgents / 2)}× Casual Fan (θ=0.0)</span>
          <span className={styles.mersPoolDivider}>·</span>
          <span>~{Math.round((params.numAgents * 143) / 100) * 100} Gemini API calls</span>
        </div>

        <div className={styles.mersLaunchRow}>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleRunCalibration}
            disabled={isRunning}
            id="mers-run-btn"
          >
            {isRunning ? "⏳ Simulating with Gemini..." : "🚀 Run Content-Aware Calibration"}
          </button>
          {result && !isRunning && (
            <button className="btn btn-secondary" onClick={handleExportJson}>
              📥 Export β Values (JSON)
            </button>
          )}
        </div>
      </div>

      {/* ──── Live Training Dashboard ──── */}
      {(isRunning || result) && (
        <div className={styles.mersCard}>
          <h3 className={styles.mersCardTitle}>📡 Training Dashboard</h3>

          {/* Agent Progress */}
          <div className={styles.mersProgressSection}>
            <div className={styles.mersProgressInfo}>
              <span className={styles.mersProgressLabel}>
                {progress?.phase === "saving"
                  ? "💾 Saving to database..."
                  : progress?.phase === "init"
                  ? "⚙️ Initializing..."
                  : `Agent ${progress?.agent || 0} of ${progress?.totalAgents || 100} ${progress?.persona ? `[${progress.persona}]` : ""}`}
              </span>
              <span className={styles.mersProgressPct}>{agentPct}%</span>
            </div>
            <div className={styles.mersProgressBarTrack}>
              <div
                className={styles.mersProgressBarFill}
                style={{ width: `${agentPct}%` }}
              />
            </div>
          </div>

          {/* Question Progress (within current agent) */}
          {progress?.phase === "simulating" && (
            <div className={styles.mersProgressSection}>
              <div className={styles.mersProgressInfo}>
                <span className={styles.mersProgressLabel}>
                  Questions: {progress.question} / {progress.totalQuestions}
                </span>
                <span className={styles.mersProgressPct}>{questionPct}%</span>
              </div>
              <div className={styles.mersProgressBarTrack}>
                <div
                  className={styles.mersProgressBarFill}
                  style={{
                    width: `${questionPct}%`,
                    background: "linear-gradient(90deg, var(--accent-blue), #818cf8)",
                  }}
                />
              </div>
            </div>
          )}

          {/* Live Stats */}
          {progress?.stats && (
            <div className={styles.mersStatsGrid}>
              <div className={styles.mersStatCard}>
                <div className={styles.mersStatValue}>{progress.stats.betaMean.toFixed(3)}</div>
                <div className={styles.mersStatLabel}>Mean β</div>
              </div>
              <div className={styles.mersStatCard}>
                <div className={styles.mersStatValue}>{progress.stats.betaStd.toFixed(3)}</div>
                <div className={styles.mersStatLabel}>Std Dev β</div>
              </div>
              <div className={styles.mersStatCard}>
                <div className={styles.mersStatValue}>{progress.stats.betaMin.toFixed(3)}</div>
                <div className={styles.mersStatLabel}>Min β</div>
              </div>
              <div className={styles.mersStatCard}>
                <div className={styles.mersStatValue}>{progress.stats.betaMax.toFixed(3)}</div>
                <div className={styles.mersStatLabel}>Max β</div>
              </div>
            </div>
          )}

          {/* Log Output */}
          <div className={styles.mersLogContainer} ref={logRef}>
            <pre className={styles.mersLogPre}>
              {logs.map((l, i) => (
                <span key={i}>
                  <span className={styles.mersLogLineNum}>{String(i + 1).padStart(4, " ")}</span> {l}
                  {"\n"}
                </span>
              ))}
              {isRunning && <span className={styles.mersLogCursor}>▌</span>}
            </pre>
          </div>
        </div>
      )}

      {/* ──── Persona Results ──── */}
      {result && result.personaSummary && (
        <div className={styles.mersCard}>
          <h3 className={styles.mersCardTitle}>🎭 Persona Performance</h3>
          <div className={styles.mersStatsGrid}>
            {result.personaSummary.map((p) => (
              <div key={p.name} className={styles.mersStatCard} style={{
                borderTop: `3px solid ${p.name === "Casual Observer" ? "#f87171" : "#60a5fa"}`,
              }}>
                <div className={styles.mersStatValue}>{(p.avgCorrectRate * 100).toFixed(1)}%</div>
                <div className={styles.mersStatLabel}>{p.name}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                  θ={p.theta} · {p.count} agents
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──── β Distribution ──── */}
      {result && (
        <div className={styles.mersCard}>
          <h3 className={styles.mersCardTitle}>📊 β Distribution (Difficulty Spread)</h3>
          <div className={styles.mersDistribution}>
            {Object.entries(result.distribution).map(([bucket, count]) => {
              const maxCount = Math.max(...Object.values(result.distribution), 1);
              const barWidth = (count / maxCount) * 100;
              const tier = getDifficultyTier(parseFloat(bucket));
              return (
                <div key={bucket} className={styles.mersDistRow}>
                  <span className={styles.mersDistLabel}>{bucket}</span>
                  <div className={styles.mersDistBarTrack}>
                    <div
                      className={`${styles.mersDistBarFill} ${styles[tier.cssClass]}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className={styles.mersDistCount}>{count}</span>
                </div>
              );
            })}
          </div>

          <div className={styles.mersDistLegend}>
            <span className={`${styles.mersDistLegendItem} ${styles.mersTierVeryEasy}`}>● Very Easy (&lt;−1.5)</span>
            <span className={`${styles.mersDistLegendItem} ${styles.mersTierEasy}`}>● Easy (−1.5 to −0.5)</span>
            <span className={`${styles.mersDistLegendItem} ${styles.mersTierMedium}`}>● Medium (−0.5 to 0.5)</span>
            <span className={`${styles.mersDistLegendItem} ${styles.mersTierHard}`}>● Hard (0.5 to 1.5)</span>
            <span className={`${styles.mersDistLegendItem} ${styles.mersTierVeryHard}`}>● Very Hard (&gt;1.5)</span>
          </div>
        </div>
      )}

      {/* ──── Results Table ──── */}
      {result && (
        <div className={styles.mersCard}>
          <div className={styles.mersResultsHeader}>
            <h3 className={styles.mersCardTitle}>
              📋 Calibrated Questions ({result.questions.length})
            </h3>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowResults(!showResults)}
              type="button"
            >
              {showResults ? "Hide Table" : "Show Table"}
            </button>
          </div>

          {showResults && (
            <>
              <div className={styles.mersSortBar}>
                <button
                  className={`btn btn-sm ${sortField === "beta" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => { setSortField("beta"); setSortDir(sortDir === "asc" ? "desc" : "asc"); }}
                >
                  Sort by β {sortField === "beta" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </button>
                <button
                  className={`btn btn-sm ${sortField === "question_text" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => { setSortField("question_text"); setSortDir(sortDir === "asc" ? "desc" : "asc"); }}
                >
                  Sort by Text {sortField === "question_text" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </button>
              </div>
              <div className={styles.mersTableWrapper}>
                <table className={styles.mersTable}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Question</th>
                      <th>Type</th>
                      <th>β</th>
                      <th>Tier</th>
                      <th>n<sub>j</sub></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedQuestions.map((q, i) => {
                      const tier = getDifficultyTier(q.beta);
                      return (
                        <tr key={q.id}>
                          <td className={styles.mersTableNum}>{i + 1}</td>
                          <td className={styles.mersTableQuestion}>{q.question_text}</td>
                          <td>
                            <span className={`${styles.countBadge} ${
                              q.question_type === "multiple_choice" ? styles.badgeMc
                              : q.question_type === "true_false" ? styles.badgeTf
                              : styles.badgeOe
                            }`}>
                              {q.question_type === "multiple_choice" ? "MC"
                                : q.question_type === "true_false" ? "T/F"
                                : "Open"}
                            </span>
                          </td>
                          <td className={styles.mersTableBeta}>
                            <span className={styles[tier.cssClass]}>{q.beta.toFixed(4)}</span>
                          </td>
                          <td>
                            <span className={`${styles.mersTierBadge} ${styles[tier.cssClass]}`}>
                              {tier.label}
                            </span>
                          </td>
                          <td className={styles.mersTableNum}>{q.responseCount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ──── Final Stats Summary ──── */}
      {result && (
        <div className={styles.mersCard}>
          <h3 className={styles.mersCardTitle}>✅ Calibration Complete — β Values Frozen</h3>
          <div className={styles.mersStatsGrid}>
            <div className={styles.mersStatCard}>
              <div className={styles.mersStatValue}>{result.stats.betaMean.toFixed(4)}</div>
              <div className={styles.mersStatLabel}>Final Mean β</div>
            </div>
            <div className={styles.mersStatCard}>
              <div className={styles.mersStatValue}>{result.stats.betaStd.toFixed(4)}</div>
              <div className={styles.mersStatLabel}>Final Std Dev β</div>
            </div>
            <div className={styles.mersStatCard}>
              <div className={styles.mersStatValue}>{result.stats.betaMin.toFixed(4)}</div>
              <div className={styles.mersStatLabel}>Easiest β</div>
            </div>
            <div className={styles.mersStatCard}>
              <div className={styles.mersStatValue}>{result.stats.betaMax.toFixed(4)}</div>
              <div className={styles.mersStatLabel}>Hardest β</div>
            </div>
          </div>
          <p className={styles.mersFinalNote}>
            🔒 β values have been frozen and saved to the <code>questions</code> table
            (<code>elo_beta</code>, <code>elo_response_count</code>, <code>elo_calibrated_at</code>).
            These weights are now ready for adaptive learning in production.
            <br /><br />
            📊 Total Gemini API calls made: ~{result.params.totalAgents * (result.questions.length || 143)}.
            Each question was answered by {result.params.totalAgents} simulated agents across two cognitive personas.
          </p>
        </div>
      )}
      </>
      )}
    </div>
  );
}
