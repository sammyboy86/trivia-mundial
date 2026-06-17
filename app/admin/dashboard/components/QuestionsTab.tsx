import React from "react";
import styles from "../../admin.module.css";
import { Question } from "../types";
import { renderWithBold } from "@/lib/formatters";

interface QuestionsTabProps {
  questions: Question[];
  totalQuestions: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  loading: boolean;
  onAdd: () => void;
  onRestyle: () => void;
  onExplain: () => void;
  onGenerateTopics: () => void;
  onEdit: (q: Question) => void;
  fetchQuestions: (page?: number) => void;
  showToast: (message: string, type: "success" | "error") => void;
  searchId: string;
  setSearchId: (id: string) => void;
  onSearch: () => void;
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
  onGenerateTopics,
  onEdit,
  fetchQuestions,
  showToast,
  searchId,
  setSearchId,
  onSearch,
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

  async function handleDownloadJSON() {
    try {
      showToast("Preparing download...", "success");
      const res = await fetch("/api/admin/questions/export");
      if (res.status === 401) {
        window.location.href = "/admin";
        return;
      }
      if (!res.ok) {
        showToast("Download failed", "error");
        return;
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data.questions, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `questions_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      showToast("Connection error during download", "error");
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
        <button
          className="btn btn-secondary"
          onClick={onGenerateTopics}
        >
          🏷️ Auto-Generate Topics
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleDownloadJSON}
        >
          ⬇️ Download JSON
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          <input 
            type="text" 
            placeholder="Search by ID..." 
            className="form-input" 
            style={{ width: '250px' }}
            value={searchId}
            onChange={e => setSearchId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSearch()}
          />
          <button className="btn btn-secondary" onClick={onSearch}>Search</button>
        </div>
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
                <div className={styles.questionRowText}>{renderWithBold(q.question_text)}</div>
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
                  {q.topic && (
                    <span className={styles.countBadge} style={{ background: 'var(--bg-card-hover)', color: 'var(--accent-purple)', borderColor: 'var(--accent-purple)' }}>
                      Topic: {q.topic}
                    </span>
                  )}
                  {q.metadata && typeof q.metadata === 'object' && Object.entries(q.metadata).map(([key, value]) => {
                    let displayValue = String(value);
                    if (Array.isArray(value)) {
                      displayValue = `[Array(${value.length})]`;
                    } else if (value !== null && typeof value === 'object') {
                      displayValue = '{...}';
                    } else if (displayValue.length > 50) {
                      displayValue = displayValue.substring(0, 50) + '...';
                    }
                    
                    return (
                      <span key={key} className={styles.countBadge} style={{ background: 'var(--bg-card-hover)', color: 'var(--accent-gold)', borderColor: 'var(--accent-gold)' }}>
                        {key}: {displayValue}
                      </span>
                    );
                  })}
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
