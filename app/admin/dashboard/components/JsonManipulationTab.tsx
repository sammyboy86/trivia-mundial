import React, { useState, useMemo } from "react";
import styles from "../../admin.module.css";

interface JsonManipulationTabProps {
  fetchQuestions: () => void;
  showToast: (message: string, type: "success" | "error") => void;
}

export default function JsonManipulationTab({
  fetchQuestions,
  showToast,
}: JsonManipulationTabProps) {
  const [sourceText, setSourceText] = useState("");
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [modifiedData, setModifiedData] = useState<any[]>([]);
  
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState("Add a 'difficulty' field to each question based on how hard it is (easy, medium, hard).");
  
  const [sampleSize, setSampleSize] = useState(5);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Parse JSON
  function handleParse() {
    try {
      const data = JSON.parse(sourceText);
      let arr = data;
      if (data.questions) arr = data.questions;
      if (data.results) arr = data.results;
      
      if (!Array.isArray(arr)) {
        throw new Error("Parsed JSON must be an array or contain a 'questions'/'results' array.");
      }
      
      setParsedData(arr);
      
      // Auto-detect all unique keys across all objects
      const keys = new Set<string>();
      arr.forEach(item => {
        if (typeof item === 'object' && item !== null) {
          Object.keys(item).forEach(k => keys.add(k));
        }
      });
      setSelectedFields(new Set(["id", "question_text"])); // default select some useful fields
      
      showToast(`Parsed ${arr.length} items.`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Invalid JSON", "error");
    }
  }

  async function handleLoadFromDB() {
    try {
      showToast("Loading questions from database...", "success");
      const res = await fetch("/api/admin/questions/export");
      if (!res.ok) throw new Error("Failed to load from DB");
      const data = await res.json();
      const arr = data.questions || [];
      setParsedData(arr);
      
      const keys = new Set<string>();
      arr.forEach((item: any) => {
        if (typeof item === 'object' && item !== null) {
          Object.keys(item).forEach(k => keys.add(k));
        }
      });
      setSelectedFields(new Set(["id", "question_text"]));
      showToast(`Loaded ${arr.length} questions from database!`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Load error", "error");
    }
  }

  // Get all unique keys
  const availableFields = useMemo(() => {
    const keys = new Set<string>();
    parsedData.forEach(item => {
      if (typeof item === 'object' && item !== null) {
        Object.keys(item).forEach(k => keys.add(k));
      }
    });
    return Array.from(keys).sort();
  }, [parsedData]);

  function toggleField(field: string) {
    const next = new Set(selectedFields);
    if (next.has(field)) next.delete(field);
    else next.add(field);
    setSelectedFields(next);
  }

  async function handleProcess(isSample: boolean = false) {
    if (parsedData.length === 0) return;
    if (selectedFields.size === 0) {
      showToast("Select at least one field to send to the LLM.", "error");
      return;
    }

    setProcessing(true);
    setModifiedData([]);
    setProgress({ current: 0, total: 100 });

    try {
      let targetData = parsedData;
      if (isSample) {
        const shuffled = [...parsedData].sort(() => 0.5 - Math.random());
        targetData = shuffled.slice(0, Math.max(1, sampleSize));
      }

      // Build filtered payload
      const filteredQs = targetData.map(q => {
        const f: any = {};
        selectedFields.forEach(k => {
          if (q[k] !== undefined) f[k] = q[k];
        });
        return f;
      });

      const res = await fetch("/api/admin/questions/manipulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: filteredQs, prompt })
      });
      
      if (!res.ok) throw new Error("Processing failed");
      
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let newQs: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        let eventType = "";
        
        for (const line of lines) {
          if (line.startsWith("event: ")) eventType = line.slice(7).trim();
          else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === "progress") setProgress(data);
              else if (eventType === "chunk") newQs = [...newQs, ...(data.result || [])];
              else if (eventType === "complete") {
                // Merge LLM outputs back into the original parsed data
                // The LLM was instructed to keep exact number of objects.
                const merged = targetData.map((orig, i) => {
                  const llmResult = newQs[i] || {};
                  
                  // Extract fields that are NOT standard columns into 'metadata'
                  const standardColumns = ['id', 'question_text', 'question_type', 'correct_answer', 'correct_option', 'options', 'option_a', 'option_b', 'option_c', 'option_d', 'hint', 'answer_explanation', 'associated_kc_id', 'metadata'];
                  
                  let origMetadata = orig.metadata || {};
                  let newMetadata = { ...origMetadata };
                  
                  const combined = { ...orig, ...llmResult };
                  
                  Object.keys(combined).forEach(k => {
                    if (!standardColumns.includes(k)) {
                      newMetadata[k] = combined[k];
                      // Don't delete from combined so it can be previewed easily, but it will be safely nested on import
                    }
                  });
                  
                  return { ...combined, metadata: newMetadata };
                });
                
                setModifiedData(merged);
                showToast("LLM Processing complete!", "success");
                setProgress({ current: 0, total: 0 });
              }
              else if (eventType === "error") showToast(data.message, "error");
            } catch {}
          }
        }
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Process error", "error");
      setProgress({ current: 0, total: 0 });
    }
    setProcessing(false);
  }

  async function handleImport() {
    setImporting(true);
    try {
      const CHUNK_SIZE = 50;
      let totalImported = 0;
      
      for (let i = 0; i < modifiedData.length; i += CHUNK_SIZE) {
        const chunk = modifiedData.slice(i, i + CHUNK_SIZE);
        const res = await fetch("/api/admin/questions/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questions: chunk })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`Batch failed: ${data.error}`);
        totalImported += (data.total || chunk.length);
      }

      showToast(`Successfully imported/updated ${totalImported} questions!`, "success");
      fetchQuestions();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Import error", "error");
    }
    setImporting(false);
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.resultsSectionDivider}>
        <h2 className={styles.resultsSectionTitle}>🧬 Step 1: Load JSON</h2>
      </div>
      <div className="form-group">
        <textarea 
          className="form-input" 
          rows={6} 
          value={sourceText} 
          onChange={(e) => setSourceText(e.target.value)}
          placeholder="Paste raw questions JSON array here..."
        />
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button className="btn btn-secondary" onClick={handleParse} disabled={!sourceText}>
            Parse JSON
          </button>
          <button className="btn btn-primary" onClick={handleLoadFromDB}>
            📥 Load All from Database
          </button>
        </div>
      </div>

      {parsedData.length > 0 && (
        <>
          <div className={styles.resultsSectionDivider} style={{ marginTop: '2rem' }}>
            <h2 className={styles.resultsSectionTitle}>🎯 Step 2: Configure LLM Fields</h2>
          </div>
          <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Select which fields to send to the LLM (sending fewer fields saves tokens and speeds up generation):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {availableFields.map(f => (
              <label key={f} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-secondary)', padding: '0.4rem 0.75rem', borderRadius: '4px', cursor: 'pointer', border: '1px solid var(--border)' }}>
                <input 
                  type="checkbox" 
                  checked={selectedFields.has(f)} 
                  onChange={() => toggleField(f)}
                  style={{ accentColor: 'var(--accent-gold)' }}
                />
                <code style={{ fontSize: '0.85rem' }}>{f}</code>
              </label>
            ))}
          </div>

          <div className="form-group">
            <label className="form-label">Custom Instruction Prompt</label>
            <textarea 
              className="form-input" 
              rows={3} 
              value={prompt} 
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Tell the LLM what new fields to generate or how to modify existing ones..."
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={() => handleProcess(false)} disabled={processing}>
              {processing ? `Processing...` : `🧠 Run AI on All ${parsedData.length}`}
            </button>
            <div style={{ width: '1px', height: '24px', background: 'var(--border)' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input 
                type="number" 
                className="form-input" 
                style={{ width: '80px', padding: '0.4rem' }} 
                value={sampleSize} 
                onChange={e => setSampleSize(Number(e.target.value))} 
                min={1}
              />
              <button className="btn btn-secondary" onClick={() => handleProcess(true)} disabled={processing}>
                Test Random Sample
              </button>
            </div>
          </div>
          
          {processing && progress.total > 0 && (
            <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
               Processing chunk {progress.current + 1} of {progress.total}...
            </div>
          )}
        </>
      )}

      {modifiedData.length > 0 && !processing && (
        <>
          <div className={styles.resultsSectionDivider} style={{ marginTop: '3rem' }}>
            <h2 className={styles.resultsSectionTitle}>✨ Step 4: Preview & Import</h2>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Review the modified JSON. New/unknown fields will be automatically packed into the <strong>metadata</strong> column.
            </div>
            <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
              {importing ? "Importing..." : "🚀 Upsert to Database"}
            </button>
          </div>
          <div style={{ background: '#111', padding: '1rem', borderRadius: '8px', overflow: 'auto', maxHeight: '500px' }}>
            <pre style={{ margin: 0, fontSize: '0.85rem', color: '#a6accd' }}>
              {JSON.stringify(modifiedData.slice(0, 5), null, 2)}
            </pre>
            {modifiedData.length > 5 && (
              <div style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-muted)' }}>
                ...and {modifiedData.length - 5} more items not shown.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
