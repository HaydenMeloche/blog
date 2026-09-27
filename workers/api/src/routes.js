// api.hayden.dev entry point: maps each path to its handler. Trailing slashes
// are ignored, so /resume and /resume/ are the same route.
import { resume } from "./resume.js";
import { readForm, saveRead } from "./reads.js";

const routes = [
  { path: "/resume", methods: ["GET", "HEAD"], handler: resume },
  { path: "/reads/new", methods: ["GET"], handler: readForm },
  { path: "/reads", methods: ["POST"], handler: saveRead },
];

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
    const route = routes.find((r) => r.path === path);

    if (!route) return new Response("Not found", { status: 404 });
    if (!route.methods.includes(request.method)) {
      return new Response("Method not allowed", { status: 405, headers: { Allow: route.methods.join(", ") } });
    }
    return route.handler(request, env);
  },
};
