"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./admin.module.css";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Invalid credentials");
        setLoading(false);
        return;
      }

      router.push("/admin/dashboard");
    } catch {
      setError("Connection error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className={styles.adminContainer}>
      <div className={styles.loginCard}>
        <h1 className={styles.loginTitle}>🔒 Admin Login</h1>
        <p className={styles.loginSubtitle}>
          Trivia Mundial Management
        </p>

        <form onSubmit={handleLogin} className={styles.loginForm}>
          {error && (
            <div className={styles.loginError} role="alert">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="admin-username" className="form-label">
              Username
            </label>
            <input
              id="admin-username"
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              maxLength={50}
            />
          </div>

          <div className="form-group">
            <label htmlFor="admin-password" className="form-label">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              maxLength={128}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            id="admin-login-btn"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </main>
  );
}
