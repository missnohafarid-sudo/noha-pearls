import qrcode from 'qrcode-generator';
import type { QrRenderer } from '../ports/codes';

/** Draws QR codes with the qrcode-generator library (MIT). */
export class QrSvgRenderer implements QrRenderer {
  qrSvg(text: string): string {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }
}
