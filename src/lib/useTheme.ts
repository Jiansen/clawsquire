import { useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';
const THEME_KEY = 'clawsquire.theme';

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem(THEME_KEY) as Theme) ?? 'system';
  });

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(THEME_KEY, t);
    setThemeState(t);
    applyTheme(t);
  }, []);

  useEffect(() => {
    applyTheme(theme);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') applyTheme('system');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const resolved = theme === 'system' ? getSystemTheme() : theme;

  return { theme, resolved, setTheme } as const;
}
