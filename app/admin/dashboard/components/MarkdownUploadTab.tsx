import React, { useState } from "react";
import styles from "../../admin.module.css";
import { MarkdownFile, ResultFile } from "../types";
import ExtractionModal from "./Modals/ExtractionModal";
import PostProcessModal from "./Modals/PostProcessModal";

interface MarkdownUploadTabProps {
  mdFiles: MarkdownFile[];
  mdLoading: boolean;
  fetchMarkdownFiles: () => void;
  resultFiles: ResultFile[];
  resultsLoading: boolean;
  fetchResults: () => void;
  showToast: (message: string, type: "success" | "error") => void;
}

export default function MarkdownUploadTab({
  mdFiles,
  mdLoading,
  fetchMarkdownFiles,
  resultFiles,
  resultsLoading,
  fetchResults,
  showToast,
}: MarkdownUploadTabProps) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Modal states
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [postProcessMode, setPostProcessMode] = useState<"initial" | "recursive">("initial");

  const extractionFiles = resultFiles.filter((rf) => rf.type === "extraction");
  const postProcessFiles = resultFiles.filter((rf) => rf.type === "processing");

  // Format Helpers
  function formatFileSize(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString();
  }

  // Upload Logic
  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.name.endsWith(".md") && !file.name.endsWith(".markdown") && !file.name.endsWith(".html") && !file.name.endsWith(".htm")) {
        showToast(`Skipped ${file.name}: Not a supported file type`, "error");
        errorCount++;
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast(`Skipped ${file.name}: Exceeds 5MB`, "error");
        errorCount++;
        continue;
      }

      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/admin/markdown", {
          method: "POST",
          body: formData,
        });
        if (res.status === 401) {
          window.location.href = "/admin";
          return;
        }
        if (!res.ok) {
          const data = await res.json();
          showToast(data.error || `Failed: ${file.name}`, "error");
          errorCount++;
        } else {
          successCount++;
        }
      } catch {
        errorCount++;
      }
    }
    if (successCount > 0)
      showToast(
        `${successCount} file${successCount > 1 ? "s" : ""} uploaded`,
        "success"
      );
    if (errorCount > 0 && successCount === 0)
      showToast("Upload failed", "error");
    setUploading(false);
    fetchMarkdownFiles();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  }

  // Delete Logic
  async function handleDeleteFile(storageName: string) {
    try {
      const res = await fetch(
        `/api/admin/markdown?file=${encodeURIComponent(storageName)}`,
        { method: "DELETE" }
      );
      if (res.status === 401) {
        window.location.href = "/admin";
        return;
      }
      if (!res.ok) {
        showToast("Failed to delete file", "error");
        return;
      }
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        next.delete(storageName);
        return next;
      });
      showToast("File deleted", "success");
      fetchMarkdownFiles();
    } catch {
      showToast("Connection error", "error");
    }
  }

  async function handleDeleteResult(storageName: string) {
    try {
      const res = await fetch(
        `/api/admin/results?file=${encodeURIComponent(storageName)}`,
        { method: "DELETE" }
      );
      if (res.status === 401) {
        window.location.href = "/admin";
        return;
      }
      if (!res.ok) {
        showToast("Failed to delete result", "error");
        return;
      }
      setSelectedResults((prev) => {
        const next = new Set(prev);
        next.delete(storageName);
        return next;
      });
      showToast("Result deleted", "success");
      fetchResults();
    } catch {
      showToast("Connection error", "error");
    }
  }

  // Selection Logic
  function toggleFileSelection(storageName: string) {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(storageName)) next.delete(storageName);
      else next.add(storageName);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedFiles.size === mdFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(mdFiles.map((f) => f.storageName)));
    }
  }

  function toggleResultSelection(storageName: string) {
    setSelectedResults((prev) => {
      const next = new Set(prev);
      if (next.has(storageName)) next.delete(storageName);
      else next.add(storageName);
      return next;
    });
  }

  return (
    <div className={styles.tabContent}>
      {/* Upload Zone */}
      <div
        className={`${styles.uploadZone} ${
          dragOver ? styles.uploadZoneDragOver : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className={styles.uploadIcon}>{uploading ? "⏳" : "📤"}</div>
        <p className={styles.uploadText}>
          {uploading
            ? "Uploading..."
            : "Drag & drop .md or .html files here, or click to browse"}
        </p>
        <label
          className={`btn btn-primary ${uploading ? "btn-disabled" : ""}`}
          htmlFor="md-file-input"
        >
          {uploading ? "Uploading..." : "Choose Files"}
        </label>
        <input
          id="md-file-input"
          type="file"
          accept=".md,.markdown,.html,.htm"
          multiple
          className={styles.uploadInput}
          onChange={(e) => handleFileUpload(e.target.files)}
          disabled={uploading}
        />
        <p className={styles.uploadHint}>
          Max 5MB per file · .md, .markdown, and .html
        </p>
      </div>

      {/* File List */}
      {mdLoading ? (
        <div className={styles.emptyDash}>
          <p className={styles.emptyDashText}>Loading files...</p>
        </div>
      ) : mdFiles.length === 0 ? (
        <div className={styles.emptyDash}>
          <div className={styles.emptyDashIcon}>📭</div>
          <p className={styles.emptyDashText}>
            No markdown files uploaded yet.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.fileToolbar}>
            <label className={styles.selectAllLabel}>
              <input
                type="checkbox"
                checked={
                  selectedFiles.size === mdFiles.length && mdFiles.length > 0
                }
                onChange={toggleSelectAll}
                className={styles.checkbox}
              />
              Select all ({mdFiles.length})
            </label>
            {selectedFiles.size > 0 && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowProcessModal(true)}
                id="process-btn"
              >
                ⚙️ Process {selectedFiles.size} file
                {selectedFiles.size > 1 ? "s" : ""}
              </button>
            )}
          </div>

          <div className={styles.filesGrid}>
            {mdFiles.map((file) => (
              <div
                key={file.storageName}
                className={`${styles.fileRow} ${
                  selectedFiles.has(file.storageName)
                    ? styles.fileRowSelected
                    : ""
                }`}
              >
                <label className={styles.fileCheckArea}>
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(file.storageName)}
                    onChange={() => toggleFileSelection(file.storageName)}
                    className={styles.checkbox}
                  />
                </label>
                <div
                  className={styles.fileInfo}
                  onClick={() => toggleFileSelection(file.storageName)}
                >
                  <div className={styles.fileName}>
                    <span className={styles.fileIcon}>📄</span>
                    {file.originalName}
                  </div>
                  <div className={styles.fileMeta}>
                    <span>{formatFileSize(file.size)}</span>
                    <span>·</span>
                    <span>{formatDate(file.createdAt)}</span>
                  </div>
                </div>
                <div className={styles.fileActions}>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDeleteFile(file.storageName)}
                    title="Delete file"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ===== Extraction Results Section ===== */}
      <div className={styles.resultsSectionDivider}>
        <h2 className={styles.resultsSectionTitle}>📥 Extraction Results</h2>
        {selectedResults.size > 0 && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setPostProcessMode("initial");
              setShowPostModal(true);
            }}
            style={{ marginTop: "0.5rem" }}
            id="post-process-btn"
          >
            ⚙️ Post-Process {selectedResults.size} file
            {selectedResults.size > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {resultsLoading ? (
        <div className={styles.emptyDash}>
          <p className={styles.emptyDashText}>Loading extraction results...</p>
        </div>
      ) : extractionFiles.length === 0 ? (
        <div className={styles.emptyDash}>
          <div className={styles.emptyDashIcon}>📊</div>
          <p className={styles.emptyDashText}>
            No extraction results yet. Select markdown files and click Process.
          </p>
        </div>
      ) : (
        <div className={styles.filesGrid}>
          {extractionFiles.map((rf) => (
            <div
              key={rf.storageName}
              className={`${styles.fileRow} ${
                selectedResults.has(rf.storageName)
                  ? styles.fileRowSelected
                  : ""
              }`}
            >
              <label className={styles.fileCheckArea}>
                <input
                  type="checkbox"
                  checked={selectedResults.has(rf.storageName)}
                  onChange={() => toggleResultSelection(rf.storageName)}
                  className={styles.checkbox}
                />
              </label>
              <div
                className={styles.fileInfo}
                onClick={() => toggleResultSelection(rf.storageName)}
              >
                <div className={styles.fileName}>
                  <span className={styles.fileIcon}>📊</span>
                  {rf.customName}
                </div>
                <div className={styles.fileMeta}>
                  <span>{rf.totalResults} items</span>
                  <span>·</span>
                  <span>{formatFileSize(rf.size as number)}</span>
                  <span>·</span>
                  <span>{formatDate(rf.createdAt)}</span>
                </div>
              </div>
              <div className={styles.fileActions}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(
                      `/api/admin/results/download?file=${encodeURIComponent(
                        rf.storageName
                      )}`
                    );
                  }}
                  title="Download JSON"
                  style={{ marginRight: "0.5rem" }}
                >
                  ⬇️
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteResult(rf.storageName);
                  }}
                  title="Delete result"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== Post-Processing Results Section ===== */}
      <div className={styles.resultsSectionDivider}>
        <h2 className={styles.resultsSectionTitle}>
          ⚙️ Post-Processing Results
        </h2>
        {selectedResults.size > 0 && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setPostProcessMode("recursive");
              setShowPostModal(true);
            }}
            style={{ marginTop: "0.5rem" }}
          >
            ⚙️ Post-Process {selectedResults.size} file
            {selectedResults.size > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {resultsLoading ? (
        <div className={styles.emptyDash}>
          <p className={styles.emptyDashText}>
            Loading post-processing results...
          </p>
        </div>
      ) : postProcessFiles.length === 0 ? (
        <div className={styles.emptyDash}>
          <div className={styles.emptyDashIcon}>✨</div>
          <p className={styles.emptyDashText}>
            No post-processing results yet. Select extraction results and click
            Post-Process.
          </p>
        </div>
      ) : (
        <div className={styles.filesGrid}>
          {postProcessFiles.map((rf) => (
            <div
              key={rf.storageName}
              className={`${styles.fileRow} ${
                selectedResults.has(rf.storageName)
                  ? styles.fileRowSelected
                  : ""
              }`}
            >
              <label className={styles.fileCheckArea}>
                <input
                  type="checkbox"
                  checked={selectedResults.has(rf.storageName)}
                  onChange={() => toggleResultSelection(rf.storageName)}
                  className={styles.checkbox}
                />
              </label>
              <div
                className={styles.fileInfo}
                onClick={() => toggleResultSelection(rf.storageName)}
              >
                <div className={styles.fileName}>
                  <span className={styles.fileIcon}>✨</span>
                  {rf.customName}
                </div>
                <div className={styles.fileMeta}>
                  <span>{rf.totalResults} items</span>
                  <span>·</span>
                  <span>{formatFileSize(rf.size as number)}</span>
                  <span>·</span>
                  <span>{formatDate(rf.createdAt)}</span>
                </div>
              </div>
              <div className={styles.fileActions}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(
                      `/api/admin/results/download?file=${encodeURIComponent(
                        rf.storageName
                      )}`
                    );
                  }}
                  title="Download JSON"
                  style={{ marginRight: "0.5rem" }}
                >
                  ⬇️
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteResult(rf.storageName);
                  }}
                  title="Delete result"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showProcessModal && (
        <ExtractionModal
          selectedFiles={selectedFiles}
          mdFiles={mdFiles}
          onClose={() => setShowProcessModal(false)}
          onComplete={() => {
            fetchResults();
            setSelectedFiles(new Set());
          }}
        />
      )}

      {showPostModal && (
        <PostProcessModal
          mode={postProcessMode}
          selectedResults={selectedResults}
          resultFiles={resultFiles}
          onClose={() => setShowPostModal(false)}
          onComplete={() => {
            fetchResults();
            setSelectedResults(new Set());
          }}
        />
      )}
    </div>
  );
}
