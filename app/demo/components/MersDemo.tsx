"use client";

import React, { useState, useEffect } from "react";
import { UserState, QuestionData, getNextQuestion, processAnswer, expectedProbability, guessingParam, kFactor } from "@/lib/mers";
import styles from "../demo.module.css";

export default function MersDemo() {
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
  const [questionCount, setQuestionCount] = useState(0);

  useEffect(() => {
    if (testActive && questions.length > 0 && !currentQuestion) {
      nextQuestion();
    }
  }, [testActive, questions, currentQuestion]);

  const startTest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/questions");
      if (!res.ok) throw new Error("No se pudieron cargar las preguntas");
      const data = await res.json();
      const validQuestions = (data.questions || []).filter((q: QuestionData) => q.elo_beta !== null && q.elo_beta !== undefined);
      if (validQuestions.length === 0) throw new Error("No hay preguntas calibradas disponibles");
      setQuestions(validQuestions);
      setUserState({});
      setLogs([]);
      setCurrentQuestion(null);
      setQuestionCount(0);
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
      setTestActive(false);
    }
  };

  const handleAnswer = (isCorrect: boolean, chosenOption: string) => {
    if (!currentQuestion) return;

    const { newState, log } = processAnswer(userState, currentQuestion, isCorrect);
    setUserState(newState);
    setQuestionCount(prev => prev + 1);

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
      correctAnswer: correctFull || "Desconocida",
      explanation: currentQuestion.answer_explanation || currentQuestion.hint || "Sin explicación disponible."
    });
  };

  const handleNext = () => {
    if (!currentQuestion) return;
    setQuestions(prev => prev.filter(q => q.id !== currentQuestion.id));
    setCurrentQuestion(null);
    setFeedback(null);
  };

  const allKCs = Array.from(new Set(questions.map(q => q.associated_kc_id).filter(Boolean)));
  const knownKCs = Array.from(new Set([...allKCs, ...Object.keys(userState)])).sort();

  return (
    <div className={styles.demoSection}>
      {!testActive ? (
        <div className={styles.demoIntro}>
          <div className={styles.algorithmExplainer}>
            <h4 className={styles.explainerTitle}>¿Qué es MERS?</h4>
            <p className={styles.explainerText}>
              <strong>MERS</strong> (Multidimensional Elo Rating System) es un algoritmo inspirado en el sistema Elo del ajedrez. 
              Funciona así:
            </p>
            <div className={styles.explainerSteps}>
              <div className={styles.explainerStep}>
                <span className={styles.stepNumber}>1</span>
                <div>
                  <strong>Mide tu habilidad</strong>
                  <p>El sistema mantiene un puntaje de habilidad (θ) para cada tema (KC). Empieza en 0 y sube si respondes bien, baja si no.</p>
                </div>
              </div>
              <div className={styles.explainerStep}>
                <span className={styles.stepNumber}>2</span>
                <div>
                  <strong>Calcula la probabilidad esperada</strong>
                  <p>Usando tu habilidad (θ) y la dificultad de la pregunta (β), calcula qué tan probable es que respondas correctamente.</p>
                </div>
              </div>
              <div className={styles.explainerStep}>
                <span className={styles.stepNumber}>3</span>
                <div>
                  <strong>Elige la pregunta ideal</strong>
                  <p>Busca una pregunta donde tengas ~70% de probabilidad de acertar: ni muy fácil ni muy difícil. Además, rota entre temas para cubrir todo.</p>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.formulaBox}>
            <h5 className={styles.formulaTitle}>📐 Fórmulas del MERS</h5>
            <div className={styles.formulaGrid}>
              <div className={styles.formulaItem}>
                <span className={styles.formulaLabel}>Probabilidad esperada:</span>
                <code className={styles.formulaCode}>E(X) = c + (1 - c) / (1 + 10^((β - θ) / 4))</code>
              </div>
              <div className={styles.formulaItem}>
                <span className={styles.formulaLabel}>Factor K (cuánto cambia θ):</span>
                <code className={styles.formulaCode}>K = 1.2 / (1 + 0.15 × n)</code>
              </div>
              <div className={styles.formulaItem}>
                <span className={styles.formulaLabel}>Actualización:</span>
                <code className={styles.formulaCode}>θ_nuevo = θ_anterior + K × (Resultado - E(X))</code>
              </div>
              <div className={styles.formulaItem}>
                <span className={styles.formulaLabel}>Parámetro de azar (c):</span>
                <code className={styles.formulaCode}>Opción múltiple = 0.25 | V/F = 0.50</code>
              </div>
            </div>
          </div>

          <button 
            className="btn btn-primary btn-lg" 
            onClick={startTest}
            disabled={loading}
            style={{ marginTop: "1.5rem" }}
          >
            {loading ? "Cargando preguntas..." : "🎯 Probar MERS en vivo"}
          </button>
          {error && <p className={styles.errorText}>{error}</p>}
        </div>
      ) : (
        <div className={styles.demoPlayArea}>
          {/* Main Play Area */}
          <div className={styles.demoMainColumn}>
            {currentQuestion ? (
              <div className={styles.questionCard}>
                <div className={styles.questionMeta}>
                  <span className={styles.metaItem}>
                    🎯 Tema: <strong>{currentTargetKc}</strong>
                  </span>
                  <span className={styles.metaItem}>
                    Prob. esperada: <strong className={currentExpected > 0.65 ? styles.metaGood : styles.metaHard}>{(currentExpected * 100).toFixed(1)}%</strong>
                  </span>
                  <span className={styles.metaItem}>
                    Dificultad (β): <strong>{currentQuestion.elo_beta}</strong>
                  </span>
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

                      {/* Show the update that just happened */}
                      {logs.length > 0 && (
                        <div className={styles.updateHighlight}>
                          <span className={styles.updateLabel}>Actualización MERS:</span>
                          <span>
                            Δθ = {logs[0].delta > 0 ? "+" : ""}{logs[0].delta.toFixed(3)} → 
                            θ nuevo = {logs[0].newTheta.toFixed(3)}
                          </span>
                        </div>
                      )}

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
                Cargando siguiente pregunta...
              </div>
            )}
            
            {/* Log */}
            {logs.length > 0 && (
              <div className={styles.logSection}>
                <h4 className={styles.logTitle}>📝 Historial de Actualizaciones ({questionCount} preguntas)</h4>
                <div className={styles.logList}>
                  {logs.map(log => (
                    <div key={log.id} className={`${styles.logEntry} ${log.isCorrect ? styles.logCorrect : styles.logWrong}`}>
                      <span className={styles.logIcon}>
                        {log.isCorrect ? "✅" : "❌"}
                      </span>
                      <span className={styles.logDetails}>
                        Tema: {log.kc} — E(X): {(log.expected * 100).toFixed(1)}% → Δθ = {log.delta > 0 ? "+" : ""}{log.delta.toFixed(3)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className={styles.demoSidebar}>
            <div className={styles.sidebarCard}>
              <h4 className={styles.sidebarTitle}>🧠 Tu Estado de Conocimiento</h4>
              <p className={styles.sidebarHint}>
                Cada tema tiene un puntaje θ (habilidad). Empieza en 0 y cambia según tus respuestas.
              </p>
              
              <div className={styles.kcList}>
                {knownKCs.map(kc => {
                  const state = userState[kc] || { theta: 0, n: 0 };
                  const thetaColor = state.theta > 0.3 ? "var(--accent-emerald)" : state.theta < -0.3 ? "var(--accent-red)" : "var(--text-muted)";
                  return (
                    <div key={kc} className={styles.kcItem}>
                      <div className={styles.kcName}>{kc || "Sin tema"}</div>
                      <div className={styles.kcStats}>
                        <span>
                          θ: <strong style={{ color: thetaColor }}>{state.theta.toFixed(3)}</strong>
                        </span>
                        <span>
                          Preguntas: <strong>{state.n}</strong>
                        </span>
                      </div>
                      {/* Visual bar */}
                      <div className={styles.thetaBar}>
                        <div className={styles.thetaBarCenter}></div>
                        <div 
                          className={styles.thetaBarFill}
                          style={{ 
                            width: `${Math.min(Math.abs(state.theta) * 30, 50)}%`,
                            [state.theta >= 0 ? 'left' : 'right']: '50%',
                            background: state.theta >= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)'
                          }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button 
              className="btn btn-secondary" 
              onClick={() => setTestActive(false)}
              style={{ width: "100%", justifyContent: "center", marginTop: "1rem" }}
            >
              Terminar Demo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
