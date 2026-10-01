import Link from "next/link";
export default function NotFound() {
  return (
    <main className="k-page">
      <h1>找不到此頁面 / Page not found</h1>
      <p>這個頁面尚未提供，或網址已更改。</p>
      <Link className="k-btn primary" href="/zh-HK">
        返回探索 / Back to explore
      </Link>
    </main>
  );
}
