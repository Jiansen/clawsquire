import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface InfoTooltipProps {
  conceptKey: string;
  inline?: boolean;
}

export default function InfoTooltip({ conceptKey, inline }: InfoTooltipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const title = t(`concepts.${conceptKey}.title`);
  const explanation = t(`concepts.${conceptKey}.explanation`);
  const tip = t(`concepts.${conceptKey}.tip`);

  return (
    <span className={`relative ${inline ? 'inline-flex' : ''}`} ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs
                   bg-claw-100 text-claw-600 hover:bg-claw-200 transition-colors
                   focus:outline-none focus:ring-2 focus:ring-claw-400"
        aria-label={title}
      >
        ℹ
      </button>
      {open && (
        <div
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2
                     w-72 rounded-xl bg-white shadow-lg border border-gray-200 p-4
                     animate-in fade-in slide-in-from-bottom-1"
        >
          <h4 className="font-semibold text-gray-900 text-sm mb-2">{title}</h4>
          <p className="text-sm text-gray-600 leading-relaxed mb-3">{explanation}</p>
          <div className="flex items-start gap-2 bg-claw-50 rounded-lg p-2.5">
            <span className="text-claw-500 text-xs mt-0.5">💡</span>
            <p className="text-xs text-claw-700 leading-relaxed">{tip}</p>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
            <div className="w-2 h-2 bg-white border-r border-b border-gray-200 rotate-45" />
          </div>
        </div>
      )}
    </span>
  );
}
