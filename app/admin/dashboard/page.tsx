"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Question, MarkdownFile, ResultFile } from "./types";
import styles from "../admin.module.css";

import QuestionsTab from "./components/QuestionsTab";
import MarkdownUploadTab from "./components/MarkdownUploadTab";
import ImportTab from "./components/ImportTab";
import QuestionModal from "./components/Modals/QuestionModal";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<"questions" | "markdown" | "import">("questions");
  
  // Shared State
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const router = useRouter();

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Questions State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // Markdown State
  const [mdFiles, setMdFiles] = useState<MarkdownFile[]>([]);
  const [mdLoading, setMdLoading] = useState(true);

  // Results State
  const [resultFiles, setResultFiles] = useState<ResultFile[]>([]);
  const [resultsLoading, setResultsLoading] = useState(true);

  // Data Fetching
  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/questions");
      if (res.status === 401) {
        router.push("/admin");
        return;
      }
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch {
      showToast("Failed to load questions", "error");
    }
    setLoading(false);
  }, [router, showToast]);

  const fetchMarkdownFiles = useCallback(async () => {
    setMdLoading(true);
    try {
      const res = await fetch("/api/admin/markdown");
      if (res.status === 401) {
        router.push("/admin");
        return;
      }
      const data = await res.json();
      setMdFiles(data.files || []);
    } catch {
      showToast("Failed to load files", "error");
    }
    setMdLoading(false);
  }, [router, showToast]);

  const fetchResults = useCallback(async () => {
    setResultsLoading(true);
    try {
      const res = await fetch("/api/admin/results");
      if (res.status === 401) return;
      const data = await res.json();
      setResultFiles(data.files || []);
    } catch {
      // Silently fail for results
    }
    setResultsLoading(false);
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  useEffect(() => {
    if (activeTab === "markdown" || activeTab === "import") {
      fetchMarkdownFiles();
      fetchResults();
    }
  }, [activeTab, fetchMarkdownFiles, fetchResults]);

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin");
  }

  return (
    <main className={styles.dashContainer}>
      <div className="container container-wide">
        {/* Header */}
        <div className={styles.dashHeader}>
          <h1 className={styles.dashTitle}>🌍 Trivia Mundial Admin</h1>
          <div className={styles.dashActions}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleLogout}
              id="logout-btn"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className={styles.tabBar}>
          <button
            className={`${styles.tab} ${activeTab === "questions" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("questions")}
            id="tab-questions"
          >
            📋 Questions
            <span className={styles.countBadge}>{questions.length}</span>
          </button>
          <button
            className={`${styles.tab} ${activeTab === "markdown" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("markdown")}
            id="tab-markdown"
          >
            📄 Upload Markdown
            <span className={styles.countBadge}>{mdFiles.length}</span>
          </button>
          <button
            className={`${styles.tab} ${activeTab === "import" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("import")}
            id="tab-import"
          >
            📥 Import JSON
          </button>
        </div>

        {/* Content */}
        {activeTab === "questions" && (
          <QuestionsTab
            questions={questions}
            loading={loading}
            onAdd={() => {
              setEditingQuestion(null);
              setShowQuestionModal(true);
            }}
            onEdit={(q) => {
              setEditingQuestion(q);
              setShowQuestionModal(true);
            }}
            fetchQuestions={fetchQuestions}
            showToast={showToast}
          />
        )}

        {activeTab === "markdown" && (
          <MarkdownUploadTab
            mdFiles={mdFiles}
            mdLoading={mdLoading}
            fetchMarkdownFiles={fetchMarkdownFiles}
            resultFiles={resultFiles}
            resultsLoading={resultsLoading}
            fetchResults={fetchResults}
            showToast={showToast}
          />
        )}

        {activeTab === "import" && (
          <ImportTab
            resultFiles={resultFiles}
            fetchQuestions={fetchQuestions}
            onImportComplete={() => setActiveTab("questions")}
            showToast={showToast}
          />
        )}
      </div>

      {showQuestionModal && (
        <QuestionModal
          question={editingQuestion}
          onClose={() => setShowQuestionModal(false)}
          onSave={() => {
            setShowQuestionModal(false);
            fetchQuestions();
          }}
          showToast={showToast}
        />
      )}

      {toast && (
        <div className={`${styles.toast} ${styles["toast-" + toast.type]}`}>
          {toast.type === "success" ? "✅" : "❌"} {toast.message}
        </div>
      )}
    </main>
  );
}
