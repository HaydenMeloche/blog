const ORIGIN = "https://hayden.dev";

function requestedFormat(accept) {
  return accept.toLowerCase().includes("application/json") ? "json" : "markdown";
}

export default {
  async fetch(request) {
    const requestURL = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    if (requestURL.pathname !== "/resume" && requestURL.pathname !== "/resume/") {
      return new Response("Not found", { status: 404 });
    }

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
  },
};
