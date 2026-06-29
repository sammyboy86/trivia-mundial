"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function ForceGroupPage() {
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    // Extract the group from the URL (e.g., "llm", "mers", "control")
    let group = params.group as string;
    
    // Normalize group string
    if (group) {
      group = group.toLowerCase();
    }

    if (group === "llm" || group === "mers" || group === "control") {
      // Clear existing session so we start fresh
      localStorage.removeItem("trivia_session_data");
      
      // Force the AB group
      localStorage.setItem("trivia_ab_group", group);
      
      // Mark this session as a test session
      localStorage.setItem("trivia_is_test", "true");
      
      console.log(`Forced AB group to: ${group}`);
    } else {
      console.warn(`Invalid group: ${group}. Falling back to normal assignment.`);
    }

    // Redirect to the quiz
    router.push("/quiz");
  }, [params, router]);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <p>Asignando grupo de prueba y redirigiendo al quiz...</p>
    </div>
  );
}
