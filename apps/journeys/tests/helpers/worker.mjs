let workerPromise;

export function getWorker() {
  if (!workerPromise) {
    const workerUrl = new URL("../../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
    workerPromise = import(workerUrl.href).then(({ default: worker }) => worker);
  }
  return workerPromise;
}

const environment = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

export async function fetchSite(path, init = {}) {
  const worker = await getWorker();
  return worker.fetch(
    new Request(new URL(path, "http://localhost"), {
      headers: { accept: "text/html", ...init.headers },
      redirect: init.redirect ?? "manual",
      ...init,
    }),
    environment,
    executionContext,
  );
}

export async function fetchHtml(path) {
  const response = await fetchSite(path);
  return { response, html: await response.text() };
}

export function htmlText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--.*?-->/gs, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
