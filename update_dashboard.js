const fs = require('fs');
const file = '/home/sammyboy86/trivia-mundial/app/admin/dashboard/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add DEFAULT_TRANSLATE_PROMPT
content = content.replace(
  'const DEFAULT_RECURSIVE_PROMPT = `Further refine the JSON output. Provide additional analysis or formatting. Keep the output as valid JSON.`;',
  'const DEFAULT_RECURSIVE_PROMPT = `Further refine the JSON output. Provide additional analysis or formatting. Keep the output as valid JSON.`;\n\nconst DEFAULT_TRANSLATE_PROMPT = `Translate the \\'question_text\\', \\'options\\', and \\'correct_answer\\' (if it is text, like in open questions) to Spanish. Keep the exact JSON structure identical. Only return valid JSON.`;'
);

// 2. Update activeTab
content = content.replace(
  'const [activeTab, setActiveTab] = useState<"questions" | "markdown">(',
  'const [activeTab, setActiveTab] = useState<"questions" | "markdown" | "import">('
);

// 3. Add import state variables
content = content.replace(
  '  // Results state',
  `  // Import state\n  const [importSourceText, setImportSourceText] = useState("");\n  const [parsedQuestions, setParsedQuestions] = useState<any[]>([]);\n  const [translatePrompt, setTranslatePrompt] = useState(DEFAULT_TRANSLATE_PROMPT);\n  const [importing, setImporting] = useState(false);\n  const [translating, setTranslating] = useState(false);\n  const [parsing, setParsing] = useState(false);\n  const [translateProgress, setTranslateProgress] = useState({ current: 0, total: 0 });\n\n  // Results state`
);

// 4. Load prompt
content = content.replace(
  '    const savedRecursive = localStorage.getItem("adminRecursivePrompt");\n    if (savedRecursive) setRecursivePrompt(savedRecursive);\n  }, []);',
  '    const savedRecursive = localStorage.getItem("adminRecursivePrompt");\n    if (savedRecursive) setRecursivePrompt(savedRecursive);\n\n    const savedTranslate = localStorage.getItem("adminTranslatePrompt");\n    if (savedTranslate) setTranslatePrompt(savedTranslate);\n  }, []);'
);

// 5. Add Tab button
content = content.replace(
  '          </button>\n        </div>\n\n        {/* ===== Questions Tab ===== */}',
  '          </button>\n          <button\n            className={`${styles.tab} ${activeTab === "import" ? styles.tabActive : ""}`}\n            onClick={() => setActiveTab("import")}\n            id="tab-import"\n          >\n            📥 Import JSON\n          </button>\n        </div>\n\n        {/* ===== Questions Tab ===== */}'
);

// 6. Import Logic Functions
const importLogic = `
  // ===== Import JSON Logic =====

  async function handleLoadResultFile(e: React.ChangeEvent<HTMLSelectElement>) {
    const filename = e.target.value;
    if (!filename) return;
    try {
      const res = await fetch(\`/api/admin/results/download?file=\${encodeURIComponent(filename)}\`);
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
        
        flatQs = flatQs.map(q => ({
          ...q,
          question_type: q.item_type === "open_question" ? "open_ended" : q.item_type || "multiple_choice"
        }));
        
        setParsedQuestions(flatQs);
        showToast(\`Parsed \${flatQs.length} questions!\`, "success");
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
      const res = await fetch("/api/admin/import/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: parsedQuestions, prompt: translatePrompt })
      });
      if (!res.ok) throw new Error("Translate failed");
      
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let newQs: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\\n");
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
                setParsedQuestions(newQs);
                showToast("Translation complete!", "success");
              }
              else if (eventType === "error") showToast(data.message, "error");
            } catch {}
          }
        }
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Translate error", "error");
    }
    setTranslating(false);
  }

  async function handleImportToApp() {
    setImporting(true);
    try {
      const formattedQs = parsedQuestions.map(q => ({
        question_text: q.question_text || q.questionText || "",
        question_type: q.question_type || "multiple_choice",
        options: q.options || {},
        correct_answer: q.correct_answer || q.correctAnswer || "a"
      }));

      const res = await fetch("/api/admin/questions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: formattedQs })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk insert failed");
      showToast(\`Imported \${data.total} questions successfully!\`, "success");
      setParsedQuestions([]);
      setImportSourceText("");
      fetchQuestions(); 
      setActiveTab("questions");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Import error", "error");
    }
    setImporting(false);
  }

  const extractionFiles = resultFiles.filter((rf) => rf.type === "extraction");
`;
content = content.replace(
  '  const extractionFiles = resultFiles.filter((rf) => rf.type === "extraction");',
  importLogic
);

// 7. Add Import Tab Content
const importTabContent = `
        {/* ===== Import Tab ===== */}
        {activeTab === "import" && (
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
            <div className="form-group">
              <label className="form-label">Or Paste JSON Manually</label>
              <textarea 
                className="form-input" 
                rows={10} 
                value={importSourceText} 
                onChange={(e) => setImportSourceText(e.target.value)}
                placeholder="Paste generated JSON array here..."
              />
            </div>
            <button className="btn btn-primary" onClick={handleParseJson} disabled={parsing || !importSourceText}>
              {parsing ? "Parsing & Repairing..." : "Step 2: Parse JSON"}
            </button>

            {parsedQuestions.length > 0 && (
              <>
                <div className={styles.resultsSectionDivider} style={{ marginTop: '2rem' }}>
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
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button className="btn btn-secondary" onClick={handleTranslateJson} disabled={translating}>
                      {translating ? \`Translating Chunk \${translateProgress.current + 1}/\${translateProgress.total}...\` : "🌐 Translate to Spanish"}
                    </button>
                    <button className="btn btn-success" onClick={handleImportToApp} disabled={importing}>
                      {importing ? "Importing..." : "🚀 Step 4: Import to App Database"}
                    </button>
                  </div>
                </div>

                <div className={styles.filesGrid} style={{ marginTop: '1rem' }}>
                  {parsedQuestions.map((q, i) => (
                    <div key={i} className={styles.fileRow} style={{ alignItems: 'flex-start', padding: '1rem' }}>
                      <div>
                        <strong>{q.question_text || q.questionText || "No Question Text"}</strong>
                        <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
                          Type: {q.question_type || q.item_type} <br/>
                          Answer: {q.correct_answer || q.correctAnswer}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ===== Markdown Tab ===== */}
`;

content = content.replace(
  '        {/* ===== Markdown Tab ===== */}',
  importTabContent
);

fs.writeFileSync(file, content);
console.log('Dashboard updated successfully!');
