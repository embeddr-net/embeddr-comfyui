// Utility to proxy requests through ComfyUI backend
// This solves CORS and Auth Header issues by delegating the request to the python server
// which attaches the key from config.json and forwards it.

export const proxyFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  let urlStr = input.toString();

  // If input is Request object, handle it (though usually it's string in our app)
  if (input instanceof Request) {
    urlStr = input.url;
  }

  // Only proxy http(s) requests
  if (urlStr.startsWith("http")) {
    const proxyUrl = `/embeddr/proxy?url=${encodeURIComponent(urlStr)}`;
    const proxyRes = await fetch(proxyUrl, init);
    if (proxyRes.status === 404 || proxyRes.status === 405) {
      console.warn("[proxyFetch] Proxy missing, falling back to direct fetch", {
        url: urlStr,
        status: proxyRes.status,
      });
      return fetch(urlStr, init);
    }
    return proxyRes; // Let ComfyUI handle the request
  }

  // Fallback to normal fetch for relative or other protocols
  return fetch(input, init);
};
