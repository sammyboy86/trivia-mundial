import React from "react";
import styles from "../../admin.module.css";
import { Question } from "../types";

interface QuestionsTabProps {
  questions: Question[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (q: Question) => void;
  fetchQuestions: () => void;
  showToast: (message: string, type: "success" | "error") => void;
}

export default function QuestionsTab({
  questions,
  loading,
  onAdd,
  onEdit,
  fetchQuestions,
  showToast,
}: QuestionsTabProps) {
  function typeLabel(type: string) {
    if (type === "multiple_choice") return "Multiple Choice";
    if (type === "true_false") return "True / False";
    if (type === "open_ended") return "Open Ended";
    return type;
  }

  function typeBadgeClass(type: string) {
    if (type === "true_false") return styles.badgeTf;
    if (type === "open_ended") return styles.badgeOe;
    return styles.badgeMc;
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this question?")) return;
    try {
      const res = await fetch(`/api/admin/questions?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.status === 401) {
        window.location.href = "/admin";
        return;
      }
      if (!res.ok) {
        showToast("Delete failed", "error");
        return;
      }
      showToast("Question deleted", "success");
      fetchQuestions();
    } catch {
      showToast("Connection error", "error");
    }
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.tabToolbar}>
        <button
          className="btn btn-primary"
          onClick={onAdd}
          id="add-question-btn"
        >
          + Add Question
        </button>
      </div>

      {loading ? (
        <div className={styles.emptyDash}>
          <p className={styles.emptyDashText}>Loading...</p>
        </div>
      ) : questions.length === 0 ? (
        <div className={styles.emptyDash}>
          <div className={styles.emptyDashIcon}>📝</div>
          <p className={styles.emptyDashText}>
            No questions yet. Click "Add Question" to get started.
          </p>
        </div>
      ) : (
        <div className={styles.questionsGrid}>
          {questions.map((q) => (
            <div key={q.id} className={styles.questionRow}>
              <div>
                <div className={styles.questionRowText}>{q.question_text}</div>
                <div className={styles.questionRowMeta}>
                  <span
                    className={`${styles.countBadge} ${typeBadgeClass(
                      q.question_type
                    )}`}
                  >
                    {typeLabel(q.question_type)}
                  </span>
                  <span className={styles.countBadge}>
                    Answer: {q.correct_option}
                  </span>
                </div>
              </div>
              <div className={styles.questionRowActions}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => onEdit(q)}
                >
                  ✏️
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(q.id)}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
