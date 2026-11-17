import { useEffect, useRef, useState } from 'react';
import { createAnalysis, loadAnalysis, loadRecentAnalyses } from './analysis.api.js';

// Owns review requests and cancellation; page components only render state.
export default function useReviewWorkspace(route, onNavigate) {
  const [pullRequestUrl, setPullRequestUrl] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [recentAnalyses, setRecentAnalyses] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportError, setReportError] = useState(null);
  const [reportReload, setReportReload] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [historyStatus, setHistoryStatus] = useState('loading');
  const [historyError, setHistoryError] = useState('');
  const activeRequest = useRef(0);
  const historyRequest = useRef(0);
  const reviewRequest = useRef(null);
  const currentRoute = useRef(route);
  currentRoute.current = route;
  const startedAt = useRef(0);
  const [receivedStages, setReceivedStages] = useState([]);
  const progressStage = receivedStages.at(-1) || 'connecting';
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  async function refreshHistory() {
    const sequence = ++historyRequest.current;
    setHistoryStatus('loading');
    setHistoryError('');
    try {
      const results = await loadRecentAnalyses();
      if (sequence !== historyRequest.current) return;
      // A report created while history was loading must not disappear.
      setRecentAnalyses((current) =>
        [...new Map([...current, ...results].map((item) => [item.id, item])).values()]
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 20),
      );
      setHistoryStatus('ready');
    } catch (error) {
      if (sequence !== historyRequest.current) return;
      setHistoryError(error.message);
      setHistoryStatus('error');
    }
  }

  useEffect(() => {
    refreshHistory();
    return () => {
      historyRequest.current++;
      activeRequest.current++;
      reviewRequest.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isSubmitting) return;
    const timer = setInterval(
      () => setElapsedSeconds(Math.floor((performance.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [isSubmitting]);

  async function submitAnalysis(event) {
    event.preventDefault();
    if (reviewRequest.current) return;
    const sequence = ++activeRequest.current;
    const controller = new AbortController();
    reviewRequest.current = controller;
    startedAt.current = performance.now();
    setElapsedSeconds(0);
    setReceivedStages([]);
    setErrorMessage('');
    setIsSubmitting(true);
    let acceptedId;
    try {
      const result = await createAnalysis(pullRequestUrl.trim(), {
        signal: controller.signal,
        onAccepted: (id) => {
          acceptedId = id;
          controller.analysisId = id;
          if (sequence === activeRequest.current) {
            setReportError(null);
            onNavigate?.('/analyses/' + encodeURIComponent(id));
          }
        },
        onProgress: (stage) => {
          controller.stage = stage;
          if (
            sequence === activeRequest.current &&
            (!acceptedId || currentRoute.current.analysisId === acceptedId)
          )
            setReceivedStages((current) => [...current, stage]);
        },
      });
      if (sequence !== activeRequest.current) return;
      if (!acceptedId || currentRoute.current.analysisId === result.id) setAnalysis(result);
      setRecentAnalyses((current) =>
        [result, ...current.filter((item) => item.id !== result.id)].slice(0, 20),
      );
      if (!acceptedId && currentRoute.current.page === 'overview')
        onNavigate?.('/analyses/' + encodeURIComponent(result.id));
    } catch (error) {
      if (sequence === activeRequest.current) {
        setErrorMessage(error.message);
        if (acceptedId && currentRoute.current.analysisId === acceptedId)
          setReportError({ analysisId: acceptedId, message: error.message });
        refreshHistory();
      }
    } finally {
      if (reviewRequest.current === controller) reviewRequest.current = null;
      if (sequence === activeRequest.current) setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (route.page !== 'review' || analysis?.id === route.analysisId) return;
    if (reviewRequest.current?.analysisId === route.analysisId) {
      setReceivedStages([reviewRequest.current.stage || 'queued']);
      return;
    }
    setReportError(null);
    setReceivedStages([]);
    const controller = new AbortController();
    loadAnalysis(route.analysisId, {
      signal: controller.signal,
      onProgress: (stage) => {
        if (!controller.signal.aborted) setReceivedStages((current) => [...current, stage]);
      },
    })
      .then((result) => {
        if (!controller.signal.aborted) setAnalysis(result);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setReportError({ analysisId: route.analysisId, message: error.message });
      });
    return () => controller.abort();
  }, [route.page, route.analysisId, analysis?.id, reportReload]);
  return {
    pullRequestUrl,
    setPullRequestUrl,
    recentAnalyses,
    isSubmitting,
    reportError,
    setReportReload,
    errorMessage,
    historyStatus,
    historyError,
    receivedStages,
    progressStage,
    elapsedSeconds,
    refreshHistory,
    submitAnalysis,
    analysis,
  };
}
