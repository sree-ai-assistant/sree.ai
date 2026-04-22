import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './ThinkingAnimation.module.css';

const thinkingTerms = [
  'Thinking',
  'Parsing query',
  'Analyzing context',
  'Compiling response',
  'Synthesizing',
  'Retrieving info',
  'Formatting solution'
];

export const ThinkingAnimation: React.FC<{ status?: string | null }> = ({ status }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (status) return; // Don't cycle if we have a real status
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % thinkingTerms.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [status]);

  return (
    <div className={styles.container}>
      <AnimatePresence mode="wait">
        <motion.div
          key={status ? `status-${status}` : `thinking-${thinkingTerms[index]}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className={styles.content}
        >
          <span className={styles.text}>
            {status || thinkingTerms[index]}
          </span>
          <div className={styles.dots}>
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.4, 1, 0.4] 
              }}
              transition={{ 
                duration: 1, 
                repeat: Infinity, 
                ease: "easeInOut",
                delay: 0 
              }}
              className={styles.dot}
            />
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.4, 1, 0.4] 
              }}
              transition={{ 
                duration: 1, 
                repeat: Infinity, 
                ease: "easeInOut",
                delay: 0.2 
              }}
              className={styles.dot}
            />
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.4, 1, 0.4] 
              }}
              transition={{ 
                duration: 1, 
                repeat: Infinity, 
                ease: "easeInOut",
                delay: 0.4 
              }}
              className={styles.dot}
            />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

