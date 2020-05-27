// Copied from https://github.com/expo/expo/blob/master/packages/expo-camera/src/CameraModule/CameraModule.ts

export const userMediaRequested = false;
export const mountedInstances: any[] = [];

export function canGetUserMedia(): boolean {
  return (
    // SSR
    typeof window !== 'undefined' &&
    // Has any form of media API
    !!(
      (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ||
      navigator["mozGetUserMedia"] ||
      navigator["webkitGetUserMedia"] ||
      navigator["msGetUserMedia"]
    )
  );
}

export async function getUserMediaAsync(
  constraints: MediaStreamConstraints
): Promise<MediaStream> {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  const _getUserMedia =
    navigator["mozGetUserMedia"] ||
    navigator["webkitGetUserMedia"] ||
    navigator["msGetUserMedia"];
  return new Promise((resolve, reject) =>
    _getUserMedia.call(navigator, constraints, resolve, reject)
  );
}

export async function getAnyUserMediaAsync(
  constraints: MediaStreamConstraints,
  ignoreConstraints = false
): Promise<MediaStream> {
  try {
    return await getUserMediaAsync({
      ...constraints,
      video: ignoreConstraints || constraints.video,
    });
  } catch (error) {
    if (!ignoreConstraints && error.name === "ConstraintNotSatisfiedError") {
      return await getAnyUserMediaAsync(constraints, true);
    }
    throw error;
  }
}

async function requestLegacyUserMediaAsync(props): Promise<any[]> {
  const optionalSource = (id) => ({ optional: [{ sourceId: id }] });

  const constraintToSourceId = (constraint) => {
    const { deviceId } = constraint;

    if (typeof deviceId === "string") {
      return deviceId;
    }

    if (Array.isArray(deviceId) && deviceId.length > 0) {
      return deviceId[0];
    }

    if (typeof deviceId === "object" && deviceId.ideal) {
      return deviceId.ideal;
    }

    return null;
  };

  const sources: any[] = await new Promise((resolve) =>
    // @ts-ignore: https://caniuse.com/#search=getSources
    // Chrome for Android (78) & Samsung Internet (10.1) use this
    MediaStreamTrack.getSources((sources) => resolve(sources))
  );

  let audioSource = null;
  let videoSource = null;

  sources.forEach((source) => {
    if (source.kind === "audio") {
      audioSource = source.id;
    } else if (source.kind === "video") {
      videoSource = source.id;
    }
  });

  const audioSourceId = constraintToSourceId(props.audioConstraints);
  if (audioSourceId) {
    audioSource = audioSourceId;
  }

  const videoSourceId = constraintToSourceId(props.videoConstraints);
  if (videoSourceId) {
    videoSource = videoSourceId;
  }

  return [optionalSource(audioSource), optionalSource(videoSource)];
}

async function sourceSelectedAsync(
  isMuted: boolean,
  audioConstraints?: MediaTrackConstraints | boolean,
  videoConstraints?: MediaTrackConstraints | boolean
): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    video: typeof videoConstraints !== "undefined" ? videoConstraints : true,
  };

  if (!isMuted) {
    constraints.audio =
      typeof audioConstraints !== "undefined" ? audioConstraints : true;
  }

  return await getAnyUserMediaAsync(constraints);
}

export async function requestUserMediaAsync(
  props: { audio?: any; video?: any },
  isMuted = true
): Promise<MediaStream> {
  if (canGetUserMedia()) {
    return await sourceSelectedAsync(isMuted, props.audio, props.video);
  }
  const [audio, video] = await requestLegacyUserMediaAsync(props);
  return await sourceSelectedAsync(isMuted, audio, video);
}
