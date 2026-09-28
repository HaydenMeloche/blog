// GET /resume: proxies the résumé from hayden.dev as JSON, or as Markdown
// when the request's Accept header asks for text/markdown.
const ORIGIN = "https://hayden.dev";

function requestedFormat(accept) {
  return accept.toLowerCase().includes("text/markdown") ? "markdown" : "json";
}

export async function resume(request) {
  const format = requestedFormat(request.headers.get("Accept") || "");
  const paths = {
    json: "/resume/index.json",
    markdown: "/resume/index.md",
  };

  const originURL = new URL(paths[format], ORIGIN);
  const response = await fetch(originURL, {
    method: request.method,
    headers: { Accept: format === "json" ? "application/json" : "text/markdown" },
  });

  const headers = new Headers(response.headers);
  headers.set("Vary", "Accept");
  headers.set("Access-Control-Allow-Origin", "*");

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
