export default async (request) => {
  const reqUrl = new URL(request.url);
  let targetUrl = reqUrl.searchParams.get("url");

  if (!targetUrl) {
    const referer = request.headers.get("Referer");
    if (referer) {
      try {
        const refTarget = new URL(referer).searchParams.get("url");
        if (refTarget) {
          targetUrl = new URL(reqUrl.pathname + reqUrl.search, refTarget).toString();
        }
      } catch {}
    }
  }

  if (!targetUrl) {
    return new Response("Missing ?url= parameter", { status: 400 });
  }

  try {
    const target = new URL(targetUrl);
    const proxyEndpoint = `${reqUrl.origin}/.netlify/functions/proxy`;

    const init = {
      method: request.method,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": request.headers.get("Accept") || "*/*",
      },
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.arrayBuffer();
      const ct = request.headers.get("Content-Type");
      if (ct) init.headers["Content-Type"] = ct;
    }

    const response = await fetch(target.toString(), init);
    const contentType = response.headers.get("Content-Type") || "";

    const newHeaders = new Headers(response.headers);
    newHeaders.delete("X-Frame-Options");
    newHeaders.delete("Content-Security-Policy");
    newHeaders.set("Access-Control-Allow-Origin", "*");

    if (contentType.includes("text/html")) {
      let html = await response.text();
      html = html.replace(/\b(href|src|action)=(["'])(.*?)\2/gi, (match, attr, quote, link) => {
        if (
          !link ||
          link.startsWith("data:") ||
          link.startsWith("javascript:") ||
          link.startsWith("#") ||
          link.startsWith(proxyEndpoint)
        ) {
          return match;
        }
        try {
          const absolute = new URL(link, target.toString()).toString();
          return `attr={quote}proxyEndpoint?url={encodeURIComponent(absolute)}${quote}`;
        } catch {
          return match;
        }
      });

      return new Response(html, { status: response.status, headers: newHeaders });
    }

    return new Response(response.body, { status: response.status, headers: newHeaders });
  } catch (err) {
    return new Response("Proxy Error: " + err.message, { status: 500 });
  }
};


