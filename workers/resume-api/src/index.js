const ORIGIN = "https://hayden.dev";

function requestedFormat(accept) {
  const types = accept
    .toLowerCase()
    .split(",")
    .map((part) => {
      const [type, ...parameters] = part.trim().split(";");
      const quality = parameters.find((parameter) => parameter.trim().startsWith("q="));
      return {
        type,
        quality: quality ? Number.parseFloat(quality.trim().slice(2)) : 1,
      };
    })
    .filter(({ quality }) => quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { type } of types) {
    if (type === "application/json" || type === "application/*" || type === "*/*") {
      return "json";
    }
    if (type === "text/markdown" || type === "text/plain" || type === "text/*") {
      return "markdown";
    }
    if (type === "text/html") {
      return "html";
    }
  }

  return "html";
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
      html: "/resume/",
      json: "/resume/index.json",
      markdown: "/resume/index.md",
    };

    const originURL = new URL(paths[format], ORIGIN);
    const response = await fetch(originURL, {
      method: request.method,
      headers: { Accept: format === "json" ? "application/json" : format === "markdown" ? "text/markdown" : "text/html" },
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
