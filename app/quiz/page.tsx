"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";
import type { Question } from "@/lib/types";
import { getQuizQuestions } from "@/lib/question-selection";
import { renderWithBold } from "@/lib/formatters";
import styles from "./quiz.module.css";

const QUIZ_SIZE = 30;
const SESSION_STORAGE_KEY = "trivia_session_data";
const QUESTIONS_PER_LEVEL = 6;
const TOTAL_LEVELS = 5;

function isAnswerCorrect(questionType: string, selected: string, correctOpt: string) {
  if (questionType === "true_false") {
    const s = String(selected).toLowerCase();
    const c = String(correctOpt).toLowerCase();
    if (s === c) return true;
    if (s === "true" && (c === "verdadero" || c === "a" || c === "1")) return true;
    if (s === "false" && (c === "falso" || c === "b" || c === "0")) return true;
    return false;
  }
  return selected === correctOpt;
}

export default function QuizPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [openEndedAnswer, setOpenEndedAnswer] = useState("");
  const [isGrading, setIsGrading] = useState(false);
  const [openEndedGradingResult, setOpenEndedGradingResult] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const [isAdaptive, setIsAdaptive] = useState(false);
  const [isFetchingNext, setIsFetchingNext] = useState(false);
  const [quizView, setQuizView] = useState<"map" | "question" | "level_complete">("map");

  const questionStartTimeRef = useRef<number>(Date.now());

  const fetchQuestions = useCallback(async (existingQuestions?: Question[], adaptiveMode: boolean = false) => {
    setLoading(true);
    let selectedQuestions = existingQuestions;
    if (!selectedQuestions || selectedQuestions.length === 0) {
      if (adaptiveMode) {
         selectedQuestions = await getQuizQuestions("random", 1);
      } else {
         selectedQuestions = await getQuizQuestions("random", QUIZ_SIZE);
      }
    }
    setQuestions(selectedQuestions);
    setLoading(false);
    return selectedQuestions;
  }, []);

  const initSession = useCallback(async () => {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.sessionId && parsed.questions && parsed.questions.length > 0) {
          setSessionId(parsed.sessionId);
          setQuestions(parsed.questions);
          setCurrentIndex(parsed.currentIndex || 0);
          setScore(parsed.score || 0);
          setIsAdaptive(parsed.isAdaptive || false);
          setQuizView("map");
          setLoading(false);
          questionStartTimeRef.current = Date.now();
          return;
        }
      }

      // Get existing AB group from localStorage to ensure consistency for returning users
      const existingGroup = localStorage.getItem("trivia_ab_group");
      const userProfileStr = localStorage.getItem("trivia_user_profile");
      const userProfile = userProfileStr ? JSON.parse(userProfileStr) : null;

      const res = await fetch("/api/quiz/session", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          testGroup: existingGroup,
          userAge: userProfile?.age,
          footballInterest: userProfile?.interest
        })
      });
      const data = await res.json();
      const newSessionId = data.sessionId;
      const assignedGroup = data.testGroup;
      
      if (!existingGroup && assignedGroup) {
        localStorage.setItem("trivia_ab_group", assignedGroup);
      }

      const isAdaptiveParam = assignedGroup === "adaptive";
      setIsAdaptive(isAdaptiveParam);
      setSessionId(newSessionId);

      const newQuestions = await fetchQuestions(undefined, isAdaptiveParam);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        sessionId: newSessionId,
        questions: newQuestions,
        currentIndex: 0,
        score: 0,
        isAdaptive: isAdaptiveParam
      }));
      setQuizView("map");
      questionStartTimeRef.current = Date.now();
    } catch (e) {
      console.error("Failed to init session", e);
      fetchQuestions();
    }
  }, [fetchQuestions]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  useEffect(() => {
    // Keep localStorage updated when state changes
    if (sessionId && questions.length > 0) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        sessionId,
        questions,
        currentIndex,
        score,
        isAdaptive
      }));
    }
  }, [sessionId, questions, currentIndex, score, isAdaptive]);

  const currentQuestion = questions[currentIndex];

  const currentShuffledKeys = useMemo(() => {
    if (!currentQuestion || currentQuestion.question_type !== "multiple_choice") return [];
    const keys = ["a", "b", "c", "d"];
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    return keys as ("a" | "b" | "c" | "d")[];
  }, [currentQuestion]);

  async function handleOptionSelect(option: string) {
    if (isAnswered) return;
    setSelectedAnswer(option);
    setIsAnswered(true);

    const isCorrect = isAnswerCorrect(currentQuestion.question_type, option, currentQuestion.correct_option);

    const newScore = score + (isCorrect ? 1 : 0);
    if (isCorrect) {
      setScore(newScore);
    }

    const timeTakenSeconds = Math.floor((Date.now() - questionStartTimeRef.current) / 1000);

    if (sessionId) {
      fetch("/api/quiz/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          questionId: currentQuestion.id,
          questionText: currentQuestion.question_text,
          questionType: currentQuestion.question_type,
          userAnswer: option,
          isCorrect,
          usedHint: showHint,
          timeTakenSeconds,
          isCompleted: isAdaptive ? currentIndex + 1 >= QUIZ_SIZE : currentIndex + 1 >= questions.length,
          score: newScore,
          totalQuestions: isAdaptive ? QUIZ_SIZE : questions.length
        }),
      }).catch(console.error);
    }
  }

  async function handleOpenEndedSubmit() {
    if (isAnswered || !openEndedAnswer.trim() || isGrading) return;

    setIsGrading(true);
    let finalCorrect = false;
    let newScore = score;
    try {
      const res = await fetch("/api/quiz/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText: currentQuestion.question_text,
          correctAnswer: currentQuestion.correct_option,
          studentAnswer: openEndedAnswer.trim(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        finalCorrect = data.is_correct;
      } else {
        // Fallback if API fails
        finalCorrect = openEndedAnswer.trim().toLowerCase() === currentQuestion.correct_option.trim().toLowerCase();
      }
    } catch (err) {
      // Fallback
      finalCorrect = openEndedAnswer.trim().toLowerCase() === currentQuestion.correct_option.trim().toLowerCase();
    }

    setOpenEndedGradingResult(finalCorrect);
    if (finalCorrect) {
      newScore = score + 1;
      setScore(newScore);
    }

    setSelectedAnswer(openEndedAnswer.trim().toLowerCase());
    setIsAnswered(true);
    setIsGrading(false);

    const timeTakenSeconds = Math.floor((Date.now() - questionStartTimeRef.current) / 1000);

    if (sessionId) {
      fetch("/api/quiz/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          questionId: currentQuestion.id,
          questionText: currentQuestion.question_text,
          questionType: currentQuestion.question_type,
          userAnswer: openEndedAnswer.trim(),
          isCorrect: finalCorrect,
          usedHint: showHint,
          timeTakenSeconds,
          isCompleted: isAdaptive ? currentIndex + 1 >= QUIZ_SIZE : currentIndex + 1 >= questions.length,
          score: newScore,
          totalQuestions: isAdaptive ? QUIZ_SIZE : questions.length
        }),
      }).catch(console.error);
    }
  }

  async function handleNext() {
    if (isAdaptive) {
      if (currentIndex + 1 >= QUIZ_SIZE) {
        setShowResults(true);
        return;
      }
      setIsFetchingNext(true);
      try {
        const res = await fetch("/api/quiz/next-adaptive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId })
        });
        if (!res.ok) throw new Error("Failed to fetch adaptive question");
        const data = await res.json();
        if (data.question) {
          setQuestions(prev => [...prev, data.question]);
        } else {
          setShowResults(true);
          return;
        }
      } catch (err) {
        console.error(err);
        setShowResults(true);
        return;
      } finally {
        setIsFetchingNext(false);
      }
    } else {
      if (currentIndex + 1 >= questions.length) {
        setShowResults(true);
        return;
      }
    }

    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setShowHint(false);
    setOpenEndedAnswer("");
    setOpenEndedGradingResult(null);
    setAnimKey((k) => k + 1);
    questionStartTimeRef.current = Date.now();

    if (nextIndex % QUESTIONS_PER_LEVEL === 0 && nextIndex < QUIZ_SIZE) {
      setQuizView("level_complete");
    }
  }

  function handleRestartLevel(levelNum: number) {
    if (!confirm(`¿Estás seguro de que quieres reiniciar el Nivel ${levelNum}? Perderás el progreso actual de este nivel.`)) return;
    const newIndex = (levelNum - 1) * QUESTIONS_PER_LEVEL;
    setCurrentIndex(newIndex);
    if (levelNum === 1) setScore(0);
    setQuizView("question");
    questionStartTimeRef.current = Date.now();
  }

  if (loading) {
    return (
      <main className={styles.loading}>
        <div className={styles.spinner}></div>
        <p className={styles.loadingText}>Cargando preguntas...</p>
      </main>
    );
  }

  if (questions.length === 0) {
    return (
      <main className={styles.emptyState}>
        <div className={styles.emptyIcon}>📭</div>
        <h2 className={styles.emptyTitle}>No hay preguntas</h2>
        <p className={styles.emptyText}>
          Aún no se han agregado preguntas. ¡Vuelve pronto!
        </p>
        <Link href="/" className="btn btn-secondary">
          ← Inicio
        </Link>
      </main>
    );
  }

  if (showResults) {
    const totalQuestions = isAdaptive ? QUIZ_SIZE : questions.length;
    const percentage = Math.round((score / totalQuestions) * 100);
    let resultEmoji = "🎉";
    let resultMessage = "¡Increíble! ¡Eres un maestro de la trivia!";

    if (percentage < 30) {
      resultEmoji = "💪";
      resultMessage = "¡Sigue practicando, lo lograrás!";
    } else if (percentage < 60) {
      resultEmoji = "👏";
      resultMessage = "¡Buen esfuerzo! Hay margen de mejora.";
    } else if (percentage < 90) {
      resultEmoji = "🌟";
      resultMessage = "¡Gran trabajo! ¡Casi perfecto!";
    }

    return (
      <main className={styles.resultsContainer}>
        <div className={styles.resultsCard}>
          <div className={styles.resultsIcon}>{resultEmoji}</div>
          <h1 className={styles.resultsTitle}>¡Quiz Completado!</h1>
          <div className={styles.resultsScore}>
            {score} / {isAdaptive ? QUIZ_SIZE : questions.length}
          </div>
          <p className={styles.resultsSubtitle}>{resultMessage}</p>
          <div className={styles.resultsActions}>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => {
                setShowResults(false);
                setQuizView("map");
              }}
              id="back-to-map-btn"
            >
              🗺️ Volver al Mapa
            </button>
            <Link href="/" className="btn btn-secondary" id="home-btn">
              ← Inicio
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Quiz active
  const totalQuestionsForProgress = isAdaptive ? QUIZ_SIZE : questions.length;
  const currentLevel = Math.floor(currentIndex / QUESTIONS_PER_LEVEL) + 1;
  const questionInLevel = (currentIndex % QUESTIONS_PER_LEVEL) + 1;
  const progress = (questionInLevel / QUESTIONS_PER_LEVEL) * 100;

  const typeBadgeClass =
    currentQuestion.question_type === "multiple_choice"
      ? styles.badgeMc
      : currentQuestion.question_type === "true_false"
        ? styles.badgeTf
        : styles.badgeOe;

  const typeLabel =
    currentQuestion.question_type === "multiple_choice"
      ? "Opción Múltiple"
      : currentQuestion.question_type === "true_false"
        ? "Verdadero / Falso"
        : "Pregunta Abierta";

  let isCurrentAnswerCorrect = false;
  if (isAnswered && selectedAnswer) {
    if (currentQuestion.question_type === "open_ended") {
      isCurrentAnswerCorrect = openEndedGradingResult ?? false;
    } else {
      isCurrentAnswerCorrect = isAnswerCorrect(currentQuestion.question_type, selectedAnswer, currentQuestion.correct_option);
    }
  }

  return (
    <main className={styles.quizContainer}>
      {/* Header */}
      <div className={styles.quizHeader}>
        <Link href="/" className={styles.quizLogo}>
          🌍 Trivia Mundial
        </Link>
        <div className={styles.scoreDisplay}>
          ⭐ <span className={styles.scoreValue}>{score}</span>
        </div>
      </div>

      {/* Views */}
      {quizView === "map" && (
        <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h2 style={{ textAlign: "center", marginBottom: "1rem" }}>Mapa del Torneo</h2>
          {Array.from({ length: TOTAL_LEVELS }).map((_, i) => {
            const levelNum = i + 1;
            const completedLevels = Math.floor(currentIndex / QUESTIONS_PER_LEVEL);
            const isCompleted = levelNum <= completedLevels;
            const isCurrent = levelNum === completedLevels + 1;
            const isLocked = levelNum > completedLevels + 1;
            
            return (
              <div 
                key={levelNum} 
                style={{ 
                  padding: "1.5rem", 
                  borderRadius: "var(--radius-lg)", 
                  border: "1px solid var(--border)",
                  background: isCurrent ? "var(--bg-secondary)" : "var(--bg-primary)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  opacity: isLocked ? 0.6 : 1
                }}
              >
                <div>
                  <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    Nivel {levelNum} {isCompleted ? "✅" : isLocked ? "🔒" : "📍"}
                  </h3>
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.25rem" }}>
                    {QUESTIONS_PER_LEVEL} Preguntas
                  </p>
                </div>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                  {isCompleted ? (
                    <>
                      <span style={{ color: "var(--accent-emerald)", fontWeight: "bold" }}>Completado</span>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRestartLevel(levelNum)}
                      >
                        🔄 Reiniciar
                      </button>
                    </>
                  ) : isCurrent ? (
                    <>
                      <button 
                        className="btn btn-primary" 
                        onClick={() => {
                          setQuizView("question");
                          questionStartTimeRef.current = Date.now();
                        }}
                      >
                        {currentIndex % QUESTIONS_PER_LEVEL === 0 ? "Comenzar" : "Continuar"}
                      </button>
                      {currentIndex % QUESTIONS_PER_LEVEL !== 0 && (
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleRestartLevel(levelNum)}
                        >
                          🔄 Reiniciar
                        </button>
                      )}
                    </>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>Bloqueado</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {quizView === "level_complete" && (
        <div style={{ marginTop: "3rem", textAlign: "center", padding: "2rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🎉</div>
          <h2>¡Nivel {currentLevel - 1} Completado!</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
            ¡Gran trabajo! Has avanzado al siguiente nivel del torneo.
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
            <button 
              className="btn btn-primary btn-lg" 
              onClick={() => {
                setQuizView("question");
                questionStartTimeRef.current = Date.now();
              }}
            >
              Siguiente Nivel ➡️
            </button>
            <button 
              className="btn btn-secondary btn-lg" 
              onClick={() => setQuizView("map")}
            >
              Ir al Mapa
            </button>
          </div>
        </div>
      )}

      {quizView === "question" && (
        <>
          {/* Progress */}
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          {/* Question Card */}
          <div className={styles.questionCard} key={animKey}>
            <div className={styles.questionMeta}>
              <span className={styles.questionNumber}>
                Nivel {currentLevel} &bull; Pregunta {questionInLevel} de {QUESTIONS_PER_LEVEL}
              </span>
              <span className={`${styles.questionTypeBadge} ${typeBadgeClass}`}>
                {typeLabel}
              </span>
            </div>

        <h2 className={styles.questionText} style={{ whiteSpace: "pre-line", lineHeight: "1.6" }}>
          {renderWithBold(currentQuestion.question_text.replace(/\.\s+/g, ".\n\n"))}
        </h2>

        {/* Hint Section */}
        {currentQuestion.hint && !isAnswered && (
          <div style={{ marginBottom: '1.5rem', marginTop: '-0.5rem', textAlign: 'center' }}>
            {!showHint ? (
              <button
                onClick={() => setShowHint(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: '0.5rem'
                }}
              >
                ¿Necesitas una pista?
              </button>
            ) : (
              <div style={{
                padding: '0.75rem',
                background: 'rgba(52, 211, 153, 0.1)',
                borderLeft: '3px solid var(--accent-emerald)',
                borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                fontSize: '0.9rem',
                color: 'var(--text-primary)',
                textAlign: 'left',
                display: 'inline-block',
                width: '100%'
              }}>
                <strong style={{ color: 'var(--accent-emerald)', display: 'block', marginBottom: '0.25rem' }}>💡 Pista</strong>
                {currentQuestion.hint}
              </div>
            )}
          </div>
        )}

        {/* Multiple Choice */}
        {currentQuestion.question_type === "multiple_choice" && (
          <div className={styles.optionsGrid}>
            {currentShuffledKeys.map((key, index) => {
              const displayLetter = ["A", "B", "C", "D"][index];
              const optionKey = `option_${key}` as keyof Question;
              const optionText = currentQuestion[optionKey] as string;
              if (!optionText) return null;

              let optionClass = styles.optionButton;
              if (isAnswered) {
                optionClass += ` ${styles.optionDisabled}`;
                if (key === currentQuestion.correct_option) {
                  optionClass += ` ${styles.optionCorrect}`;
                } else if (key === selectedAnswer) {
                  optionClass += ` ${styles.optionWrong}`;
                } else {
                  optionClass += ` ${styles.optionNotSelected}`;
                }
              }

              return (
                <button
                  key={key}
                  className={optionClass}
                  onClick={() => handleOptionSelect(key)}
                  id={`option-${key}`}
                >
                  <span className={styles.optionLabel}>
                    {displayLetter}
                  </span>
                  {renderWithBold(optionText)}
                </button>
              );
            })}
          </div>
        )}

        {/* True/False */}
        {currentQuestion.question_type === "true_false" && (
          <div className={styles.optionsGrid}>
            {["true", "false"].map((val) => {
              const isCorrectInDb = isAnswerCorrect(currentQuestion.question_type, val, currentQuestion.correct_option);

              let optionClass = styles.optionButton;
              if (isAnswered) {
                optionClass += ` ${styles.optionDisabled}`;
                if (isCorrectInDb) {
                  optionClass += ` ${styles.optionCorrect}`;
                } else if (val === selectedAnswer) {
                  optionClass += ` ${styles.optionWrong}`;
                } else {
                  optionClass += ` ${styles.optionNotSelected}`;
                }
              }

              return (
                <button
                  key={val}
                  className={optionClass}
                  onClick={() => handleOptionSelect(val)}
                  id={`option-${val}`}
                >
                  <span className={styles.optionLabel}>
                    {val === "true" ? "✓" : "✗"}
                  </span>
                  {val === "true" ? "Verdadero" : "Falso"}
                </button>
              );
            })}
          </div>
        )}

        {/* Open Ended */}
        {currentQuestion.question_type === "open_ended" && (
          <div className={styles.openEndedForm}>
            <input
              type="text"
              className={styles.openEndedInput}
              placeholder="Escribe tu respuesta..."
              value={openEndedAnswer}
              onChange={(e) => setOpenEndedAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleOpenEndedSubmit();
              }}
              disabled={isAnswered || isGrading}
              id="open-ended-input"
              maxLength={500}
              autoComplete="off"
            />
            {!isAnswered && (
              <button
                className="btn btn-primary"
                onClick={handleOpenEndedSubmit}
                disabled={!openEndedAnswer.trim() || isGrading}
                id="submit-answer-btn"
              >
                {isGrading ? "Calificando..." : "Enviar Respuesta"}
              </button>
            )}
            {isAnswered && (
              <div
                className={`${styles.answerReveal} ${isCurrentAnswerCorrect
                    ? styles.answerCorrect
                    : styles.answerWrong
                  }`}
              >
                {isCurrentAnswerCorrect
                  ? "✅ ¡Correcto!"
                  : <>❌ La respuesta era: {renderWithBold(currentQuestion.correct_option)}</>}
              </div>
            )}
          </div>
        )}

        {/* Explanation for wrong answers */}
        {isAnswered && !isCurrentAnswerCorrect && currentQuestion.answer_explanation && (
          <div style={{
            marginTop: '2rem',
            padding: '1rem',
            background: 'rgba(239, 68, 68, 0.05)',
            borderLeft: '4px solid var(--accent-red)',
            borderRadius: '0 var(--radius-md) var(--radius-md) 0',
            color: 'var(--text-primary)',
            fontSize: '0.95rem',
            lineHeight: '1.6'
          }}>
            <strong style={{ color: 'var(--accent-red)', display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              📚 Explicación
            </strong>
            {renderWithBold(currentQuestion.answer_explanation)}
          </div>
        )}
      </div>

      {/* Next Button */}
      {isAnswered && (
        <div className={styles.nextArea}>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleNext}
            style={{ width: "100%" }}
            disabled={isFetchingNext}
            id="next-question-btn"
          >
            {isFetchingNext 
              ? "Cargando..." 
              : ((isAdaptive ? currentIndex + 1 >= QUIZ_SIZE : currentIndex + 1 >= questions.length)
                  ? "Ver Resultados 🏆"
                  : "Siguiente Pregunta →")}
          </button>
        </div>
      )}
        </>
      )}
    </main>
  );
}
