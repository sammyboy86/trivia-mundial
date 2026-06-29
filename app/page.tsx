"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

export default function Home() {
  const router = useRouter();
  const [hasSession, setHasSession] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [age, setAge] = useState("");
  const [interest, setInterest] = useState("4");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("trivia_session_data");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.sessionId && parsed.questions && parsed.questions.length > 0) {
          if (parsed.currentIndex < parsed.questions.length) {
            setHasSession(true);
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleStartNew = () => {
    const profile = localStorage.getItem("trivia_user_profile");
    if (!profile) {
      setShowOnboarding(true);
    } else {
      localStorage.removeItem("trivia_session_data");
      router.push(`/quiz`);
    }
  };

  const handleOnboardingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("trivia_user_profile", JSON.stringify({
      age: parseInt(age, 10) || null,
      interest: parseInt(interest, 10)
    }));
    setShowOnboarding(false);
    localStorage.removeItem("trivia_session_data");
    router.push(`/quiz`);
  };

  return (
    <main className={styles.hero}>
      <div className={styles["hero-badge"]}>
        <span className={styles["hero-badge-dot"]}></span>
        Gratis &middot; Sin registro
      </div>

      <div className={styles["hero-icon"]}>🌍</div>

      <h1 className={styles["hero-title"]}>
        <span className={styles["hero-title-gradient"]}>Trivia Mundialera</span>
      </h1>

      <p className={styles["hero-subtitle"]}>
        ⚽ Responde a este quiz adaptativo para estudiar las reglas del juego y estructura del torneo de la <strong>copa del mundo 2026</strong>. 🏆
        <br /><br />
        🎓 Además, tu interacción me apoya en la realización de mi <strong>tesis de licenciatura</strong> sobre <strong>aprendizaje adaptativo</strong>.
        <br /><br />
        <span style={{ fontStyle: "italic", opacity: 0.8 }}>— Samuel Leidenberger Bitrán</span>
      </p>

      <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "center" }}>
      </div>

      <div className={styles["hero-actions"]}>
        {hasSession ? (
          <>
            <Link href={`/quiz`} className="btn btn-primary btn-lg" id="resume-quiz-btn">
              ▶️ Reanudar Quiz
            </Link>
          </>
        ) : (
          <button onClick={handleStartNew} className="btn btn-primary btn-lg" id="start-quiz-btn">
            🎯 Iniciar Quiz
          </button>
        )}
      </div>

      {showOnboarding && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '2rem', borderRadius: 'var(--radius-lg)', maxWidth: '400px', width: '100%', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>¡Bienvenido a Trivia Mundialera!</h2>
            <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Antes de empezar, cuéntanos un poco sobre ti.</p>
            <form onSubmit={handleOnboardingSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Tu edad:</label>
                <input
                  type="number"
                  min="5" max="100"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Interés en el fútbol (1 = Nada, 4 = Fanático):</label>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  {[1, 2, 3, 4].map(num => (
                    <label key={num} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                      <input
                        type="radio"
                        name="interest"
                        value={num}
                        checked={interest === num.toString()}
                        onChange={(e) => setInterest(e.target.value)}
                        style={{ accentColor: 'var(--accent-primary)' }}
                      />
                      {num}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="button" onClick={() => setShowOnboarding(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  ¡Comenzar!
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <Link
        href="/demo"
        className={styles["hero-transparency-link"]}
        id="transparency-link"
      >
        🔬 Descubre cómo rastreamos tu conocimiento
      </Link>

      <div className={styles["hero-features"]}>
        <div className={styles["hero-feature"]}>
          <span className={styles["hero-feature-icon"]}>🧠</span>
          <span className={styles["hero-feature-text"]}>Opción Múltiple</span>
        </div>
        <div className={styles["hero-feature"]}>
          <span className={styles["hero-feature-icon"]}>✅</span>
          <span className={styles["hero-feature-text"]}>Verdadero / Falso</span>
        </div>
      </div>

      <div className={styles["samuel-container"]}>
        <Image 
          src="/samuel.png" 
          alt="Samuel" 
          width={350} 
          height={500} 
          className={styles["samuel-img"]} 
          priority
        />
      </div>
    </main>
  );
}
