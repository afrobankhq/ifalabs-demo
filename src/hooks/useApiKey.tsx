'use client';

import { useState, useEffect } from 'react';
import apiService from '@/lib/api';

/**
 * Hook for managing the Oracle Engine API key
 * Provides methods to set, remove, and check if an API key exists
 */
export const useApiKey = () => {
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);

  // Load API key on mount (check localStorage first, then env)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Check localStorage first (user preference)
      const storedKey = localStorage.getItem('oracle_api_key');
      if (storedKey) {
        setApiKeyState(storedKey);
        setHasKey(true);
      } else {
        // Fall back to environment variable
        const envKey = process.env.NEXT_PUBLIC_ORACLE_API_KEY;
        if (envKey) {
          setApiKeyState(envKey);
          setHasKey(true);
        } else {
          setApiKeyState(null);
          setHasKey(false);
        }
      }
    }
  }, []);

  // Set API key (stores in localStorage, overriding env var)
  const setApiKey = (key: string) => {
    apiService.setApiKey(key);
    setApiKeyState(key);
    setHasKey(true);
  };

  // Remove API key
  const removeApiKey = () => {
    apiService.removeApiKey();
    // After removing, check if we should fall back to env
    if (typeof window !== 'undefined') {
      const envKey = process.env.NEXT_PUBLIC_ORACLE_API_KEY;
      if (envKey) {
        setApiKeyState(envKey);
        setHasKey(true);
      } else {
        setApiKeyState(null);
        setHasKey(false);
      }
    }
  };

  // Check if API key exists (reactive check)
  useEffect(() => {
    setHasKey(apiService.hasApiKey());
  }, [apiKey]);

  // Determine if currently using env variable
  const isFromEnv = typeof window !== 'undefined' && 
                    !!process.env.NEXT_PUBLIC_ORACLE_API_KEY && 
                    !localStorage.getItem('oracle_api_key') &&
                    apiKey === process.env.NEXT_PUBLIC_ORACLE_API_KEY;

  return {
    apiKey,
    hasApiKey: hasKey,
    setApiKey,
    removeApiKey,
    isFromEnv,
  };
};

export default useApiKey;

