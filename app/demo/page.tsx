"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./demo.module.css";
import MersDemo from "./components/MersDemo";
import LlmDemo from "./components/LlmDemo";

type DemoTab = "mers" | "llm";

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState<DemoTab>("mers");

  return (
    <main className={styles.demoContainer}>
      {/* Header */}
      <div className={styles.demoHeader}>
        <Link href="/" className={styles.demoBackLink}>
          ← Volver al inicio
        </Link>

        <div className={styles.demoBadge}>
          🔬 Modo transparencia
        </div>

        <h1 className={styles.demoTitle}>
          <span className={styles.demoTitleGradient}>
            ¿Cómo rastreamos tu conocimiento?
          </span>
        </h1>

        <p className={styles.demoSubtitle}>
          En esta trivia usamos <strong>dos algoritmos adaptativos</strong> que personalizan 
          las preguntas según lo que sabes. Aquí puedes probarlos y ver cómo funcionan por dentro,
          en tiempo real.
        </p>
      </div>

      {/* Tabs */}
      <div className={styles.tabContainer}>
        <button
          className={`${styles.tabButton} ${activeTab === "mers" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("mers")}
        >
          📐 Algoritmo MERS
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === "llm" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("llm")}
        >
          🧠 Motor LLM (Gemini)
        </button>
      </div>

      {/* Active Demo */}
      {activeTab === "mers" ? <MersDemo /> : <LlmDemo />}

      {/* Disclaimer */}
      <p className={styles.disclaimer}>
        ⚠️ Esta es una vista de demostración. Las partidas jugadas aquí <strong>no se registran</strong> en 
        ninguna base de datos y no afectan el estudio. Puedes explorar libremente.
      </p>
    </main>
  );
}
