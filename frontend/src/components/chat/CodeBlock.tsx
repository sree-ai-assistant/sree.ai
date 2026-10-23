import React, { useState, memo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy } from 'lucide-react';
import styles from './CodeBlock.module.css';

interface CodeBlockProps {
  language: string;
  value: string;
}

/**
 * Resolves the display label and diagram flag for a code block.
 * Distinguishes true ASCII diagrams from prompts (PPT, Bug Fix, Image, General)
 * and plain text or specific programming languages.
 */
export function resolveCodeBadge(language: string, value: string): { label: string; isDiagram: boolean } {
  const lang = (language || '').toLowerCase().trim();
  const trimmed = (value || '').trim();

  // 1. Explicit markdown language tags
  if (lang === 'ppt-prompt' || lang === 'pptx-prompt' || lang === 'presentation-prompt') {
    return { label: 'PPT Prompt', isDiagram: false };
  }
  if (lang === 'bug-fix-prompt' || lang === 'bug-prompt' || lang === 'fix-prompt') {
    return { label: 'Bug Fix Prompt', isDiagram: false };
  }
  if (lang === 'image-prompt' || lang === 'midjourney-prompt') {
    return { label: 'Image Prompt', isDiagram: false };
  }
  if (lang === 'system-prompt') {
    return { label: 'System Prompt', isDiagram: false };
  }
  if (lang === 'prompt') {
    return { label: 'Prompt', isDiagram: false };
  }
  if (lang === 'plain-text' || lang === 'plaintext') {
    return { label: 'Plain Text', isDiagram: false };
  }
  if (lang === 'diagram' || lang === 'flowchart' || lang === 'ascii-diagram') {
    return { label: 'Diagram', isDiagram: true };
  }

  // Canonical casing for common programming languages
  const langMap: Record<string, string> = {
    javascript: 'JavaScript', js: 'JavaScript',
    typescript: 'TypeScript', ts: 'TypeScript',
    python: 'Python', py: 'Python',
    html: 'HTML', css: 'CSS', scss: 'SCSS', sass: 'Sass',
    json: 'JSON', jsonc: 'JSON',
    sql: 'SQL', mysql: 'MySQL', postgresql: 'PostgreSQL',
    bash: 'Bash', sh: 'Bash', shell: 'Shell', zsh: 'Zsh',
    cpp: 'C++', 'c++': 'C++',
    csharp: 'C#', cs: 'C#', 'c#': 'C#',
    rust: 'Rust', rs: 'Rust',
    go: 'Go', golang: 'Go',
    java: 'Java',
    php: 'PHP',
    ruby: 'Ruby', rb: 'Ruby',
    swift: 'Swift',
    kotlin: 'Kotlin', kt: 'Kotlin',
    yaml: 'YAML', yml: 'YAML',
    xml: 'XML', svg: 'SVG',
    markdown: 'Markdown', md: 'Markdown',
    dockerfile: 'Dockerfile', docker: 'Dockerfile',
    graphql: 'GraphQL', gql: 'GraphQL',
    r: 'R', dart: 'Dart', lua: 'Lua',
  };

  if (langMap[lang]) {
    return { label: langMap[lang], isDiagram: false };
  }

  // 2. Genuine ASCII / Unicode Diagram Detection
  // Strictly checks for structural box drawings, tree branches, or node-arrow connections.
  // Never falsely matches normal prose containing hyphens ('-') or words with the letter 'v'.
  const isAsciiDiagram =
    /[\u2500-\u257F]/.test(trimmed) ||
    /\+[-=]{3,}\+/.test(trimmed) ||
    /(?:^|\n)\s*(?:\+--|\|--|\\--|├──|└──)\s*\S/.test(trimmed) ||
    /\[[^\]\n]+\]\s*(?:-->|<--|==>|<==|->|<-)\s*\[[^\]\n]+\]/.test(trimmed) ||
    /(?:^|\n)\s*(?:\^|v)\s*\n\s*\|\s*(?:\n|$)/i.test(trimmed) ||
    /(?:^|\n)\s*\|\s*\n\s*(?:\^|v)\s*(?:\n|$)/i.test(trimmed);

  if (isAsciiDiagram) {
    return { label: 'Diagram', isDiagram: true };
  }

  // 3. Prompt & Plain Text Detection for generic / text / code tags
  const isGeneric = ['text', 'txt', 'plaintext', 'code', 'none', ''].includes(lang);
  if (isGeneric) {
    // Presentation / PPT Prompt (e.g. Gamma, Canva, Tome, PowerPoint slide generation prompts)
    const hasPptKeywords = /\b(8-slide|\d+-slide|slides?\s+(?:about|on|for)|slide\s*\d+:|title\s*slide:|presentation\s+(?:about|on|deck)|gamma|canva|tome|pitch\s*deck|structure\s+the\s+slides)\b/i.test(trimmed);
    const hasPromptDirectives = /\b(create|generate|write|design|act\s+as|tone:|visual\s+style:|prompt)\b/i.test(trimmed);
    if (hasPptKeywords && (hasPromptDirectives || /slide/i.test(trimmed))) {
      return { label: 'PPT Prompt', isDiagram: false };
    }

    // Bug Fix / Debugging Prompt (e.g. issues for AI coding assistants)
    const hasBugKeywords = /\b(bug\s*fix|fix\s+(?:the|this)\s+bug|error\s*fix|expected\s+behavior|actual\s+behavior|steps\s+to\s+reproduce|reproduce\s+the\s+bug|flicker|re-render|regression)\b/i.test(trimmed);
    const hasBugContext = /\b(i\s+have\s+a\s+bug|please\s+(?:inspect|fix|check)|bug\s+in\s+my|issue\s+with|bug\s+fix\s+prompt)\b/i.test(trimmed);
    if (hasBugKeywords && (hasBugContext || hasPromptDirectives)) {
      return { label: 'Bug Fix Prompt', isDiagram: false };
    }

    // Image Generation Prompt (e.g. Midjourney, DALL-E, Flux)
    const hasImageKeywords = /\b(midjourney|dall-?e|stable\s+diffusion|photorealistic|hyperrealistic|cinematic\s+lighting|8k\s+resolution|--ar\s+\d+:\d+|render\s+in\s+unreal)\b/i.test(trimmed);
    if (hasImageKeywords) {
      return { label: 'Image Prompt', isDiagram: false };
    }

    // System Prompt
    if (/^(?:System\s*Prompt:|You\s+are\s+an?\b|Act\s+as\s+an?\b)/i.test(trimmed)) {
      return { label: 'System Prompt', isDiagram: false };
    }

    // General Prompt
    const startsAsPrompt = /^(?:Prompt:|Instructions?:|Please\s+(?:write|create|generate|act|build|summarize|help)|Create\s+a\b|Generate\s+a\b|Write\s+a\b|Your\s+task\s+is\b)/i.test(trimmed);
    if (startsAsPrompt) {
      return { label: 'Prompt', isDiagram: false };
    }

    return { label: 'Plain Text', isDiagram: false };
  }

  // Fallback: capitalize whatever language was specified
  return { label: lang.charAt(0).toUpperCase() + lang.slice(1), isDiagram: false };
}

export const CodeBlock: React.FC<CodeBlockProps> = memo(({ language, value }) => {
  const [copied, setCopied] = useState(false);

  const { label: displayLanguage, isDiagram: isAsciiDiagram } = resolveCodeBadge(language, value);

  const rawLang = (language || '').toLowerCase().trim();
  const prismLanguage = (() => {
    if (isAsciiDiagram) return 'text';
    switch (rawLang) {
      case 'c++':
      case 'cpp':
        return 'cpp';
      case 'c#':
      case 'cs':
      case 'csharp':
        return 'csharp';
      case 'py':
      case 'python':
        return 'python';
      case 'js':
      case 'javascript':
        return 'javascript';
      case 'ts':
      case 'typescript':
        return 'typescript';
      case 'sh':
      case 'shell':
      case 'zsh':
        return 'bash';
      case 'md':
      case 'markdown':
        return 'markdown';
      case 'yml':
      case 'yaml':
        return 'yaml';
      case 'html':
        return 'markup';
      case 'css':
      case 'scss':
        return 'css';
      case 'json':
      case 'jsonc':
        return 'json';
      case 'sql':
        return 'sql';
      case 'plaintext':
      case 'plain-text':
      case 'text':
      case 'txt':
      case 'ascii':
      case 'diagram':
      case 'prompt':
      case 'ppt-prompt':
      case 'bug-fix-prompt':
      case 'image-prompt':
      case 'system-prompt':
        return 'text';
      default:
        return 'text';
    }
  })();

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
        <span className={styles.language}>{displayLanguage}</span>
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
        language={prismLanguage}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          background: 'transparent',
          padding: '1rem',
        }}
        className={`${styles.codeContent} ${isAsciiDiagram ? styles.diagramContent : ''}`}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
});

