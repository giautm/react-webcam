import * as React from "react";

import { canGetUserMedia, requestUserMediaAsync } from "./UserMediaManager";

type ImageFormat = "image/webp" | "image/png" | "image/jpeg";

export interface WebcamProps extends React.HTMLProps<HTMLVideoElement> {
  audio: boolean;
  audioConstraints?: MediaStreamConstraints["audio"];
  forceScreenshotSourceSize?: boolean;
  imageSmoothing: boolean;
  minScreenshotHeight?: number;
  minScreenshotWidth?: number;
  mirrored?: boolean;
  onUserMedia: () => void;
  onUserMediaError: (error: string) => void;
  screenshotFormat: ImageFormat;
  screenshotQuality: number;
  videoConstraints?: MediaStreamConstraints["video"];
}

type ScreenshotOptions = {
  format: ImageFormat;
  quality: number;
  imageSmoothing?: boolean;
  mirrored?: boolean;
};

type WebcamRef = {
  getScreenshot(): string | null;
};

function Webcam(props: WebcamProps, ref: React.Ref<WebcamRef>) {
  const {
    audio = true,
    forceScreenshotSourceSize = false,
    imageSmoothing = true,
    mirrored = false,
    screenshotFormat = "image/webp",
    screenshotQuality = 0.92,

    onUserMedia,
    onUserMediaError,
    minScreenshotWidth,
    minScreenshotHeight,
    audioConstraints,
    videoConstraints,
    style = {},
    ...rest
  } = props;
  const refVideo = React.useRef<HTMLVideoElement | null>(null);
  const [src, setSource] = React.useState<string>();
  const hasUserMedia = React.useRef(false);
  const getScreenshot = React.useMemo(() => {
    // We cache context and canvas inside the closure to reuse.
    const caches: {
      canvas?: HTMLCanvasElement;
      ctx?: CanvasRenderingContext2D | null;
    } = {};
    return (opts: ScreenshotOptions) => {
      const video = refVideo.current;
      if (!video || !video.videoHeight) {
        return null;
      }

      if (!caches.ctx) {
        const { clientWidth, videoHeight, videoWidth } = video;
        let canvasHeight = videoHeight;
        let canvasWidth = videoWidth;
        if (!forceScreenshotSourceSize) {
          const aspectRatio = videoWidth / videoHeight;
          canvasWidth = minScreenshotWidth || clientWidth;
          canvasHeight = canvasWidth / aspectRatio;
          if (minScreenshotHeight && canvasHeight < minScreenshotHeight) {
            canvasHeight = minScreenshotHeight;
            canvasWidth = canvasHeight * aspectRatio;
          }
        }

        caches.canvas = document.createElement("canvas");
        caches.canvas.height = canvasHeight;
        caches.canvas.width = canvasWidth;

        caches.ctx = caches.canvas.getContext("2d");
      }

      const { canvas, ctx } = caches;
      if (canvas && ctx) {
        // mirror the screenshot
        if (opts.mirrored) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }

        ctx.imageSmoothingEnabled = opts.imageSmoothing ?? true;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // invert mirroring
        if (opts.mirrored) {
          ctx.scale(-1, 1);
          ctx.translate(-canvas.width, 0);
        }

        return canvas.toDataURL(opts.format, opts.quality);
      }

      return null;
    };
  }, [forceScreenshotSourceSize, minScreenshotHeight, minScreenshotWidth]);
  React.useEffect(() => {
    return () => {
      if (src) {
        window.URL.revokeObjectURL(src);
      }
    };
  }, [src]);
  React.useEffect(() => {
    if (!canGetUserMedia()) {
      onUserMediaError?.("getUserMedia not supported");
      return;
    }

    let stream: MediaStream | undefined;
    (async () => {
      try {
        stream = await requestUserMediaAsync({
          audio: audioConstraints,
          video: videoConstraints,
        }, !audio);
        try {
          if (refVideo.current) {
            refVideo.current.srcObject = stream;
          }
        } catch (e) {
          setSource(window.URL.createObjectURL(stream));
        } finally {
          hasUserMedia.current = true;
          onUserMedia?.();
        }
      } catch (e) {
        onUserMediaError?.(e);
      }
    })();

    return () => {
      if (stream) {
        if (stream.getVideoTracks && stream.getAudioTracks) {
          stream.getVideoTracks().map((track) => track.stop());
          stream.getAudioTracks().map((track) => track.stop());
        } else {
          const mst = (stream as unknown) as MediaStreamTrack;
          if (typeof mst.stop !== "undefined") {
            mst.stop();
          }
        }
      }
    };
  }, [audio, audioConstraints, videoConstraints]);
  React.useImperativeHandle(
    ref,
    () => ({
      getScreenshot() {
        if (!hasUserMedia.current) {
          return null;
        }

        return getScreenshot({
          format: screenshotFormat,
          imageSmoothing,
          mirrored,
          quality: screenshotQuality,
        });
      },
    }),
    [
      getScreenshot,
      imageSmoothing,
      screenshotFormat,
      screenshotQuality,
      mirrored,
    ]
  );
  const videoStyle = mirrored
    ? { ...style, transform: `${style.transform || ""} scaleX(-1)` }
    : style;

  return (
    <video
      autoPlay
      muted={audio}
      playsInline
      ref={refVideo}
      src={src}
      style={videoStyle}
      {...rest}
    />
  );
}

export default React.forwardRef(Webcam);
