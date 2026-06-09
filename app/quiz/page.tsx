"use client";

import { useState, useEffect, useCallback } from "react";
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
  const [openEndedAnswer, setOpenEndedAnswer] = useState("");
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

  function handleOptionSelect(option: string) {
    if (isAnswered) return;
    setSelectedAnswer(option);
    setIsAnswered(true);

    if (option === currentQuestion.correct_option) {
      setScore((s) => s + 1);
    }
  }

  function handleOpenEndedSubmit() {
    if (isAnswered || !openEndedAnswer.trim()) return;
    setSelectedAnswer(openEndedAnswer.trim().toLowerCase());
    setIsAnswered(true);

    if (
      openEndedAnswer.trim().toLowerCase() ===
      currentQuestion.correct_option.trim().toLowerCase()
    ) {
      setScore((s) => s + 1);
    }
  }

  function handleNext() {
    if (currentIndex + 1 >= questions.length) {
      setShowResults(true);
      return;
    }
    setCurrentIndex((i) => i + 1);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setOpenEndedAnswer("");
    setAnimKey((k) => k + 1);
  }

  function handlePlayAgain() {
    setCurrentIndex(0);
    setScore(0);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setOpenEndedAnswer("");
    setShowResults(false);
    setAnimKey(0);
    fetchQuestions();
  }

  // Loading state
  if (loading) {
    return (
      <main className={styles.loading}>
        <div className={styles.spinner}></div>
        <p className={styles.loadingText}>Loading questions...</p>
      </main>
    );
  }

  // No questions
  if (questions.length === 0) {
    return (
      <main className={styles.emptyState}>
        <div className={styles.emptyIcon}>📭</div>
        <h2 className={styles.emptyTitle}>No Questions Yet</h2>
        <p className={styles.emptyText}>
          Questions haven&apos;t been added yet. Check back soon!
        </p>
        <Link href="/" className="btn btn-secondary">
          ← Back Home
        </Link>
      </main>
    );
  }

  // Results screen
  if (showResults) {
    const percentage = Math.round((score / questions.length) * 100);
    let resultEmoji = "🎉";
    let resultMessage = "Amazing! You&apos;re a trivia master!";

    if (percentage < 30) {
      resultEmoji = "💪";
      resultMessage = "Keep practicing, you'll get there!";
    } else if (percentage < 60) {
      resultEmoji = "👏";
      resultMessage = "Good effort! Room to improve.";
    } else if (percentage < 90) {
      resultEmoji = "🌟";
      resultMessage = "Great job! Almost perfect!";
    }

    return (
      <main className={styles.resultsContainer}>
        <div className={styles.resultsCard}>
          <div className={styles.resultsIcon}>{resultEmoji}</div>
          <h1 className={styles.resultsTitle}>Quiz Complete!</h1>
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
              🔄 Play Again
            </button>
            <Link href="/" className="btn btn-secondary" id="home-btn">
              ← Back Home
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
      ? "Multiple Choice"
      : currentQuestion.question_type === "true_false"
      ? "True / False"
      : "Open Ended";

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
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span className={`${styles.questionTypeBadge} ${typeBadgeClass}`}>
            {typeLabel}
          </span>
        </div>

        <h2 className={styles.questionText}>{currentQuestion.question_text}</h2>

        {/* Multiple Choice */}
        {currentQuestion.question_type === "multiple_choice" && (
          <div className={styles.optionsGrid}>
            {(["a", "b", "c", "d"] as const).map((key) => {
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
                    {key.toUpperCase()}
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
              let optionClass = styles.optionButton;
              if (isAnswered) {
                optionClass += ` ${styles.optionDisabled}`;
                if (val === currentQuestion.correct_option) {
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
                  {val === "true" ? "True" : "False"}
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
              placeholder="Type your answer..."
              value={openEndedAnswer}
              onChange={(e) => setOpenEndedAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleOpenEndedSubmit();
              }}
              disabled={isAnswered}
              id="open-ended-input"
              maxLength={500}
              autoComplete="off"
            />
            {!isAnswered && (
              <button
                className="btn btn-primary"
                onClick={handleOpenEndedSubmit}
                disabled={!openEndedAnswer.trim()}
                id="submit-answer-btn"
              >
                Submit Answer
              </button>
            )}
            {isAnswered && (
              <div
                className={`${styles.answerReveal} ${
                  selectedAnswer === currentQuestion.correct_option.toLowerCase()
                    ? styles.answerCorrect
                    : styles.answerWrong
                }`}
              >
                {selectedAnswer ===
                currentQuestion.correct_option.toLowerCase()
                  ? "✅ Correct!"
                  : `❌ The answer was: ${currentQuestion.correct_option}`}
              </div>
            )}
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
              ? "See Results 🏆"
              : "Next Question →"}
          </button>
        </div>
      )}
    </main>
  );
}
