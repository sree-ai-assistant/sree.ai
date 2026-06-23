import React from 'react';
import styles from './LoadingScreen.module.css';

const LoadingScreen: React.FC = () => {
  return (
    <div className={styles.container}>
      <div className={styles.videoWrapper}>
        <video
          className={styles.video}
          src="/Sree-Ai-logo-Animation.mp4"
          autoPlay
          loop
          muted
          playsInline
        />
      </div>
    </div>
  );
};

export default LoadingScreen;
