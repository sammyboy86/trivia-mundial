import React, { useState, useEffect } from "react";
import styles from "../../../admin.module.css";
import { Question, QuestionFormData, emptyForm } from "../../types";

interface QuestionModalProps {
  question: Question | null;
  onClose: () => void;
  onSave: () => void;
  showToast: (message: string, type: "success" | "error") => void;
}

export default function QuestionModal({
  question,
  onClose,
  onSave,
  showToast,
}: QuestionModalProps) {
  const [form, setForm] = useState<QuestionFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (question) {
      setForm({
        question_text: question.question_text,
        question_type: question.question_type,
        option_a: question.option_a || "",
        option_b: question.option_b || "",
        option_c: question.option_c || "",
        option_d: question.option_d || "",
        correct_option: question.correct_option,
      });
    } else {
      setForm(emptyForm);
    }
  }, [question]);

  const updateForm = (field: keyof QuestionFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const method = question ? "PUT" : "POST";
      const body = question ? { id: question.id, ...form } : form;
      const res = await fetch("/api/admin/questions", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        window.location.href = "/admin";
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || "Save failed", "error");
        setSaving(false);
        return;
      }
      showToast(question ? "Question updated!" : "Question created!", "success");
      onSave(); // parent handles close and fetch
    } catch {
      showToast("Connection error", "error");
    }
    setSaving(false);
  };

  return (
    <div
      className={styles.modalOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modalCard}>
        <h2 className={styles.modalTitle}>
          {question ? "✏️ Edit Question" : "➕ New Question"}
        </h2>
        <form onSubmit={handleSave} className={styles.modalForm}>
          <div className="form-group">
            <label htmlFor="q-type" className="form-label">
              Question Type
            </label>
            <select
              id="q-type"
              className="form-select"
              value={form.question_type}
              onChange={(e) => updateForm("question_type", e.target.value)}
            >
              <option value="multiple_choice">Multiple Choice</option>
              <option value="true_false">True / False</option>
              <option value="open_ended">Open Ended</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="q-text" className="form-label">
              Question
            </label>
            <textarea
              id="q-text"
              className="form-input"
              rows={3}
              value={form.question_text}
              onChange={(e) => updateForm("question_text", e.target.value)}
              required
              maxLength={1000}
              placeholder="Enter your question..."
            />
          </div>

          {form.question_type === "multiple_choice" && (
            <>
              {(["a", "b", "c", "d"] as const).map((key) => (
                <div className="form-group" key={key}>
                  <label htmlFor={`q-option-${key}`} className="form-label">
                    Option {key.toUpperCase()}
                  </label>
                  <input
                    id={`q-option-${key}`}
                    type="text"
                    className="form-input"
                    value={form[`option_${key}` as keyof QuestionFormData] as string}
                    onChange={(e) =>
                      updateForm(`option_${key}` as keyof QuestionFormData, e.target.value)
                    }
                    required
                    maxLength={500}
                    placeholder={`Option ${key.toUpperCase()}`}
                  />
                </div>
              ))}
              <div className="form-group">
                <label htmlFor="q-correct" className="form-label">
                  Correct Option
                </label>
                <select
                  id="q-correct"
                  className="form-select"
                  value={form.correct_option}
                  onChange={(e) => updateForm("correct_option", e.target.value)}
                  required
                >
                  <option value="">Select correct answer</option>
                  <option value="a">A</option>
                  <option value="b">B</option>
                  <option value="c">C</option>
                  <option value="d">D</option>
                </select>
              </div>
            </>
          )}

          {form.question_type === "true_false" && (
            <div className="form-group">
              <label htmlFor="q-correct-tf" className="form-label">
                Correct Answer
              </label>
              <select
                id="q-correct-tf"
                className="form-select"
                value={form.correct_option}
                onChange={(e) => updateForm("correct_option", e.target.value)}
                required
              >
                <option value="">Select correct answer</option>
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            </div>
          )}

          {form.question_type === "open_ended" && (
            <div className="form-group">
              <label htmlFor="q-correct-oe" className="form-label">
                Correct Answer
              </label>
              <input
                id="q-correct-oe"
                type="text"
                className="form-input"
                value={form.correct_option}
                onChange={(e) => updateForm("correct_option", e.target.value)}
                required
                maxLength={500}
                placeholder="Expected answer (case-insensitive match)"
              />
            </div>
          )}

          <div className={styles.modalActions}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
              id="save-question-btn"
            >
              {saving ? "Saving..." : question ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
