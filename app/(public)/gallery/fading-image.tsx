"use client";

import { getImageProps, type ImageProps } from "next/image";

import photographImageLoader from "@/lib/photographs/image-loader";

export function FadingImage(props: ImageProps) {
  // Keep the generated srcset out of the serialized component payload. Loading
  // and fading are handled by the native image and the delegated head script.
  const { props: imageProps } = getImageProps({
    ...props,
    loader: photographImageLoader,
  });

  return (
    // getImageProps supplies the same optimized responsive sources as next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...imageProps}
      alt={props.alt}
      data-photograph=""
      style={props.style}
    />
  );
}
