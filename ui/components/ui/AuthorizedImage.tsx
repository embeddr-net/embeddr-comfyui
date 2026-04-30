import React, { useEffect, useRef, useState } from "react";
import { cn } from "@embeddr/react-ui";

interface AuthorizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  fallbackSrc?: string;
  authHeader?: Record<string, string>;
  apiKey?: string;
}

export function AuthorizedImage({
  src,
  fallbackSrc,
  className,
  alt,
  authHeader,
  apiKey,
  ...props
}: AuthorizedImageProps) {
  // Switch to Proxy strategy for robustness against CORS and Auth issues.
  const isEmbeddrUrl =
    src.includes("/api/v") && (src.includes("/artifacts") || src.includes("/content"));
  const shouldUseProxy = (!!apiKey || isEmbeddrUrl) && src.startsWith("http");
  const proxySrc = shouldUseProxy ? `/embeddr/proxy?url=${encodeURIComponent(src)}` : src;

  const [error, setError] = useState(false);

  if (error && fallbackSrc) {
    return <img src={fallbackSrc} alt={alt} className={className} {...props} />;
  }

  return (
    <img
      src={proxySrc}
      alt={alt}
      className={className}
      onError={(e) => {
        if (fallbackSrc) e.currentTarget.src = fallbackSrc;
        setError(true);
      }}
      {...props}
    />
  );
}
