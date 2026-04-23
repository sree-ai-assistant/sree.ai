import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
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

const videoProcessingTerms = [
  'Ai is Processing the video',
  'Getting The best Results for You',
  'Analyzing visual patterns',
  'Generating insights',
  'Refining response'
];

export const ThinkingAnimation: React.FC<{ status?: string | null, isVideo?: boolean }> = ({ status, isVideo }) => {
  const [index, setIndex] = useState(0);
  const [isVideoPhase, setIsVideoPhase] = useState(false);
  const [showSpecialMessage, setShowSpecialMessage] = useState(false);

  useEffect(() => {
    let cycleTimeout: number;

    const startNormal = () => {
      setShowSpecialMessage(false);
      cycleTimeout = window.setTimeout(startSpecial, 120000); // 2 minutes normal
    };

    const startSpecial = () => {
      setShowSpecialMessage(true);
      cycleTimeout = window.setTimeout(startNormal, 30000); // 30 seconds special
    };

    // Initial cycle: start normal, transition to special after 2 mins
    cycleTimeout = window.setTimeout(startSpecial, 120000);

    return () => window.clearTimeout(cycleTimeout);
  }, []);

  useEffect(() => {
    if (isVideo && status?.includes('Frames extracted and uploaded')) {
      setIsVideoPhase(true);
      setIndex(0); // Reset index for new terms
    }
  }, [status, isVideo]);

  useEffect(() => {
    // If we have a status that is NOT the video completion one, show it statically
    if (status && !status.includes('Frames extracted and uploaded')) {
      setIsVideoPhase(false);
      return;
    }

    if (showSpecialMessage) return;

    const currentTerms = isVideoPhase ? videoProcessingTerms : thinkingTerms;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % currentTerms.length);
    }, 6000); // 1.5s fade in + 3s stay + 1.5s fade out = 6s total cycle
    return () => window.clearInterval(timer);
  }, [status, isVideoPhase, showSpecialMessage]);

  const currentTerms = isVideoPhase ? videoProcessingTerms : thinkingTerms;
  let displayContent = '';

  if (showSpecialMessage) {
    displayContent = "You have chosen a Thinking Model, So Be Patient & Let it Cook !";
  } else if (status && !isVideoPhase) {
    displayContent = status;
  } else {
    displayContent = currentTerms[index];
  }

  const textVariants: Variants = {
    hidden: { 
      opacity: 0,
      x: -30,
      filter: 'blur(8px)'
    },
    visible: { 
      opacity: 1, 
      x: 0,
      filter: 'blur(0px)',
      transition: { 
        duration: 1.5,
        ease: [0.22, 1, 0.36, 1]
      }
    },
    exit: { 
      opacity: 0, 
      x: 30,
      filter: 'blur(8px)',
      transition: { 
        duration: 1.5,
        ease: [0.64, 0, 0.78, 0]
      }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.textWrapper}>
          <AnimatePresence mode="wait">
            <motion.div
              key={displayContent}
              className={styles.text}
              variants={textVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <span className={styles.neonText}>{displayContent}</span>
              <div className={styles.waveOverlay} />
            </motion.div>
          </AnimatePresence>
        </div>
        <div className={styles.dots}>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.4, 1, 0.4]
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.2
              }}
              className={styles.dot}
            />
          ))}
        </div>
      </div>
    </div>
  );
};


