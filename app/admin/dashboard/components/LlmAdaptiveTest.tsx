import React, { useState } from "react";
import styles from "../../admin.module.css";
import { QuestionData } from "@/lib/mers";

export default function LlmAdaptiveTest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [testActive, setTestActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [debugInfo, setDebugInfo] = useState<{ prompt: string, rawResponse: string } | null>(null);
  
  const [feedback, setFeedback] = useState<{isCorrect: boolean, correctAnswer: string, explanation: string} | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  const fetchNextQuestion = async (sid: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/quiz/next-adaptive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid })
      });
      if (!res.ok) throw new Error("Failed to fetch next question");
      const data = await res.json();
      
      if (!data.question) {
        setTestActive(false); // No more questions
        setLoading(false);
        return;
      }

      setCurrentQuestion(data.question);
      if (data.debug) {
        setDebugInfo(data.debug);
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const startTest = async () => {
    setLoading(true);
    setError(null);
    try {
      // Create session
      const res = await fetch("/api/quiz/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testGroup: "llm-test" })
      });
      if (!res.ok) throw new Error("Failed to create session");
      const data = await res.json();
      const sid = data.sessionId;
      
      setSessionId(sid);
      setLogs([]);
      setCurrentQuestion(null);
      setDebugInfo(null);
      setTestActive(true);
      
      await fetchNextQuestion(sid);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleAnswer = async (isCorrect: boolean, chosenOption: string) => {
    if (!currentQuestion || !sessionId) return;
    
    // Optimistically show feedback
    const correctFull = currentQuestion.correct_option?.toUpperCase();
    setFeedback({
      isCorrect,
      correctAnswer: correctFull || "Unknown",
      explanation: currentQuestion.answer_explanation || currentQuestion.hint || "No explanation available."
    });

    setLogs(prev => [{
      id: Date.now(),
      qId: currentQuestion.id.substring(0, 8),
      isCorrect,
      chosenOption
    }, ...prev]);

    // Send tracking asynchronously
    try {
      await fetch("/api/quiz/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          questionId: currentQuestion.id,
          questionText: currentQuestion.question_text,
          questionType: currentQuestion.question_type,
          userAnswer: chosenOption,
          isCorrect,
          usedHint: false,
          timeTakenSeconds: 5,
          isCompleted: false,
          score: isCorrect ? 10 : 0,
          totalQuestions: logs.length + 1
        })
      });
    } catch (e) {
      console.error("Failed to track answer:", e);
    }
  };

  const handleNext = () => {
    if (sessionId) fetchNextQuestion(sessionId);
  };

  return (
    <div className={styles.mersCard} style={{ marginTop: "1rem" }}>
      <h3 className={styles.mersCardTitle}>🧠 LLM Adaptive Engine (Live Prompt Test)</h3>
      
      {!testActive ? (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ marginBottom: "1rem", color: "var(--text-muted)" }}>
            Test the live <strong>Gemini Adaptive Engine</strong> (via <code>api/quiz/next-adaptive</code>).
            This mimics the actual app behavior: it tracks your session history, builds a prompt, and asks the LLM to select the most appropriate next question based on your Knowledge State.
          </p>
          <button 
            className="btn btn-primary btn-lg" 
            onClick={startTest}
            disabled={loading}
          >
            {loading ? "Initializing..." : "Start LLM Test"}
          </button>
          {error && <p style={{ color: "#ef4444", marginTop: "1rem" }}>{error}</p>}
        </div>
      ) : (
        <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start" }}>
          {/* Main Play Area */}
          <div style={{ flex: 1, minWidth: "400px" }}>
            {loading ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", background: "var(--card-bg)", borderRadius: "8px" }}>
                <span className="spinner" style={{ display: "inline-block", marginRight: "10px" }}>⏳</span>
                Gemini is deciding your next question...
              </div>
            ) : currentQuestion ? (
              <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  <span>🎯 KC: <strong>{currentQuestion.associated_kc_id}</strong></span>
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
                No questions returned.
              </div>
            )}
            
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

          {/* Debug Sidebar */}
          <div style={{ flex: 1, minWidth: "500px", background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "1.5rem", overflowY: "auto", maxHeight: "80vh" }}>
            <h4 style={{ marginBottom: "1rem", color: "var(--text-strong)" }}>🤖 Gemini Debug Inspector</h4>
            
            {debugInfo ? (
              <>
                <div style={{ marginBottom: "1.5rem" }}>
                  <h5 style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>RAW LLM RESPONSE</h5>
                  <pre style={{ 
                    background: "rgba(0,0,0,0.3)", 
                    padding: "1rem", 
                    borderRadius: "4px", 
                    fontSize: "0.8rem", 
                    color: "#22c55e",
                    whiteSpace: "pre-wrap",
                    borderLeft: "3px solid #22c55e"
                  }}>
                    {debugInfo.rawResponse}
                  </pre>
                </div>
                
                <div>
                  <h5 style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>PROMPT SENT TO LLM</h5>
                  <pre style={{ 
                    background: "var(--bg-default)", 
                    padding: "1rem", 
                    borderRadius: "4px", 
                    fontSize: "0.75rem", 
                    color: "var(--text-strong)",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.5,
                    border: "1px solid var(--border-color)"
                  }}>
                    {debugInfo.prompt}
                  </pre>
                </div>
              </>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontStyle: "italic" }}>
                Waiting for LLM interaction...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
