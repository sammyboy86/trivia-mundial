"use client";

import React, { useState } from "react";
import { QuestionData } from "@/lib/mers";
import styles from "../demo.module.css";

interface AnswerHistoryItem {
  questionId: string;
  questionText: string;
  isCorrect: boolean;
  chosenOption: string;
}

export default function LlmDemo() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [testActive, setTestActive] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [debugInfo, setDebugInfo] = useState<{ prompt: string; rawResponse: string } | null>(null);
  const [feedback, setFeedback] = useState<{isCorrect: boolean; correctAnswer: string; explanation: string} | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [answeredHistory, setAnsweredHistory] = useState<AnswerHistoryItem[]>([]);

  const fetchNextQuestion = async (history: AnswerHistoryItem[]) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/demo/next-adaptive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answeredHistory: history.map(h => ({
            questionId: h.questionId,
            questionText: h.questionText,
            isCorrect: h.isCorrect
          }))
        })
      });
      if (!res.ok) throw new Error("No se pudo obtener la siguiente pregunta");
      const data = await res.json();
      
      if (!data.question) {
        setTestActive(false);
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
    setAnsweredHistory([]);
    setLogs([]);
    setCurrentQuestion(null);
    setDebugInfo(null);
    setTestActive(true);
    
    await fetchNextQuestion([]);
  };

  const handleAnswer = (isCorrect: boolean, chosenOption: string) => {
    if (!currentQuestion) return;
    
    const correctFull = currentQuestion.correct_option?.toUpperCase();
    setFeedback({
      isCorrect,
      correctAnswer: correctFull || "Desconocida",
      explanation: currentQuestion.answer_explanation || currentQuestion.hint || "Sin explicación disponible."
    });

    const newHistoryItem: AnswerHistoryItem = {
      questionId: currentQuestion.id,
      questionText: currentQuestion.question_text || "",
      isCorrect,
      chosenOption
    };

    setAnsweredHistory(prev => [...prev, newHistoryItem]);

    setLogs(prev => [{
      id: Date.now(),
      qId: currentQuestion.id.substring(0, 8),
      kc: currentQuestion.associated_kc_id,
      isCorrect,
      chosenOption
    }, ...prev]);
  };

  const handleNext = () => {
    const newHistory = [...answeredHistory];
    fetchNextQuestion(newHistory);
  };

  // Try to parse LLM motive from raw response
  let llmMotive = "";
  if (debugInfo?.rawResponse) {
    try {
      const parsed = JSON.parse(debugInfo.rawResponse);
      llmMotive = parsed.motive || "";
    } catch { /* ignore */ }
  }

  return (
    <div className={styles.demoSection}>
      {!testActive ? (
        <div className={styles.demoIntro}>
          <div className={styles.algorithmExplainer}>
            <h4 className={styles.explainerTitle}>¿Qué es el Motor Adaptativo LLM?</h4>
            <p className={styles.explainerText}>
              Este algoritmo usa un <strong>modelo de lenguaje grande (LLM)</strong> — específicamente 
              <strong> Google Gemini</strong> — para decidir qué pregunta mostrarte.
              En lugar de usar fórmulas matemáticas fijas, le &quot;explica&quot; al LLM tu historial y le pide que elija la mejor pregunta siguiente.
            </p>
            <div className={styles.explainerSteps}>
              <div className={styles.explainerStep}>
                <span className={styles.stepNumber}>1</span>
                <div>
                  <strong>Recopila tu historial</strong>
                  <p>Cada respuesta que das (correcta o incorrecta) se agrega a tu historial de conocimiento.</p>
                </div>
              </div>
              <div className={styles.explainerStep}>
                <span className={styles.stepNumber}>2</span>
                <div>
                  <strong>Construye un prompt</strong>
                  <p>El sistema arma una instrucción detallada con tu historial y la lista de preguntas disponibles, y se la envía al LLM.</p>
                </div>
              </div>
              <div className={styles.explainerStep}>
                <span className={styles.stepNumber}>3</span>
                <div>
                  <strong>El LLM decide</strong>
                  <p>Gemini analiza tu patrón de aciertos/errores por tema y selecciona la pregunta que considera más adecuada para ti en ese momento, explicando su razonamiento.</p>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.formulaBox}>
            <h5 className={styles.formulaTitle}>🤖 ¿Por qué usar un LLM para esto?</h5>
            <div className={styles.comparisonGrid}>
              <div className={styles.comparisonItem}>
                <span className={styles.comparisonLabel}>MERS (matemático)</span>
                <p>Usa fórmulas fijas y predecibles. Rápido y consistente, pero rígido.</p>
              </div>
              <div className={styles.comparisonItem}>
                <span className={styles.comparisonLabel}>LLM (inteligencia artificial)</span>
                <p>Puede razonar sobre patrones complejos y contextos. Flexible pero más lento y variable.</p>
              </div>
            </div>
            <p className={styles.comparisonNote}>
              ✨ En esta tesis comparamos ambos enfoques para determinar cuál ofrece una mejor experiencia de aprendizaje adaptativo.
            </p>
          </div>

          <button 
            className="btn btn-primary btn-lg" 
            onClick={startTest}
            disabled={loading}
            style={{ marginTop: "1.5rem" }}
          >
            {loading ? "Inicializando..." : "🧠 Probar Motor LLM en vivo"}
          </button>
          {error && <p className={styles.errorText}>{error}</p>}
        </div>
      ) : (
        <div className={styles.demoPlayArea}>
          {/* Main Play Area */}
          <div className={styles.demoMainColumn}>
            {loading ? (
              <div className={styles.llmLoadingState}>
                <div className={styles.llmSpinner}></div>
                <p>Gemini está analizando tu perfil y decidiendo la siguiente pregunta...</p>
              </div>
            ) : currentQuestion ? (
              <div className={styles.questionCard}>
                <div className={styles.questionMeta}>
                  <span className={styles.metaItem}>
                    🎯 Tema: <strong>{currentQuestion.associated_kc_id}</strong>
                  </span>
                  {currentQuestion.elo_beta && (
                    <span className={styles.metaItem}>
                      β = <strong>{currentQuestion.elo_beta}</strong>
                    </span>
                  )}
                </div>
                
                <h4 className={styles.questionText}>
                  {currentQuestion.question_text}
                </h4>

                <div className={styles.optionsContainer}>
                  {feedback ? (
                    <div className={`${styles.feedbackCard} ${feedback.isCorrect ? styles.feedbackCorrect : styles.feedbackWrong}`}>
                      <h4 className={styles.feedbackTitle}>
                        {feedback.isCorrect ? "✅ ¡Correcto!" : "❌ Incorrecto"}
                      </h4>
                      {!feedback.isCorrect && (
                        <p className={styles.feedbackAnswer}>
                          <strong>Respuesta correcta:</strong> Opción {feedback.correctAnswer}
                        </p>
                      )}
                      <div className={styles.feedbackExplanation}>
                        <strong>Explicación:</strong><br/>
                        {feedback.explanation}
                      </div>
                      <button className="btn btn-primary" onClick={handleNext} style={{ width: "100%", justifyContent: "center", marginTop: "1rem" }}>
                        Siguiente Pregunta ➔
                      </button>
                    </div>
                  ) : (
                    currentQuestion.question_type === "true_false" ? (
                      <>
                        <button 
                          className={styles.optionBtn}
                          onClick={() => handleAnswer(currentQuestion.correct_option?.toLowerCase() === "a", "A")}
                        >
                          <span className={styles.optionLetter}>A</span>
                          {currentQuestion.option_a || "Verdadero"}
                        </button>
                        <button 
                          className={styles.optionBtn}
                          onClick={() => handleAnswer(currentQuestion.correct_option?.toLowerCase() === "b", "B")}
                        >
                          <span className={styles.optionLetter}>B</span>
                          {currentQuestion.option_b || "Falso"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          className={styles.optionBtn}
                          onClick={() => handleAnswer(currentQuestion.correct_option?.toLowerCase() === "a", "A")}
                        >
                          <span className={styles.optionLetter}>A</span>
                          {currentQuestion.option_a}
                        </button>
                        <button 
                          className={styles.optionBtn}
                          onClick={() => handleAnswer(currentQuestion.correct_option?.toLowerCase() === "b", "B")}
                        >
                          <span className={styles.optionLetter}>B</span>
                          {currentQuestion.option_b}
                        </button>
                        {currentQuestion.option_c && (
                          <button 
                            className={styles.optionBtn}
                            onClick={() => handleAnswer(currentQuestion.correct_option?.toLowerCase() === "c", "C")}
                          >
                            <span className={styles.optionLetter}>C</span>
                            {currentQuestion.option_c}
                          </button>
                        )}
                        {currentQuestion.option_d && (
                          <button 
                            className={styles.optionBtn}
                            onClick={() => handleAnswer(currentQuestion.correct_option?.toLowerCase() === "d", "D")}
                          >
                            <span className={styles.optionLetter}>D</span>
                            {currentQuestion.option_d}
                          </button>
                        )}
                      </>
                    )
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.loadingState}>
                No se obtuvieron preguntas.
              </div>
            )}
            
            <div style={{ marginTop: "1rem", textAlign: "center" }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setTestActive(false)}
                style={{ width: "100%", justifyContent: "center" }}
              >
                Terminar Demo
              </button>
            </div>
          </div>

          {/* Debug Sidebar */}
          <div className={styles.demoSidebar}>
            <div className={styles.sidebarCard}>
              <h4 className={styles.sidebarTitle}>🤖 Inspector de Gemini</h4>
              <p className={styles.sidebarHint}>
                Aquí puedes ver exactamente qué le envió el sistema al LLM y qué respondió.
              </p>
              
              {debugInfo ? (
                <>
                  {llmMotive && (
                    <div className={styles.motiveBox}>
                      <h5 className={styles.motiveTitle}>💭 Razonamiento del LLM</h5>
                      <p className={styles.motiveText}>{llmMotive}</p>
                    </div>
                  )}

                  <div className={styles.debugBlock}>
                    <h5 className={styles.debugLabel}>RESPUESTA DEL LLM</h5>
                    <pre className={styles.debugPre} style={{ borderLeftColor: "var(--accent-emerald)", color: "var(--accent-emerald)" }}>
                      {debugInfo.rawResponse}
                    </pre>
                  </div>
                  
                  <details className={styles.promptDetails}>
                    <summary className={styles.promptSummary}>Ver prompt enviado al LLM</summary>
                    <pre className={styles.debugPre} style={{ fontSize: "0.7rem", maxHeight: "300px" }}>
                      {debugInfo.prompt}
                    </pre>
                  </details>
                </>
              ) : (
                <p className={styles.debugWaiting}>
                  Esperando interacción con el LLM...
                </p>
              )}
            </div>

            {/* Answer History */}
            {logs.length > 0 && (
              <div className={styles.sidebarCard} style={{ marginTop: "1rem" }}>
                <h4 className={styles.sidebarTitle}>📝 Historial ({logs.length} preguntas)</h4>
                <div className={styles.logList}>
                  {logs.map(log => (
                    <div key={log.id} className={`${styles.logEntry} ${log.isCorrect ? styles.logCorrect : styles.logWrong}`}>
                      <span className={styles.logIcon}>
                        {log.isCorrect ? "✅" : "❌"}
                      </span>
                      <span className={styles.logDetails}>
                        {log.kc} — Opción {log.chosenOption}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
