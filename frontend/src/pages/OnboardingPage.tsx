/**
 * OnboardingPage — Premium Multi-Step Onboarding Experience
 * 
 * Architecture: Single-page, 2-step onboarding flow
 * Step 1: Profile Setup (name, DOB, description)
 * Step 2: API Key Connections (Google, Groq, Nvidia, Deepgram)
 * 
 * Features:
 * - Auto-prefills name from OAuth providers
 * - Real API key validation against provider endpoints
 * - Persistent state (localStorage + Supabase)
 * - Framer Motion animations
 * - Full keyboard navigation & ARIA support
 * - Mobile-first responsive design
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  AlertCircle,
  X,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '../store/auth.store';
import { useOnboardingStore } from '../store/onboarding.store';
import {
  SUPPORTED_PROVIDERS,
  validateApiKey,
  getKeyName,
  type ValidationStatus,
} from '../services/providerValidation.service';
import { apiKeyService } from '../lib/api';
import { getProviderLogo, PROVIDER_COLORS } from '../components/icons/ProviderLogos';
import styles from './OnboardingPage.module.css';

// ─── Animation Variants ─────────────────────────────────
const pageVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -60 : 60,
    opacity: 0,
  }),
};

const cardAppear: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.08,
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    },
  }),
};

// ─── Validation Helpers ──────────────────────────────────
function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Name is required';
  if (trimmed.length < 2) return 'Name must be at least 2 characters';
  if (trimmed.length > 60) return 'Name must be under 60 characters';
  if (/^\s+$/.test(name)) return 'Name cannot be only spaces';
  return null;
}

function validateDOB(dateStr: string): string | null {
  if (!dateStr) return 'Date of birth is required';

  const dob = new Date(dateStr);
  const today = new Date();

  if (isNaN(dob.getTime())) return 'Invalid date';
  if (dob > today) return 'Date cannot be in the future';

  const age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate()) ? age - 1 : age;

  if (actualAge < 13) return 'You must be at least 13 years old';
  return null;
}

// ─── Component ───────────────────────────────────────────
const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    currentStep,
    profile,
    apiKeys,
    isSubmitting,
    setStep,
    setProfile,
    setApiKey,
    clearApiKey,
    completeOnboarding,
    saveStepProgress,
    prefillFromProvider,
  } = useOnboardingStore();

  // Direction for slide animation
  const [direction, setDirection] = useState(0);

  // Validation errors for Step 1
  const [nameError, setNameError] = useState<string | null>(null);
  const [dobError, setDobError] = useState<string | null>(null);
  const [nameBlurred, setNameBlurred] = useState(false);
  const [dobBlurred, setDobBlurred] = useState(false);

  // API Key validation states
  const [keyStatuses, setKeyStatuses] = useState<Record<string, ValidationStatus>>({
    google: 'idle',
    groq: 'idle',
    nvidia: 'idle',
    deepgram: 'idle',
  });
  const [keyMessages, setKeyMessages] = useState<Record<string, string>>({});
  const abortControllers = useRef<Record<string, AbortController>>({});

  // Completion state
  const [showCompletion, setShowCompletion] = useState(false);
  const [completionProgress, setCompletionProgress] = useState(0);

  // Prefill from OAuth provider data
  useEffect(() => {
    if (user?.display_name && !profile.name) {
      prefillFromProvider({ name: user.display_name });
    }
  }, [user?.display_name, profile.name, prefillFromProvider]);

  // ─── Step 1 Validation ─────────────────────────────────
  const isStep1Valid = useCallback(() => {
    return !validateName(profile.name) && !validateDOB(profile.dateOfBirth);
  }, [profile.name, profile.dateOfBirth]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setProfile({ name: val });
    if (nameBlurred) {
      setNameError(validateName(val));
    }
  };

  const handleDOBChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setProfile({ dateOfBirth: val });
    if (dobBlurred) {
      setDobError(validateDOB(val));
    }
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (val.length <= 500) {
      setProfile({ description: val });
    }
  };

  // ─── Step Navigation ───────────────────────────────────
  const goToStep2 = () => {
    // Final validation
    const nErr = validateName(profile.name);
    const dErr = validateDOB(profile.dateOfBirth);
    setNameError(nErr);
    setDobError(dErr);
    setNameBlurred(true);
    setDobBlurred(true);

    if (nErr || dErr) return;

    setDirection(1);
    setStep(2);
    if (user) {
      saveStepProgress(user.id, 1);
    }
  };

  const goToStep1 = () => {
    setDirection(-1);
    setStep(1);
  };

  // ─── API Key Validation (Debounced) ────────────────────
  const validateKey = useCallback(
    async (provider: string, key: string) => {
      // Abort any previous validation
      if (abortControllers.current[provider]) {
        abortControllers.current[provider].abort();
      }

      if (!key || key.trim().length === 0) {
        setKeyStatuses(prev => ({ ...prev, [provider]: 'idle' }));
        setKeyMessages(prev => ({ ...prev, [provider]: '' }));
        return;
      }

      const controller = new AbortController();
      abortControllers.current[provider] = controller;

      setKeyStatuses(prev => ({ ...prev, [provider]: 'validating' }));
      setKeyMessages(prev => ({ ...prev, [provider]: '' }));

      const result = await validateApiKey(provider, key, controller.signal);

      if (!controller.signal.aborted) {
        setKeyStatuses(prev => ({ ...prev, [provider]: result.status }));
        setKeyMessages(prev => ({ ...prev, [provider]: result.message }));
      }
    },
    []
  );

  // Debounce timers
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleKeyChange = (provider: string, value: string) => {
    setApiKey(provider as keyof typeof apiKeys, value);

    // Clear previous debounce
    if (debounceTimers.current[provider]) {
      clearTimeout(debounceTimers.current[provider]);
    }

    // Reset state immediately if empty
    if (!value.trim()) {
      setKeyStatuses(prev => ({ ...prev, [provider]: 'idle' }));
      setKeyMessages(prev => ({ ...prev, [provider]: '' }));
      return;
    }

    // Debounce validation (800ms)
    debounceTimers.current[provider] = setTimeout(() => {
      validateKey(provider, value);
    }, 800);
  };

  const handleClearKey = (provider: string) => {
    clearApiKey(provider as keyof typeof apiKeys);
    setKeyStatuses(prev => ({ ...prev, [provider]: 'idle' }));
    setKeyMessages(prev => ({ ...prev, [provider]: '' }));

    // Abort any pending validation
    if (abortControllers.current[provider]) {
      abortControllers.current[provider].abort();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(abortControllers.current).forEach(c => c.abort());
      Object.values(debounceTimers.current).forEach(t => clearTimeout(t));
    };
  }, []);

  // ─── Complete Onboarding ───────────────────────────────
  const handleFinish = async () => {
    if (!user) return;

    // Save valid API keys first
    const savePromises: Promise<any>[] = [];
    for (const provider of SUPPORTED_PROVIDERS) {
      const key = apiKeys[provider.id as keyof typeof apiKeys];
      const status = keyStatuses[provider.id];

      if (key && key.trim() && status === 'valid') {
        savePromises.push(
          apiKeyService.saveKey({
            name: getKeyName(provider.id),
            provider: provider.id,
            key: key.trim(),
          })
        );
      }
    }

    try {
      // Save any valid keys in parallel
      if (savePromises.length > 0) {
        await Promise.allSettled(savePromises);
      }

      // Complete onboarding
      const success = await completeOnboarding(user.id);

      if (success) {
        // Show completion animation
        setShowCompletion(true);

        // Animate progress bar
        setTimeout(() => setCompletionProgress(100), 200);

        // Navigate to app after animation
        setTimeout(() => {
          // Update auth store with onboarding_completed
          useAuthStore.getState().setUser({
            ...user,
            display_name: profile.name.trim(),
            onboarding_completed: true,
          });
          navigate('/chat', { replace: true });
        }, 2200);
      }
    } catch (error) {
      console.error('[Onboarding] Error completing:', error);
    }
  };

  const handleSkip = async () => {
    // Skip API keys entirely, just complete
    if (!user) return;

    const success = await completeOnboarding(user.id);
    if (success) {
      setShowCompletion(true);
      setTimeout(() => setCompletionProgress(100), 200);
      setTimeout(() => {
        useAuthStore.getState().setUser({
          ...user,
          display_name: profile.name.trim(),
          onboarding_completed: true,
        });
        navigate('/chat', { replace: true });
      }, 2200);
    }
  };

  // ─── Check for any invalid keys that should block save
  const hasAnyInvalidKey = Object.entries(apiKeys).some(
    ([provider, key]) => key.trim() && keyStatuses[provider] === 'invalid'
  );

  const hasAnyValidatingKey = Object.values(keyStatuses).some(s => s === 'validating');

  // ─── Completion Screen ─────────────────────────────────
  if (showCompletion) {
    return (
      <div className={styles.completionContainer}>
        <div className={styles.ambientBg} />
        <motion.div
          className={styles.completionContent}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
          <motion.div
            className={styles.completionCheck}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 20,
              delay: 0.15,
            }}
          >
            <Check size={36} color="#10B981" strokeWidth={3} />
          </motion.div>

          <motion.h1
            className={styles.completionTitle}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            Setup Complete
          </motion.h1>

          <motion.p
            className={styles.completionSubtitle}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            Your workspace is ready.
          </motion.p>

          <motion.div
            className={styles.completionProgress}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.65 }}
          >
            <motion.div
              className={styles.completionProgressFill}
              initial={{ width: '0%' }}
              animate={{ width: `${completionProgress}%` }}
              transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
            />
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // ─── Character counter helper ──────────────────────────
  const descLength = profile.description.length;
  const charCounterClass =
    descLength >= 500
      ? styles.charCounterError
      : descLength >= 450
        ? styles.charCounterWarning
        : styles.charCounter;

  // ─── Render ────────────────────────────────────────────
  return (
    <div className={styles.onboardingContainer}>
      <div className={styles.ambientBg} />

      <div className={styles.onboardingCard}>
        <div className={styles.cardInner}>
          {/* Brand */}
          <div className={styles.brandSection}>
            <div className={styles.logoMark}>
              <img
                src="/Sree-Ai-icon-only-Sree-AI-brandmark.png"
                alt="Sree AI logo"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
            <span className={styles.brandTitle}>Sree AI</span>
          </div>

          {/* Progress */}
          <div className={styles.progressSection}>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: currentStep === 1 ? '50%' : '100%' }}
              />
            </div>
            <span className={styles.progressLabel}>
              Step {currentStep} of 2
            </span>
          </div>

          {/* Steps */}
          <AnimatePresence mode="wait" custom={direction}>
            {currentStep === 1 ? (
              <motion.div
                key="step1"
                custom={direction}
                variants={pageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                {/* Step 1: Profile Setup */}
                <div className={styles.stepHeader}>
                  <h1 className={styles.stepTitle}>Tell us about yourself</h1>
                  <p className={styles.stepSubtitle}>
                    Help us personalize your experience.
                  </p>
                </div>

                {/* Name */}
                <div className={styles.formGroup}>
                  <label htmlFor="onboard-name" className={styles.formLabel}>
                    Name <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="onboard-name"
                    type="text"
                    className={`${styles.formInput} ${nameError && nameBlurred ? styles.formInputError : ''}`}
                    value={profile.name}
                    onChange={handleNameChange}
                    onBlur={() => {
                      setNameBlurred(true);
                      setNameError(validateName(profile.name));
                    }}
                    placeholder="Your full name"
                    autoComplete="name"
                    autoFocus
                    aria-required="true"
                    aria-invalid={!!nameError}
                    aria-describedby={nameError ? 'name-error' : undefined}
                  />
                  {nameError && nameBlurred && (
                    <div className={styles.fieldError} id="name-error" role="alert">
                      <AlertCircle size={13} />
                      {nameError}
                    </div>
                  )}
                </div>

                {/* Date of Birth */}
                <div className={styles.formGroup}>
                  <label htmlFor="onboard-dob" className={styles.formLabel}>
                    Date of Birth <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="onboard-dob"
                    type="date"
                    className={`${styles.dateInput} ${dobError && dobBlurred ? styles.formInputError : ''}`}
                    value={profile.dateOfBirth}
                    onChange={handleDOBChange}
                    onBlur={() => {
                      setDobBlurred(true);
                      setDobError(validateDOB(profile.dateOfBirth));
                    }}
                    max={new Date().toISOString().split('T')[0]}
                    aria-required="true"
                    aria-invalid={!!dobError}
                    aria-describedby={dobError ? 'dob-error' : undefined}
                  />
                  {dobError && dobBlurred && (
                    <div className={styles.fieldError} id="dob-error" role="alert">
                      <AlertCircle size={13} />
                      {dobError}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className={styles.formGroup}>
                  <label htmlFor="onboard-desc" className={styles.formLabel}>
                    Describe Yourself{' '}
                    <span className={styles.optional}>Optional</span>
                  </label>
                  <textarea
                    id="onboard-desc"
                    className={styles.formTextarea}
                    value={profile.description}
                    onChange={handleDescriptionChange}
                    placeholder="Student interested in AI, building SaaS products, software engineer..."
                    maxLength={500}
                    rows={3}
                    aria-describedby="desc-counter"
                  />
                  <div className={charCounterClass} id="desc-counter">
                    {descLength}/500
                  </div>
                </div>

                {/* Next Button */}
                <div className={styles.buttonRow}>
                  <button
                    className={styles.btnPrimary}
                    onClick={goToStep2}
                    disabled={!isStep1Valid()}
                    aria-label="Continue to step 2"
                  >
                    Continue
                    <ArrowRight size={16} />
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step2"
                custom={direction}
                variants={pageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                {/* Step 2: API Key Connections */}
                <div className={styles.stepHeader}>
                  <h1 className={styles.stepTitle}>
                    Connect Your AI Providers
                  </h1>
                  <p className={styles.stepSubtitle}>
                    Bring your own API keys or skip for now.
                  </p>
                </div>

                <div className={styles.providerCards}>
                  {SUPPORTED_PROVIDERS.map((provider, index) => {
                    const key =
                      apiKeys[provider.id as keyof typeof apiKeys] || '';
                    const status = keyStatuses[provider.id] || 'idle';
                    const message = keyMessages[provider.id] || '';
                    const providerColor =
                      PROVIDER_COLORS[provider.id] || '#6366f1';

                    return (
                      <motion.div
                        key={provider.id}
                        className={styles.providerCard}
                        custom={index}
                        variants={cardAppear}
                        initial="hidden"
                        animate="visible"
                      >
                        <div className={styles.providerCardHeader}>
                          <div
                            className={styles.providerLogo}
                            style={{
                              background: `${providerColor}12`,
                              border: `1px solid ${providerColor}25`,
                            }}
                          >
                            {getProviderLogo(provider.id, 22)}
                          </div>
                          <div className={styles.providerInfo}>
                            <h4 className={styles.providerName}>
                              {provider.name}
                            </h4>
                            <p className={styles.providerDesc}>
                              {provider.description}
                            </p>
                          </div>
                        </div>

                        <div className={styles.keyInputWrapper}>
                          <input
                            type="password"
                            className={`${styles.keyInput} ${status === 'valid'
                                ? styles.keyInputValid
                                : status === 'invalid'
                                  ? styles.keyInputInvalid
                                  : ''
                              }`}
                            value={key}
                            onChange={(e) =>
                              handleKeyChange(provider.id, e.target.value)
                            }
                            placeholder={provider.placeholder}
                            autoComplete="off"
                            aria-label={`${provider.name} API key`}
                            aria-describedby={
                              message
                                ? `${provider.id}-validation`
                                : undefined
                            }
                          />

                          {/* Clear button */}
                          {key.trim() && status !== 'validating' && (
                            <button
                              className={styles.clearKeyBtn}
                              onClick={() => handleClearKey(provider.id)}
                              aria-label={`Clear ${provider.name} key`}
                              type="button"
                            >
                              <X size={14} />
                            </button>
                          )}

                          {/* Status indicator */}
                          {status === 'validating' && (
                            <div className={styles.statusValidating}>
                              <Loader2 size={18} color={providerColor} />
                            </div>
                          )}
                          {status === 'valid' && (
                            <div className={styles.statusValid}>
                              <Check size={18} />
                            </div>
                          )}
                          {status === 'invalid' && (
                            <div className={styles.statusInvalid}>
                              <AlertCircle size={18} />
                            </div>
                          )}
                        </div>

                        {/* Validation message */}
                        {message && (
                          <div
                            id={`${provider.id}-validation`}
                            className={
                              status === 'valid'
                                ? styles.validationValid
                                : styles.validationInvalid
                            }
                            role="status"
                          >
                            {message}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                <p className={styles.skipHint}>
                  You can add or manage API keys later from Settings.
                </p>

                {/* Buttons */}
                <div className={styles.buttonRow}>
                  <button
                    className={styles.btnSecondary}
                    onClick={goToStep1}
                    aria-label="Go back to step 1"
                    type="button"
                  >
                    <ArrowLeft size={16} />
                    Back
                  </button>

                  <button
                    className={styles.btnPrimary}
                    onClick={handleFinish}
                    disabled={
                      isSubmitting ||
                      hasAnyInvalidKey ||
                      hasAnyValidatingKey
                    }
                    aria-label="Complete onboarding setup"
                    type="button"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={16} className={styles.statusValidating} />
                        Setting up...
                      </>
                    ) : (
                      <>
                        Get Started
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </div>

                {/* Skip button */}
                {!isSubmitting && (
                  <div style={{ textAlign: 'center', marginTop: 12 }}>
                    <button
                      className={styles.btnSkip}
                      onClick={handleSkip}
                      type="button"
                    >
                      Skip for now
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default OnboardingPage;
