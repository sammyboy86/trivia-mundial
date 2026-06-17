import React, { useState, useEffect } from "react";
import styles from "../../admin.module.css";
import { ResultFile } from "../types";

const DEFAULT_TRANSLATE_PROMPT = `Translate the 'question_text', 'options', and 'correct_answer' (if it is text, like in open questions) to Spanish. Keep the exact JSON structure identical. Only return valid JSON.`;

interface ImportTabProps {
  resultFiles: ResultFile[];
  fetchQuestions: () => void;
  onImportComplete: () => void;
  showToast: (message: string, type: "success" | "error") => void;
}

export default function ImportTab({
  resultFiles,
  fetchQuestions,
  onImportComplete,
  showToast,
}: ImportTabProps) {
  const [importSourceText, setImportSourceText] = useState("");
  const [parsedQuestions, setParsedQuestions] = useState<any[]>([]);
  const [translatePrompt, setTranslatePrompt] = useState(DEFAULT_TRANSLATE_PROMPT);

  const [parsing, setParsing] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [importing, setImporting] = useState(false);

  const [translateProgress, setTranslateProgress] = useState({ current: 0, total: 0 });
  const [importProgress, setImportProgress] = useState<{current: number, total: number} | null>(null);
  const [selectedParsedQuestions, setSelectedParsedQuestions] = useState<Set<number>>(new Set());
  const [editingParsedIndex, setEditingParsedIndex] = useState<number | null>(null);
  const [parsedForm, setParsedForm] = useState<any>(null);

  const extractionFiles = resultFiles.filter((rf) => rf.type === "extraction");
  const postProcessFiles = resultFiles.filter((rf) => rf.type === "processing");

  useEffect(() => {
    const savedTranslate = localStorage.getItem("adminTranslatePrompt");
    if (savedTranslate) setTranslatePrompt(savedTranslate);
  }, []);

  async function handleLoadResultFile(e: React.ChangeEvent<HTMLSelectElement>) {
    const filename = e.target.value;
    if (!filename) return;
    try {
      const res = await fetch(`/api/admin/results/download?file=${encodeURIComponent(filename)}`);
      if (res.ok) {
        const text = await res.text();
        setImportSourceText(text);
      }
    } catch {
      showToast("Failed to load file", "error");
    }
  }

  async function handleParseJson() {
    setParsing(true);
    setParsedQuestions([]);
    try {
      let parsed;
      try {
        parsed = JSON.parse(importSourceText);
      } catch {
        const res = await fetch("/api/admin/import/repair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: importSourceText })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Repair failed");
        parsed = data.questions;
      }

      let qs = parsed;
      if (parsed.results) qs = parsed.results;
      if (parsed.generated_assessments) qs = parsed.generated_assessments;
      if (Array.isArray(qs)) {
        let flatQs: any[] = [];
        for (const item of qs) {
          if (item.generated_assessments && Array.isArray(item.generated_assessments)) {
            flatQs.push(...item.generated_assessments);
          } else {
            flatQs.push(item);
          }
        }
        
        flatQs = flatQs.map(q => {
          const hasFlatOptions = 'option_a' in q || 'option_b' in q || 'option_c' in q || 'option_d' in q;
          const normalizedOptions = q.options || (hasFlatOptions ? {
            a: q.option_a ?? null,
            b: q.option_b ?? null,
            c: q.option_c ?? null,
            d: q.option_d ?? null
          } : {});

          // Remove null options to not break the UI rendering
          const cleanOptions = Object.fromEntries(Object.entries(normalizedOptions).filter(([_, v]) => v !== null));

          return {
            ...q,
            options: Object.keys(cleanOptions).length > 0 ? cleanOptions : undefined,
            question_type: q.item_type === "open_question" ? "open_ended" : q.item_type || q.question_type || "multiple_choice",
            correct_answer: q.correct_answer || q.correctAnswer || q.correct_option || "a"
          };
        });
        
        setParsedQuestions(flatQs);
        setSelectedParsedQuestions(new Set(flatQs.map((_, i) => i)));
        showToast(`Parsed ${flatQs.length} questions!`, "success");
      } else {
        showToast("Could not find an array of questions", "error");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Parse error", "error");
    }
    setParsing(false);
  }

  async function handleTranslateJson() {
    setTranslating(true);
    try {
      const selectedIndices = Array.from(selectedParsedQuestions).sort((a,b) => a-b);
      if (selectedIndices.length === 0) throw new Error("No questions selected for translation");

      const qsToTranslate = selectedIndices.map(i => parsedQuestions[i]);

      const res = await fetch("/api/admin/import/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: qsToTranslate, prompt: translatePrompt })
      });
      if (!res.ok) throw new Error("Translate failed");
      
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let newQs: any[] = [];
      setTranslateProgress({ current: 0, total: 100 }); // Show progress bar immediately

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
              if (eventType === "progress") setTranslateProgress(data);
              else if (eventType === "chunk") newQs = [...newQs, ...(data.result || [])];
              else if (eventType === "complete") {
                setParsedQuestions(prev => {
                  const updated = [...prev];
                  selectedIndices.forEach((origIdx, idx) => {
                    if (newQs[idx]) updated[origIdx] = newQs[idx];
                  });
                  return updated;
                });
                showToast("Translation complete!", "success");
                setTranslateProgress({ current: 0, total: 0 }); // Hide progress
              }
              else if (eventType === "error") showToast(data.message, "error");
            } catch {}
          }
        }
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Translate error", "error");
      setTranslateProgress({ current: 0, total: 0 });
    }
    setTranslating(false);
  }

  async function handleImportToApp() {
    setImporting(true);
    try {
      const selectedQs = parsedQuestions.filter((_, i) => selectedParsedQuestions.has(i));
      if (selectedQs.length === 0) throw new Error("No questions selected");

      const formattedQs = selectedQs.map(q => ({
        associated_kc_id: q.associated_kc_id || "",
        hint: q.hint || "",
        answer_explanation: q.answer_explanation || "",
        question_text: q.question_text || q.questionText || "",
        question_type: q.question_type || "multiple_choice",
        options: q.options || {},
        correct_answer: q.correct_answer || q.correctAnswer || q.correct_option || "a"
      }));

      const CHUNK_SIZE = 50;
      let totalImported = 0;
      
      setImportProgress({ current: 0, total: formattedQs.length });

      for (let i = 0; i < formattedQs.length; i += CHUNK_SIZE) {
        const chunk = formattedQs.slice(i, i + CHUNK_SIZE);
        const res = await fetch("/api/admin/questions/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questions: chunk })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`Batch ${Math.floor(i/CHUNK_SIZE) + 1} failed: ${data.error || "Bulk insert failed"}`);
        
        totalImported += (data.total || chunk.length);
        setImportProgress({ current: totalImported, total: formattedQs.length });
      }

      showToast(`Imported ${totalImported} questions successfully!`, "success");
      setParsedQuestions([]);
      setImportSourceText("");
      fetchQuestions(); 
      onImportComplete();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Import error", "error");
    }
    setImporting(false);
    setImportProgress(null);
  }

  function toggleParsedSelection(i: number) {
    const newSet = new Set(selectedParsedQuestions);
    if (newSet.has(i)) newSet.delete(i);
    else newSet.add(i);
    setSelectedParsedQuestions(newSet);
  }

  function handleEditParsed(i: number) {
    setEditingParsedIndex(i);
    setParsedForm({ ...parsedQuestions[i] });
  }

  function handleSaveParsedEdit() {
    if (editingParsedIndex === null) return;
    const updated = [...parsedQuestions];
    updated[editingParsedIndex] = { ...parsedForm };
    setParsedQuestions(updated);
    setEditingParsedIndex(null);
    setParsedForm(null);
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.resultsSectionDivider}>
        <h2 className={styles.resultsSectionTitle}>📥 Step 1: Load JSON</h2>
      </div>
      <div className="form-group" style={{ maxWidth: 400 }}>
        <label className="form-label">Select from Results</label>
        <select className="form-input" onChange={handleLoadResultFile} defaultValue="">
          <option value="" disabled>Select a file to load...</option>
          <optgroup label="Post-Processing Results">
            {postProcessFiles.map(rf => (
              <option key={rf.storageName} value={rf.storageName}>{rf.customName} ({rf.totalResults} items)</option>
            ))}
          </optgroup>
          <optgroup label="Extraction Results">
            {extractionFiles.map(rf => (
              <option key={rf.storageName} value={rf.storageName}>{rf.customName} ({rf.totalResults} items)</option>
            ))}
          </optgroup>
        </select>
      </div>
      <div className="form-group" style={{ marginTop: '1.5rem' }}>
        <label className="form-label">Or Paste JSON Manually</label>
        <textarea 
          className="form-input" 
          rows={10} 
          value={importSourceText} 
          onChange={(e) => setImportSourceText(e.target.value)}
          placeholder="Paste generated JSON array here..."
        />
      </div>
      <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={handleParseJson} disabled={parsing || !importSourceText}>
        {parsing ? "Parsing & Repairing..." : "Step 2: Parse JSON"}
      </button>

      {parsedQuestions.length > 0 && (
        <>
          <div className={styles.resultsSectionDivider} style={{ marginTop: '3rem' }}>
            <h2 className={styles.resultsSectionTitle}>📝 Step 3: Preview & Translate</h2>
          </div>
          
          <div className="form-group">
            <label className="form-label">Translation Prompt (Optional)</label>
            <textarea 
              className="form-input" 
              rows={4} 
              value={translatePrompt} 
              onChange={(e) => {
                setTranslatePrompt(e.target.value);
                localStorage.setItem("adminTranslatePrompt", e.target.value);
              }}
            />
            
            {/* Action Buttons for Step 3 & 4 */}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={handleTranslateJson} disabled={translating}>
                {translating ? `Translating Selected...` : `🌐 Translate Selected (${selectedParsedQuestions.size})`}
              </button>
              <button className="btn btn-primary" onClick={handleImportToApp} disabled={importing}>
                {importing ? (importProgress ? `Importing ${importProgress.current}/${importProgress.total}...` : "Importing...") : "🚀 Step 4: Import to App Database"}
              </button>
            </div>
            
            {/* Translation Progress Bar */}
            {translating && translateProgress.total > 0 && (
              <div style={{ marginTop: '1.5rem', width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    height: '8px', 
                    background: 'var(--accent-gold)', 
                    width: `${Math.max(5, (translateProgress.current / translateProgress.total) * 100)}%`,
                    transition: 'width 0.3s ease'
                  }} 
                />
              </div>
            )}
            {translating && translateProgress.total > 0 && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem', fontWeight: 500 }}>
                Translating Chunk {translateProgress.current + 1} of {translateProgress.total}...
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedParsedQuestions(new Set(parsedQuestions.map((_, i) => i)))}>Select All</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedParsedQuestions(new Set())}>Deselect All</button>
            </div>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Selected: <strong style={{ color: 'var(--text-primary)' }}>{selectedParsedQuestions.size}</strong> of {parsedQuestions.length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            {parsedQuestions.map((q, i) => (
              <div key={i} className="card" style={{ 
                border: selectedParsedQuestions.has(i) ? '1px solid var(--accent-gold)' : '1px solid var(--border)',
                display: 'flex',
                gap: '1rem',
                padding: '1.5rem',
                boxShadow: selectedParsedQuestions.has(i) ? 'var(--shadow-glow-gold)' : undefined,
                transition: 'all var(--transition-normal)'
              }}>
                <label style={{ marginTop: '0.2rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedParsedQuestions.has(i)}
                    onChange={() => toggleParsedSelection(i)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--accent-gold)', cursor: 'pointer' }}
                  />
                </label>
                <div style={{ flex: 1 }}>
                  {editingParsedIndex === i ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <textarea 
                        className="form-input" 
                        value={parsedForm.question_text || parsedForm.questionText || ""} 
                        onChange={e => setParsedForm({...parsedForm, question_text: e.target.value})} 
                        rows={3} 
                        placeholder="Question Text"
                      />
                      <input 
                        className="form-input" 
                        type="text" 
                        value={parsedForm.associated_kc_id || ""} 
                        onChange={e => setParsedForm({...parsedForm, associated_kc_id: e.target.value})} 
                        placeholder="Associated KC ID (Optional)" 
                      />
                      <textarea 
                        className="form-input" 
                        value={parsedForm.hint || ""} 
                        onChange={e => setParsedForm({...parsedForm, hint: e.target.value})} 
                        rows={2} 
                        placeholder="Hint (Optional)"
                      />
                      <select 
                        className="form-input" 
                        value={parsedForm.question_type || parsedForm.item_type || "multiple_choice"} 
                        onChange={e => setParsedForm({...parsedForm, question_type: e.target.value, item_type: e.target.value})}
                      >
                        <option value="multiple_choice">Multiple Choice</option>
                        <option value="true_false">True/False</option>
                        <option value="open_ended">Open Ended</option>
                      </select>
                      
                      {/* Edit Multiple Choice Options */}
                      {(parsedForm.question_type === "multiple_choice" || parsedForm.item_type === "multiple_choice") && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                          <label className="form-label" style={{ marginBottom: 0 }}>Options</label>
                          {['a', 'b', 'c', 'd'].map(optKey => (
                            <div key={optKey} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <strong style={{ width: '25px', color: 'var(--text-secondary)' }}>{optKey.toUpperCase()}:</strong>
                              <input 
                                className="form-input" 
                                type="text" 
                                value={parsedForm.options?.[optKey] || ""} 
                                onChange={e => setParsedForm({
                                  ...parsedForm, 
                                  options: { ...(parsedForm.options || {}), [optKey]: e.target.value }
                                })} 
                                placeholder={`Option ${optKey.toUpperCase()}`} 
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      <input 
                        className="form-input" 
                        type="text" 
                        value={parsedForm.correct_answer || parsedForm.correctAnswer || ""} 
                        onChange={e => setParsedForm({...parsedForm, correct_answer: e.target.value})} 
                        placeholder="Correct Answer (e.g. a, b, or text)" 
                      />
                      
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button className="btn btn-primary btn-sm" onClick={handleSaveParsedEdit}>Save</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingParsedIndex(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {q.associated_kc_id && (
                        <div style={{ marginBottom: '0.5rem' }}>
                          <span style={{ 
                            background: 'var(--bg-card-hover)', 
                            color: 'var(--accent-blue)', 
                            padding: '0.2rem 0.5rem', 
                            borderRadius: '4px', 
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            letterSpacing: '0.05em'
                          }}>
                            KC: {q.associated_kc_id}
                          </span>
                        </div>
                      )}
                      <strong style={{ fontSize: '1.1rem', lineHeight: '1.5', color: 'var(--text-primary)' }}>
                        {q.question_text || q.questionText || "No Question Text"}
                      </strong>
                      
                      {/* Vertical Options Rendering */}
                      {q.options && typeof q.options === 'object' && Object.keys(q.options).length > 0 && (
                        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {Object.entries(q.options).map(([key, val]) => (
                            <div key={key} style={{ 
                              padding: '0.6rem 1rem', 
                              background: 'var(--bg-secondary)', 
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-sm)', 
                              fontSize: '0.95rem' 
                            }}>
                              <strong style={{ color: 'var(--accent-gold)', marginRight: '0.5rem' }}>{key.toUpperCase()}</strong> 
                              {String(val)}
                            </div>
                          ))}
                        </div>
                      )}

                      {q.hint && (
                        <div style={{ 
                          marginTop: '0.75rem', 
                          padding: '0.75rem', 
                          background: 'rgba(52, 211, 153, 0.1)', 
                          borderLeft: '3px solid var(--accent-emerald)',
                          borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                          fontSize: '0.9rem',
                          color: 'var(--text-primary)'
                        }}>
                          <strong style={{ color: 'var(--accent-emerald)', display: 'block', marginBottom: '0.25rem' }}>💡 Hint</strong>
                          {q.hint}
                        </div>
                      )}

                      <div style={{ 
                        fontSize: '0.9rem', 
                        color: 'var(--text-muted)', 
                        marginTop: '1.25rem', 
                        display: 'flex', 
                        gap: '1.5rem',
                        alignItems: 'center'
                      }}>
                        <span>
                          <strong style={{ color: 'var(--text-secondary)', marginRight: '0.25rem' }}>Type:</strong> 
                          <span style={{ textTransform: 'capitalize' }}>{(q.question_type || q.item_type || "").replace('_', ' ')}</span>
                        </span>
                        <span>
                          <strong style={{ color: 'var(--text-secondary)', marginRight: '0.25rem' }}>Answer:</strong> 
                          <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>{q.correct_answer || q.correctAnswer}</span>
                        </span>
                      </div>
                      
                      <button className="btn btn-secondary btn-sm" style={{ marginTop: '1.25rem' }} onClick={() => handleEditParsed(i)}>
                        ✏️ Edit
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
