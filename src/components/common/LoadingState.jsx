export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="loading">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBanner({ message }) {
  return <div className="error-banner">{message}</div>;
}
