import { useMemo } from 'react';
import { useServices } from '../ServicesContext';

/** A QR code for a link. The markup comes from the QR port, never from user input. */
export function QrCode({ url, label }: { url: string; label: string }) {
  const { qr } = useServices();
  const svg = useMemo(() => qr.qrSvg(url), [qr, url]);
  return <div className="qr" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}
