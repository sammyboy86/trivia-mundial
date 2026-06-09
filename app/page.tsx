import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.hero}>
      <div className={styles["hero-badge"]}>
        <span className={styles["hero-badge-dot"]}></span>
        Gratis &middot; Sin registro
      </div>

      <div className={styles["hero-icon"]}>🌍</div>

      <h1 className={styles["hero-title"]}>
        <span className={styles["hero-title-gradient"]}>Trivia Mundial</span>
      </h1>

      <p className={styles["hero-subtitle"]}>
        Ponte a prueba con preguntas de todo el mundo.
        Opción múltiple, verdadero o falso y preguntas abiertas — ¿cuánto sabes realmente?
      </p>

      <div className={styles["hero-actions"]}>
        <Link href="/quiz" className="btn btn-primary btn-lg" id="start-quiz-btn">
          🎯 Iniciar Quiz
        </Link>
      </div>

      <div className={styles["hero-features"]}>
        <div className={styles["hero-feature"]}>
          <span className={styles["hero-feature-icon"]}>🧠</span>
          <span className={styles["hero-feature-text"]}>Opción Múltiple</span>
        </div>
        <div className={styles["hero-feature"]}>
          <span className={styles["hero-feature-icon"]}>✅</span>
          <span className={styles["hero-feature-text"]}>Verdadero / Falso</span>
        </div>
        <div className={styles["hero-feature"]}>
          <span className={styles["hero-feature-icon"]}>✍️</span>
          <span className={styles["hero-feature-text"]}>Preguntas Abiertas</span>
        </div>
      </div>
    </main>
  );
}
