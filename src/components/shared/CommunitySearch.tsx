import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

interface LabelInfo {
  name: string;
  color: string;
}

interface SearchResult {
  number: number;
  title: string;
  html_url: string;
  state: string;
  comments: number;
  created_at: string;
  body_excerpt: string;
  labels: LabelInfo[];
}

interface SearchResponse {
  items: SearchResult[];
  total_count: number;
}

interface SmartSearchResponse {
  keywords: string;
  results: SearchResult[];
  total_count: number;
  summary: string | null;
  llm_available: boolean;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return 'today';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

const DEBOUNCE_MS = 500;

export default function CommunitySearch({ initialQuery }: { initialQuery?: string }) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [smartMode, setSmartMode] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);
  const [extractedKeywords, setExtractedKeywords] = useState<string | null>(null);
  const [searchPhase, setSearchPhase] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doBasicSearch = useCallback(async (q: string) => {
    const resp = await invoke<SearchResponse>('search_community_issues', { query: q });
    return resp;
  }, []);

  const doSmartSearch = useCallback(async (q: string) => {
    setSearchPhase(t('doctor.search.phaseKeywords'));
    const resp = await invoke<SmartSearchResponse>('smart_search', {
      query: q,
      lang: i18n.language,
    });
    setExtractedKeywords(resp.keywords !== q ? resp.keywords : null);
    if (resp.summary) {
      setSearchPhase(null);
    }
    return resp;
  }, [i18n.language, t]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      setSummary(null);
      setExtractedKeywords(null);
      return;
    }
    setLoading(true);
    setError('');
    setSearched(true);
    setSummary(null);
    setExtractedKeywords(null);
    setSearchPhase(null);
    try {
      if (smartMode) {
        const resp = await doSmartSearch(q);
        setResults(resp.results);
        setTotalCount(resp.total_count);
        setSummary(resp.summary);
        if (!resp.llm_available) {
          setSmartMode(false);
        }
      } else {
        const resp = await doBasicSearch(q);
        setResults(resp.items);
        setTotalCount(resp.total_count);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setSearchPhase(null);
    }
  }, [smartMode, doSmartSearch, doBasicSearch]);

  const handleInput = (value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!smartMode) {
      timerRef.current = setTimeout(() => doSearch(value), DEBOUNCE_MS);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (timerRef.current) clearTimeout(timerRef.current);
    doSearch(query);
  };

  return (
    <div className="space-y-3">
      {/* Mode selector */}
      <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
        <button
          onClick={() => setSmartMode(true)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
            smartMode
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ✨ {t('doctor.search.modeAI')}
        </button>
        <button
          onClick={() => setSmartMode(false)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
            !smartMode
              ? 'bg-gray-700 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🔍 {t('doctor.search.modeBasic')}
        </button>
      </div>

      {/* Search input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            {smartMode ? '✨' : '🔍'}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder={t('doctor.search.placeholder')}
            className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 py-3
                       text-sm text-gray-900 placeholder-gray-400
                       focus:border-claw-500 focus:ring-2 focus:ring-claw-500/20 transition"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-lg bg-claw-600 px-4 py-3 text-sm font-medium text-white
                     hover:bg-claw-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
          ) : (
            t('doctor.search.searchBtn')
          )}
        </button>
      </form>

      {loading && searchPhase && (
        <div className="flex items-center gap-2 text-xs text-purple-600">
          <div className="w-3 h-3 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
          {searchPhase}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}

      {searched && !loading && results.length === 0 && !error && (
        <p className="text-center text-sm text-gray-500 py-4">
          {t('doctor.search.noResults')}
        </p>
      )}

      {summary && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700 mb-2">
            ✨ {t('doctor.search.aiSummary')}
          </div>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{summary}</p>
        </div>
      )}

      {extractedKeywords && (
        <p className="text-xs text-gray-400">
          {t('doctor.search.extractedKeywords')}: <span className="text-gray-600 font-medium">{extractedKeywords}</span>
        </p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            {t('doctor.search.resultCount', { count: totalCount })}
          </p>
          {results.map((r) => (
            <button
              key={r.number}
              onClick={() => openUrl(r.html_url)}
              className="w-full text-left rounded-lg border border-gray-200 bg-white p-3
                         hover:border-claw-300 hover:bg-claw-50/30 transition group"
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-1 inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                    r.state === 'closed' ? 'bg-purple-500' : 'bg-green-500'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 group-hover:text-claw-600 transition truncate">
                    #{r.number} {r.title}
                  </div>
                  {r.body_excerpt && (
                    <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{r.body_excerpt}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-400">
                    <span className={r.state === 'closed' ? 'text-purple-500' : 'text-green-500'}>
                      {r.state === 'closed' ? t('doctor.search.resolved') : t('doctor.search.open')}
                    </span>
                    <span>{r.comments} {t('doctor.search.comments')}</span>
                    <span>{relativeTime(r.created_at)}</span>
                    {r.labels.slice(0, 2).map((l) => (
                      <span
                        key={l.name}
                        className="rounded-full px-1.5 py-0.5"
                        style={{
                          backgroundColor: `#${l.color}18`,
                          color: `#${l.color}`,
                        }}
                      >
                        {l.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-400 text-center">
        {t('doctor.search.poweredBy')}
      </p>
    </div>
  );
}
