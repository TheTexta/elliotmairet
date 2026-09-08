"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

const photoFadeInDurationMs = 300;

export function FadingImage({
  alt,
  className,
  onError,
  onLoad,
  style,
  ...props
}: ImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <Image
      {...props}
      alt={alt}
      className={`${className ?? ""} transition-opacity ease-out motion-reduce:transition-none ${
        isLoaded ? "opacity-100" : "opacity-0"
      }`}
      onError={(event) => {
        setIsLoaded(true);
        onError?.(event);
      }}
      onLoad={(event) => {
        setIsLoaded(true);
        onLoad?.(event);
      }}
      ref={(image) => {
        if (image?.complete) {
          setIsLoaded(true);
        }
      }}
      style={{ ...style, transitionDuration: `${photoFadeInDurationMs}ms` }}
    />
  );
}