import React, { useState, useEffect } from "react";
import styles from "../../admin.module.css";
import { UserState, QuestionData, getNextQuestion, processAnswer } from "@/lib/mers";

export default function MersPerformanceTest() {
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [testActive, setTestActive] = useState(false);
  const [userState, setUserState] = useState<UserState>({});
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [currentExpected, setCurrentExpected] = useState<number>(0);
  const [currentTargetKc, setCurrentTargetKc] = useState<string>("");
  const [logs, setLogs] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<{isCorrect: boolean, correctAnswer: string, explanation: string} | null>(null);

  useEffect(() => {
    if (testActive && questions.length > 0 && !currentQuestion) {
      nextQuestion();
    }
  }, [testActive, questions, currentQuestion]);

  const startTest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/elo-calibration");
      if (!res.ok) throw new Error("Failed to fetch questions");
      const data = await res.json();
      const validQuestions = (data.questions || []).filter((q: QuestionData) => q.elo_beta !== null && q.elo_beta !== undefined);
      setQuestions(validQuestions);
      setUserState({});
      setLogs([]);
      setCurrentQuestion(null);
      setTestActive(true);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const nextQuestion = () => {
    const next = getNextQuestion(userState, questions);
    if (next && next.question) {
      setCurrentQuestion(next.question);
      setCurrentExpected(next.expected);
      setCurrentTargetKc(next.targetKc);
    } else {
      setTestActive(false); // No more questions
    }
  };

  const handleAnswer = (isCorrect: boolean, chosenOption: string) => {
    if (!currentQuestion) return;

    const { newState, log } = processAnswer(userState, currentQuestion, isCorrect);
    setUserState(newState);

    if (log) {
      setLogs(prev => [{
        id: Date.now(),
        qId: currentQuestion.id.substring(0, 8),
        kc: log.kc,
        expected: log.expected,
        actual: log.actual,
        delta: log.delta,
        newTheta: log.newTheta,
        isCorrect
      }, ...prev]);
    }

    const correctFull = currentQuestion.correct_option?.toUpperCase();
    
    setFeedback({
      isCorrect,
      correctAnswer: correctFull || "Unknown",
      explanation: currentQuestion.answer_explanation || currentQuestion.hint || "No explanation available."
    });
  };

  const handleNext = () => {
    if (!currentQuestion) return;
    setQuestions(prev => prev.filter(q => q.id !== currentQuestion.id));
    setCurrentQuestion(null);
    setFeedback(null);
  };

  const allKCs = Array.from(new Set(questions.map(q => q.associated_kc_id).filter(Boolean)));
  // Merge with KCs from state in case questions are empty
  const knownKCs = Array.from(new Set([...allKCs, ...Object.keys(userState)])).sort();

  return (
    <div className={styles.mersCard} style={{ marginTop: "1rem" }}>
      <h3 className={styles.mersCardTitle}>🎯 Live Performance Test (MERS Adaptive Logic)</h3>
      
      {!testActive ? (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ marginBottom: "1rem", color: "var(--text-muted)" }}>
            Test the adaptive learning engine. Your ability (θ) starts at 0 for all Knowledge Components (KCs).
            The algorithm will try to serve you questions that give you a ~70% expected success rate, balancing across KCs.
          </p>
          <button 
            className="btn btn-primary btn-lg" 
            onClick={startTest}
            disabled={loading}
          >
            {loading ? "Loading Questions..." : "Start Adaptive Test"}
          </button>
          {error && <p style={{ color: "#ef4444", marginTop: "1rem" }}>{error}</p>}
        </div>
      ) : (
        <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start" }}>
          {/* Main Play Area */}
          <div style={{ flex: 2 }}>
            {currentQuestion ? (
              <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  <span>🎯 Target KC: <strong>{currentTargetKc}</strong></span>
                  <span>E(X) = <strong>{(currentExpected * 100).toFixed(1)}%</strong></span>
                  <span>β = <strong>{currentQuestion.elo_beta}</strong></span>
                </div>
                
                <h4 style={{ fontSize: "1.1rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
                  {currentQuestion.question_text}
                </h4>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {feedback ? (
                    <div style={{ padding: "1.5rem", borderRadius: "8px", background: feedback.isCorrect ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)", border: `1px solid ${feedback.isCorrect ? "#22c55e" : "#ef4444"}` }}>
                      <h4 style={{ color: feedback.isCorrect ? "#22c55e" : "#ef4444", marginBottom: "1rem" }}>
                        {feedback.isCorrect ? "✅ Correct!" : "❌ Incorrect"}
                      </h4>
                      {!feedback.isCorrect && (
                        <p style={{ marginBottom: "1rem" }}>
                          <strong>Correct Answer:</strong> Option {feedback.correctAnswer}
                        </p>
                      )}
                      <div style={{ padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "4px", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1.5rem" }}>
                        <strong>Explanation:</strong><br/>
                        {feedback.explanation}
                      </div>
                      <button className="btn btn-primary" onClick={handleNext} style={{ width: "100%", justifyContent: "center" }}>
                        Next Question ➔
                      </button>
                    </div>
                  ) : (
                    currentQuestion.question_type === "true_false" ? (
                      <>
                        <button 
                          className="btn btn-secondary" 
                          style={{ textAlign: "left", justifyContent: "flex-start", padding: "1rem" }}
                          onClick={() => handleAnswer(currentQuestion.correct_option?.toLowerCase() === "a", "A")}
                        >
                          A) {currentQuestion.option_a || "True"}
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          style={{ textAlign: "left", justifyContent: "flex-start", padding: "1rem" }}
                          onClick={() => handleAnswer(currentQuestion.correct_option?.toLowerCase() === "b", "B")}
                        >
                          B) {currentQuestion.option_b || "False"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          className="btn btn-secondary" 
                          style={{ textAlign: "left", justifyContent: "flex-start", padding: "1rem" }}
                          onClick={() => handleAnswer(currentQuestion.correct_option?.toLowerCase() === "a", "A")}
                        >
                          A) {currentQuestion.option_a}
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          style={{ textAlign: "left", justifyContent: "flex-start", padding: "1rem" }}
                          onClick={() => handleAnswer(currentQuestion.correct_option?.toLowerCase() === "b", "B")}
                        >
                          B) {currentQuestion.option_b}
                        </button>
                        {currentQuestion.option_c && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ textAlign: "left", justifyContent: "flex-start", padding: "1rem" }}
                            onClick={() => handleAnswer(currentQuestion.correct_option?.toLowerCase() === "c", "C")}
                          >
                            C) {currentQuestion.option_c}
                          </button>
                        )}
                        {currentQuestion.option_d && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ textAlign: "left", justifyContent: "flex-start", padding: "1rem" }}
                            onClick={() => handleAnswer(currentQuestion.correct_option?.toLowerCase() === "d", "D")}
                          >
                            D) {currentQuestion.option_d}
                          </button>
                        )}
                      </>
                    )
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                Loading next question...
              </div>
            )}
            
            {/* Action Log */}
            <div style={{ marginTop: "2rem" }}>
              <h4 style={{ marginBottom: "1rem" }}>📝 Update Log</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "200px", overflowY: "auto" }}>
                {logs.length === 0 && <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No answers yet.</span>}
                {logs.map(log => (
                  <div key={log.id} style={{ fontSize: "0.85rem", padding: "0.75rem", background: "var(--bg-default)", borderRadius: "4px", borderLeft: `3px solid ${log.isCorrect ? "#22c55e" : "#ef4444"}` }}>
                    <span style={{ fontWeight: 600, color: "var(--text-strong)", marginRight: "0.5rem" }}>
                      {log.isCorrect ? "✅ Correct" : "❌ Incorrect"}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>
                      (Q: {log.qId} in {log.kc}) — Expected: {(log.expected * 100).toFixed(1)}% → Δθ = {log.delta > 0 ? "+" : ""}{log.delta.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* User State Sidebar */}
          <div style={{ flex: 1, background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "1.5rem" }}>
            <h4 style={{ marginBottom: "1rem" }}>🧠 User Knowledge State</h4>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {knownKCs.map(kc => {
                const state = userState[kc] || { theta: 0, n: 0 };
                return (
                  <div key={kc} style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "0.75rem" }}>
                    <div style={{ fontWeight: 500, fontSize: "0.9rem", marginBottom: "0.25rem", color: "var(--text-strong)" }}>
                      {kc || "Unknown"}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      <span>θ: <strong style={{ color: state.theta > 0 ? "#22c55e" : state.theta < 0 ? "#ef4444" : "var(--text-muted)" }}>{state.theta.toFixed(3)}</strong></span>
                      <span>n: <strong>{state.n}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: "2rem", padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "6px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              <h5 style={{ marginBottom: "0.75rem", color: "var(--text-strong)", fontSize: "0.85rem" }}>📐 MERS Parameters & Equations</h5>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <p><strong>Expected Probability (E):</strong><br />c + (1 - c) / (1 + 10^((β - θ) / 4))</p>
                <p><strong>Dynamic K-Factor:</strong><br />K = 1.2 / (1 + 0.15 × n)</p>
                <p><strong>Guessing (c):</strong><br />MC = 0.25 | T/F = 0.50</p>
                <p><strong>Update Rule:</strong><br />θ_new = θ_old + K × (Actual - E)</p>
              </div>
            </div>

            <div style={{ marginTop: "2rem", textAlign: "center" }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setTestActive(false)}
                style={{ width: "100%", justifyContent: "center" }}
              >
                End Test
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
