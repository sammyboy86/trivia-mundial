"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";
import type { Question } from "@/lib/types";
import styles from "./quiz.module.css";

const QUIZ_SIZE = 10;

export default function QuizPage() {
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

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    // Fetch random questions using Supabase
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .limit(QUIZ_SIZE);

    if (error) {
      console.error("Failed to load questions");
      setQuestions([]);
    } else {
      // Shuffle client-side for randomness
      const shuffled = (data || []).sort(() => Math.random() - 0.5);
      setQuestions(shuffled);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

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

  function handleOptionSelect(option: string) {
    if (isAnswered) return;
    setSelectedAnswer(option);
    setIsAnswered(true);

    const isCorrect = 
      option === currentQuestion.correct_option || 
      (option === "true" && currentQuestion.correct_option === "verdadero") ||
      (option === "false" && currentQuestion.correct_option === "falso");

    if (isCorrect) {
      setScore((s) => s + 1);
    }
  }

  async function handleOpenEndedSubmit() {
    if (isAnswered || !openEndedAnswer.trim() || isGrading) return;
    
    setIsGrading(true);
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
        setOpenEndedGradingResult(data.is_correct);
        if (data.is_correct) {
          setScore((s) => s + 1);
        }
      } else {
        // Fallback if API fails
        const fallbackCorrect = openEndedAnswer.trim().toLowerCase() === currentQuestion.correct_option.trim().toLowerCase();
        setOpenEndedGradingResult(fallbackCorrect);
        if (fallbackCorrect) {
          setScore((s) => s + 1);
        }
      }
    } catch (err) {
      // Fallback
      const fallbackCorrect = openEndedAnswer.trim().toLowerCase() === currentQuestion.correct_option.trim().toLowerCase();
      setOpenEndedGradingResult(fallbackCorrect);
      if (fallbackCorrect) {
        setScore((s) => s + 1);
      }
    }

    setSelectedAnswer(openEndedAnswer.trim().toLowerCase());
    setIsAnswered(true);
    setIsGrading(false);
  }

  function handleNext() {
    if (currentIndex + 1 >= questions.length) {
      setShowResults(true);
      return;
    }
    setCurrentIndex((i) => i + 1);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setShowHint(false);
    setOpenEndedAnswer("");
    setOpenEndedGradingResult(null);
    setAnimKey((k) => k + 1);
  }

  function handlePlayAgain() {
    setCurrentIndex(0);
    setScore(0);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setShowHint(false);
    setOpenEndedAnswer("");
    setOpenEndedGradingResult(null);
    setShowResults(false);
    setAnimKey(0);
    fetchQuestions();
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
    const percentage = Math.round((score / questions.length) * 100);
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
            {score} / {questions.length}
          </div>
          <p className={styles.resultsSubtitle}>{resultMessage}</p>
          <div className={styles.resultsActions}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handlePlayAgain}
              id="play-again-btn"
            >
              🔄 Jugar de nuevo
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
  const progress = ((currentIndex + 1) / questions.length) * 100;
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
      isCurrentAnswerCorrect = 
        selectedAnswer === currentQuestion.correct_option || 
        (selectedAnswer === "true" && currentQuestion.correct_option === "verdadero") ||
        (selectedAnswer === "false" && currentQuestion.correct_option === "falso");
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
            Pregunta {currentIndex + 1} de {questions.length}
          </span>
          <span className={`${styles.questionTypeBadge} ${typeBadgeClass}`}>
            {typeLabel}
          </span>
        </div>

        <h2 className={styles.questionText} style={{ whiteSpace: "pre-line", lineHeight: "1.6" }}>
          {currentQuestion.question_text.replace(/\.\s+/g, ".\n\n")}
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
                  {optionText}
                </button>
              );
            })}
          </div>
        )}

        {/* True/False */}
        {currentQuestion.question_type === "true_false" && (
          <div className={styles.optionsGrid}>
            {["true", "false"].map((val) => {
              const isCorrectInDb = 
                val === currentQuestion.correct_option || 
                (val === "true" && currentQuestion.correct_option === "verdadero") ||
                (val === "false" && currentQuestion.correct_option === "falso");

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
                className={`${styles.answerReveal} ${
                  isCurrentAnswerCorrect
                    ? styles.answerCorrect
                    : styles.answerWrong
                }`}
              >
                {isCurrentAnswerCorrect
                  ? "✅ ¡Correcto!"
                  : `❌ La respuesta era: ${currentQuestion.correct_option}`}
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
            {currentQuestion.answer_explanation}
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
            id="next-question-btn"
          >
            {currentIndex + 1 >= questions.length
              ? "Ver Resultados 🏆"
              : "Siguiente Pregunta →"}
          </button>
        </div>
      )}
    </main>
  );
}
