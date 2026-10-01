"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="k-page">
      <h1>暫時未能載入 / Could not load this page</h1>
      <p>請重試。已儲存的本機行程不會被清除。</p>
      <button className="k-btn primary" onClick={reset}>
        重試 / Retry
      </button>
    </main>
  );
}
