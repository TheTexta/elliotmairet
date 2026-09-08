"use client";

import { getImageProps, type ImageProps } from "next/image";
import { useCallback } from "react";
import { preload } from "react-dom";

type TransitionReadyImageProps = Omit<
  ImageProps,
  "onError" | "onLoad" | "onLoadingComplete" | "placeholder" | "preload"
> & {
  preloadImage?: boolean;
  previewSizes: string;
};

const photoFadeInDurationMs = 300;

function hasActiveViewTransition() {
  try {
    return document.documentElement.matches(":active-view-transition");
  } catch {
    return false;
  }
}

export function TransitionReadyImage({
  preloadImage = false,
  previewSizes,
  ...imageProps
}: TransitionReadyImageProps) {
  const { props } = getImageProps(imageProps);
  const { props: previewProps } = getImageProps({
    ...imageProps,
    alt: "",
    fetchPriority: "auto",
    loading: "eager",
    quality: 74,
    sizes: previewSizes,
  });

  if (preloadImage) {
    preload(props.src, {
      as: "image",
      crossOrigin: props.crossOrigin,
      fetchPriority: props.fetchPriority,
      imageSizes: props.sizes,
      imageSrcSet: props.srcSet,
    });
  }

  const attachImage = useCallback((image: HTMLImageElement | null) => {
    if (!image) {
      return;
    }

    const currentImage = image;

    function revealImage() {
      currentImage.removeEventListener("error", revealImage);
      currentImage.removeEventListener("load", revealImage);

      if (hasActiveViewTransition()) {
        currentImage.style.transitionDuration = "0ms";
      }

      currentImage.classList.remove("opacity-0");
      currentImage.classList.add("opacity-100");
    }

    if (currentImage.complete) {
      revealImage();
      return;
    }

    currentImage.addEventListener("error", revealImage, { once: true });
    currentImage.addEventListener("load", revealImage, { once: true });

    return () => {
      currentImage.removeEventListener("error", revealImage);
      currentImage.removeEventListener("load", revealImage);
    };
  }, []);

  return (
    <span className="relative flex h-full w-full items-center justify-center">
      {/* This preview reuses the selected gallery thumbnail in the browser cache. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        aria-hidden="true"
        alt=""
        className={previewProps.className}
        crossOrigin={previewProps.crossOrigin}
        decoding={previewProps.decoding}
        fetchPriority={previewProps.fetchPriority}
        height={previewProps.height}
        loading={previewProps.loading}
        sizes={previewProps.sizes}
        src={previewProps.src}
        srcSet={previewProps.srcSet}
        style={previewProps.style}
        width={previewProps.width}
      />
      {/* This native image intentionally avoids React onLoad so ViewTransition */}
      {/* can wait for it. getImageProps supplies Next's optimized image URLs. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={props.alt}
        className={`${props.className ?? ""} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity ease-out motion-reduce:transition-none`}
        crossOrigin={props.crossOrigin}
        decoding={props.decoding}
        fetchPriority={props.fetchPriority}
        height={props.height}
        loading={props.loading}
        ref={attachImage}
        sizes={props.sizes}
        src={props.src}
        srcSet={props.srcSet}
        style={{
          ...props.style,
          transitionDuration: `${photoFadeInDurationMs}ms`,
        }}
        width={props.width}
      />
    </span>
  );
}
