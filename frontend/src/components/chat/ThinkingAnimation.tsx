import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './ThinkingAnimation.module.css';

const thinkingTerms = [
  'Thinking...',
  'Parsing query...',
  'Analyzing context...',
  'Compiling response...',
  'Synthesizing...',
  'Retrieving info...',
  'Formatting solution...'
];

export const ThinkingAnimation: React.FC<{ status?: string | null }> = ({ status }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (status) return; // Don't cycle if we have a real status
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % thinkingTerms.length);
    }, 4800);
    return () => clearInterval(timer);
  }, [status]);

  return (
    <div className={styles.container}>
      <AnimatePresence mode="wait">
        <motion.div
          key={status ? `status-${status}` : `thinking-${thinkingTerms[index]}`}
          initial={{
            opacity: 0,
            clipPath: 'inset(0 100% 0 0)'
          }}
          animate={{
            opacity: 1,
            clipPath: 'inset(0 0% 0 0)'
          }}
          exit={{
            opacity: 0,
            clipPath: 'inset(0 0 0 100%)'
          }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className={styles.textWrapper}
        >
          <span className={styles.text}>
            {status || thinkingTerms[index]}
            <div className={styles.shimmer} />
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
