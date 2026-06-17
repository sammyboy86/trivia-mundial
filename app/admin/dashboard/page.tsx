"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Question, MarkdownFile, ResultFile } from "./types";
import styles from "../admin.module.css";

import QuestionsTab from "./components/QuestionsTab";
import MarkdownUploadTab from "./components/MarkdownUploadTab";
import ImportTab from "./components/ImportTab";
import QuestionModal from "./components/Modals/QuestionModal";
import RestyleModal from "./components/Modals/RestyleModal";
import ExplainModal from "./components/Modals/ExplainModal";
import TopicPromptModal from "./components/Modals/TopicPromptModal";
import SessionsTab from "./components/SessionsTab";
import JsonManipulationTab from "./components/JsonManipulationTab";
import ThematicClusteringTab from "./components/ThematicClusteringTab";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<"questions" | "markdown" | "import" | "sessions" | "manipulate" | "clustering">("questions");
  
  // Shared State
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const router = useRouter();

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Questions State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showRestyleModal, setShowRestyleModal] = useState(false);
  const [showExplainModal, setShowExplainModal] = useState(false);
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [searchId, setSearchId] = useState("");

  // Markdown State
  const [mdFiles, setMdFiles] = useState<MarkdownFile[]>([]);
  const [mdLoading, setMdLoading] = useState(true);

  // Results State
  const [resultFiles, setResultFiles] = useState<ResultFile[]>([]);
  const [resultsLoading, setResultsLoading] = useState(true);

  // Data Fetching
  const fetchQuestions = useCallback(async (pageToFetch: number = 1, sid: string = searchId) => {
    setLoading(true);
    try {
      let url = `/api/admin/questions?page=${pageToFetch}&limit=20`;
      if (sid) url += `&searchId=${encodeURIComponent(sid)}`;
      const res = await fetch(url);
      if (res.status === 401) {
        router.push("/admin");
        return;
      }
      const data = await res.json();
      setQuestions(data.questions || []);
      setTotalQuestions(data.total || 0);
      setCurrentPage(data.page || 1);
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
    fetchQuestions(1);
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
            <span className={styles.countBadge}>{totalQuestions}</span>
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
          <button
            className={`${styles.tab} ${activeTab === "sessions" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("sessions")}
            id="tab-sessions"
          >
            📊 Sessions
          </button>
          <button
            className={`${styles.tab} ${activeTab === "manipulate" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("manipulate")}
            id="tab-manipulate"
          >
            🧬 Manipulate JSON
          </button>
          <button
            className={`${styles.tab} ${activeTab === "clustering" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("clustering")}
            id="tab-clustering"
          >
            🌌 Thematic Clustering
          </button>
        </div>

        {/* Content */}
        {activeTab === "questions" && (
          <QuestionsTab
            questions={questions}
            totalQuestions={totalQuestions}
            currentPage={currentPage}
            onPageChange={fetchQuestions}
            loading={loading}
            onAdd={() => setShowQuestionModal(true)}
            onRestyle={() => setShowRestyleModal(true)}
            onExplain={() => setShowExplainModal(true)}
            onGenerateTopics={() => setShowTopicModal(true)}
            onEdit={(q) => {
              setEditingQuestion(q);
              setShowQuestionModal(true);
            }}
            fetchQuestions={fetchQuestions}
            showToast={showToast}
            searchId={searchId}
            setSearchId={setSearchId}
            onSearch={() => fetchQuestions(1, searchId)}
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

        {activeTab === "sessions" && (
          <SessionsTab />
        )}

        {activeTab === "manipulate" && (
          <JsonManipulationTab 
            fetchQuestions={fetchQuestions}
            showToast={showToast}
          />
        )}
        
        {activeTab === "clustering" && (
          <ThematicClusteringTab
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

      {showRestyleModal && (
        <RestyleModal
          onClose={() => setShowRestyleModal(false)}
          onComplete={() => {
            setShowRestyleModal(false);
            fetchQuestions();
          }}
        />
      )}

      {showExplainModal && (
        <ExplainModal
          onClose={() => setShowExplainModal(false)}
          onComplete={() => {
            setShowExplainModal(false);
            fetchQuestions();
          }}
        />
      )}

      {showTopicModal && (
        <TopicPromptModal
          onClose={() => setShowTopicModal(false)}
          onComplete={() => {
            setShowTopicModal(false);
            fetchQuestions();
          }}
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
