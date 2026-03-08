import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

let tauriWindow: { setTitle: (title: string) => Promise<void> } | null = null;

async function getTauriWindow() {
  if (tauriWindow) return tauriWindow;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    tauriWindow = getCurrentWindow();
    return tauriWindow;
  } catch {
    return null;
  }
}

export function useWindowTitle() {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const title = t('app.localizedName');
    document.title = title;

    getTauriWindow().then((win) => {
      win?.setTitle(title);
    });
  }, [t, i18n.language]);
}
