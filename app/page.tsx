import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.hero}>
      <div className={styles["hero-badge"]}>
        <span className={styles["hero-badge-dot"]}></span>
        Free &middot; No sign-up required
      </div>

      <div className={styles["hero-icon"]}>🌍</div>

      <h1 className={styles["hero-title"]}>
        <span className={styles["hero-title-gradient"]}>Trivia Mundial</span>
      </h1>

      <p className={styles["hero-subtitle"]}>
        Challenge yourself with questions from around the world.
        Multiple choice, true or false, and open-ended — how much do you really know?
      </p>

      <div className={styles["hero-actions"]}>
        <Link href="/quiz" className="btn btn-primary btn-lg" id="start-quiz-btn">
          🎯 Start Quiz
        </Link>
      </div>

      <div className={styles["hero-features"]}>
        <div className={styles["hero-feature"]}>
          <span className={styles["hero-feature-icon"]}>🧠</span>
          <span className={styles["hero-feature-text"]}>Multiple Choice</span>
        </div>
        <div className={styles["hero-feature"]}>
          <span className={styles["hero-feature-icon"]}>✅</span>
          <span className={styles["hero-feature-text"]}>True / False</span>
        </div>
        <div className={styles["hero-feature"]}>
          <span className={styles["hero-feature-icon"]}>✍️</span>
          <span className={styles["hero-feature-text"]}>Open Ended</span>
        </div>
      </div>
    </main>
  );
}
