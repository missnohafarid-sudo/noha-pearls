import type { RefObject } from 'react';
import { t } from '../../i18n';
import { Select } from '../forms/Select';
import type { CameraState } from './useCamera';
import './scanner.css';

/** The camera picture with the marker overlay, its status, its error and the camera picker. */
export function CameraView({ camera, overlayRef }: { camera: CameraState; overlayRef: RefObject<HTMLCanvasElement | null> }) {
  return (
    <section className="scanner__camera stack--tight stack">
      <div className="scanner__view">
        <video ref={camera.videoRef} className="scanner__video" playsInline muted />
        <canvas ref={overlayRef} className="scanner__overlay" />
        {!camera.ready && !camera.error && <p className="scanner__status">{t.scanner.starting}</p>}
      </div>
      {camera.error && (
        <div className="notice notice--bad row">
          <span>{camera.error}</span>
          <button type="button" className="btn btn--small" onClick={camera.retry}>
            {t.scanner.retry}
          </button>
        </div>
      )}
      {camera.devices.length > 1 && (
        <Select
          aria-label={t.scanner.camera}
          options={camera.devices.map((device, index) => ({ value: device.deviceId, label: device.label || t.scanner.cameraN(index + 1) }))}
          value={camera.deviceId ?? ''}
          onChange={camera.selectDevice}
        />
      )}
    </section>
  );
}
