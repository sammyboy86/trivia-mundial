import React from "react";
import styles from "../../admin.module.css";
import { Question } from "../types";

interface QuestionsTabProps {
  questions: Question[];
  totalQuestions: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  loading: boolean;
  onAdd: () => void;
  onRestyle: () => void;
  onExplain: () => void;
  onEdit: (q: Question) => void;
  fetchQuestions: (page?: number) => void;
  showToast: (message: string, type: "success" | "error") => void;
}

export default function QuestionsTab({
  questions,
  totalQuestions,
  currentPage,
  onPageChange,
  loading,
  onAdd,
  onRestyle,
  onExplain,
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
      <div className={styles.tabToolbar} style={{ display: 'flex', gap: '1rem' }}>
        <button
          className="btn btn-primary"
          onClick={onAdd}
          id="add-question-btn"
        >
          + Add Question
        </button>
        <button
          className="btn btn-secondary"
          onClick={onRestyle}
        >
          🎨 AI Style Correction
        </button>
        <button
          className="btn btn-secondary"
          onClick={onExplain}
        >
          🤖 Auto-Generate Explanations
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
                  {q.associated_kc_id && (
                    <span className={styles.countBadge} style={{ background: 'var(--bg-card-hover)', color: 'var(--accent-blue)', borderColor: 'var(--accent-blue)' }}>
                      KC: {q.associated_kc_id}
                    </span>
                  )}
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

      {!loading && totalQuestions > 20 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '2rem' }}>
          <button 
            className="btn btn-secondary btn-sm" 
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            ← Previous
          </button>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Page <strong style={{ color: 'var(--text-primary)' }}>{currentPage}</strong> of {Math.ceil(totalQuestions / 20)}
          </span>
          <button 
            className="btn btn-secondary btn-sm" 
            disabled={currentPage >= Math.ceil(totalQuestions / 20)}
            onClick={() => onPageChange(currentPage + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
