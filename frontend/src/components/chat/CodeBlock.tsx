import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy } from 'lucide-react';
import styles from './CodeBlock.module.css';

interface CodeBlockProps {
  language: string;
  value: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div className={styles.codeBlockContainer}>
      <div className={styles.codeBlockHeader}>
        <span className={styles.language}>{language || 'code'}</span>
        <button 
          onClick={handleCopy} 
          className={`${styles.copyButton} ${copied ? styles.copied : ''}`}
          title={copied ? "Copied!" : "Copy code"}
          aria-label="Copy code"
        >
          {copied ? <Check size={16} /> : <Copy size={16} /> }
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          background: 'transparent',
          padding: '1rem',
        }}
        className={styles.codeContent}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
};
