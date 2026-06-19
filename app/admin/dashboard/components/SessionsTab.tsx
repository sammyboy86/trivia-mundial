import { useState, useEffect } from "react";
import styles from "../../admin.module.css";
import { renderWithBold } from "@/lib/formatters";

interface QuizAnswer {
  id: string;
  question_text: string;
  question_type: string;
  user_answer: string;
  is_correct: boolean;
  used_hint: boolean;
  time_taken_seconds: number;
  created_at: string;
}

interface QuizSession {
  id: string;
  started_at: string;
  last_activity_at: string;
  completed: boolean;
  score: number;
  total_questions: number;
  test_group: string;
  user_age?: number;
  football_interest?: number;
  quiz_answers: QuizAnswer[];
}

export default function SessionsTab() {
  const [sessions, setSessions] = useState<QuizSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/sessions")
      .then(res => res.json())
      .then(data => {
        if (data.sessions) setSessions(data.sessions);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  if (loading) return <div className={styles.loading}>Loading sessions...</div>;

  if (sessions.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>📊</div>
        <h2 className={styles.emptyTitle}>No sessions yet</h2>
        <p className={styles.emptyText}>When users take the quiz, their sessions will appear here.</p>
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      <h2 style={{ marginBottom: "1rem" }}>User Sessions</h2>
      
      <div className={styles.list}>
        {sessions.map((session) => {
          const durationSeconds = Math.floor((new Date(session.last_activity_at).getTime() - new Date(session.started_at).getTime()) / 1000);
          const isExpanded = expandedSessionId === session.id;

          return (
            <div key={session.id} className={styles.card} style={{ marginBottom: "1rem", borderLeft: session.completed ? "4px solid var(--accent-emerald)" : "4px solid var(--accent-blue)" }}>
              <div 
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
              >
                <div>
                  <strong>Session ID:</strong> {session.id.split("-")[0]}...
                  <span style={{ marginLeft: "1rem", color: "var(--text-muted)" }}>
                    {new Date(session.started_at).toLocaleString()}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                  <span style={{ 
                    padding: "0.2rem 0.5rem", 
                    borderRadius: "4px", 
                    fontSize: "0.8rem", 
                    fontWeight: "bold",
                    background: session.test_group === 'adaptive' ? "rgba(168, 85, 247, 0.2)" : "rgba(100, 116, 139, 0.2)",
                    color: session.test_group === 'adaptive' ? "var(--accent-purple, #a855f7)" : "var(--text-secondary)"
                  }}>
                    {session.test_group === 'adaptive' ? "A/B: Adaptive" : "A/B: Control"}
                  </span>
                  <span>{session.completed ? "✅ Completed" : "⏳ In Progress"}</span>
                  {session.completed && <span>Score: {session.score}/{session.total_questions}</span>}
                  <span>⏱️ {durationSeconds}s</span>
                  {session.user_age && <span title="Edad e interés en el fútbol" style={{ color: "var(--accent-primary)", fontWeight: "bold" }}>👤 {session.user_age}a (Nivel {session.football_interest})</span>}
                  <span>{session.quiz_answers.length} answers</span>
                  <span style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
                </div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                  {session.quiz_answers.length === 0 ? (
                    <p style={{ color: "var(--text-muted)" }}>No answers recorded yet.</p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                      <thead>
                        <tr style={{ textAlign: "left", borderBottom: "2px solid var(--border)", color: "var(--text-muted)" }}>
                          <th style={{ padding: "0.5rem" }}>Question</th>
                          <th style={{ padding: "0.5rem" }}>Answer</th>
                          <th style={{ padding: "0.5rem" }}>Result</th>
                          <th style={{ padding: "0.5rem" }}>Time</th>
                          <th style={{ padding: "0.5rem" }}>Hint</th>
                        </tr>
                      </thead>
                      <tbody>
                        {session.quiz_answers.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map(ans => (
                          <tr key={ans.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "0.5rem", maxWidth: "300px" }}>{renderWithBold(ans.question_text)}</td>
                            <td style={{ padding: "0.5rem" }}>{renderWithBold(ans.user_answer)}</td>
                            <td style={{ padding: "0.5rem", color: ans.is_correct ? "var(--accent-emerald)" : "var(--accent-red)" }}>
                              {ans.is_correct ? "Correct" : "Incorrect"}
                            </td>
                            <td style={{ padding: "0.5rem" }}>{ans.time_taken_seconds}s</td>
                            <td style={{ padding: "0.5rem" }}>{ans.used_hint ? "💡 Yes" : "No"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
