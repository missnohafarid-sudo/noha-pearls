import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { t } from '../../i18n';

export interface CameraState {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** True once frames are playing. */
  ready: boolean;
  /** Arabic message for the failure, or null. */
  error: string | null;
  devices: MediaDeviceInfo[];
  /** The camera chosen, or the one actually opened when none was chosen. */
  deviceId: string | null;
  selectDevice: (deviceId: string) => void;
  retry: () => void;
}

const ERROR_KEYS = ['NotAllowedError', 'NotFoundError', 'OverconstrainedError', 'NotReadableError'] as const;

function describeError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const known = ERROR_KEYS.find((key) => key === name);
  return known ? t.scanner.errors[known] : t.scanner.errors.unknown;
}

function openStream(deviceId: string | null): Promise<MediaStream> {
  const media = navigator.mediaDevices;
  if (deviceId) return media.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false });
  return media
    .getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    })
    .catch((first: unknown) => {
      // A blocked camera will not open with looser constraints either.
      if (first instanceof Error && first.name === 'NotAllowedError') throw first;
      return media.getUserMedia({ video: true, audio: false });
    });
}

/** Owns the camera stream: starts it, lists cameras, and always stops it on cleanup. */
export function useCamera(): CameraState {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false);
    setError(null);

    const start = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(t.scanner.errors.insecure);
        return;
      }
      try {
        const opened = await openStream(deviceId);
        if (cancelled) {
          opened.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = opened;
        setOpenedId(opened.getVideoTracks()[0]?.getSettings().deviceId ?? null);
        const video = videoRef.current;
        if (video) {
          video.srcObject = opened;
          await video.play();
        }
        if (cancelled) return;
        setReady(true);
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(all.filter((device) => device.kind === 'videoinput'));
      } catch (caught) {
        if (!cancelled) setError(describeError(caught));
      }
    };
    void start();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [deviceId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { videoRef, ready, error, devices, deviceId: deviceId ?? openedId, selectDevice: setDeviceId, retry };
}
