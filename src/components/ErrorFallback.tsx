interface ErrorFallbackProps {
  error: Error;
  onReset: () => void;
}

export function ErrorFallback({ error, onReset }: ErrorFallbackProps) {
  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="error-fallback">
      <div className="error-fallback-content">
        <h1 className="error-fallback-title">エラーが発生しました</h1>
        <p className="error-fallback-message">
          予期しないエラーが発生しました。アプリを再読み込みしてください。
        </p>
        <details className="error-fallback-details">
          <summary>エラー詳細</summary>
          <pre className="error-fallback-stack">{error.message}{error.stack ? `\n${error.stack}` : ''}</pre>
        </details>
        <div className="error-fallback-actions">
          <button type="button" className="btn-primary" onClick={handleReload}>
            再読み込み
          </button>
          <button type="button" className="btn-secondary" onClick={onReset}>
            リセットして続行
          </button>
        </div>
      </div>
    </div>
  );
}
