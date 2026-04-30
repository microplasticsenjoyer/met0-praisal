import React, { useState, useRef } from "react";
import styles from "./PasteInput.module.css";

const PLACEHOLDER = `Paste items here — cargo scan, contract, or manual list.

Examples:
  Tritanium x100000
  1000 Pyerite
  Damage Control II
  
  (or paste a full cargo scan / contract)`;

export default function PasteInput({ onAppraise, onClear, loading }) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  const handleSubmit = () => {
    if (text.trim()) onAppraise(text.trim());
  };

  const handleClear = () => {
    setText("");
    onClear();
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    // Ctrl/Cmd + Enter to submit
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const lineCount = text ? text.split("\n").filter((l) => l.trim()).length : 0;

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <span className={styles.label}>ITEM LIST</span>
        {lineCount > 0 && (
          <span className={styles.count}>{lineCount} line{lineCount !== 1 ? "s" : ""}</span>
        )}
      </div>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={PLACEHOLDER}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
      />
      <div className={styles.actions}>
        <span className={styles.hint}>Ctrl+Enter to appraise</span>
        <div className={styles.buttons}>
          <button
            className={styles.btnClear}
            onClick={handleClear}
            disabled={loading || !text}
          >
            CLEAR
          </button>
          <button
            className={styles.btnAppraise}
            onClick={handleSubmit}
            disabled={loading || !text.trim()}
          >
            {loading ? (
              <span className={styles.spinner}>APPRAISING...</span>
            ) : (
              "APPRAISE"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
