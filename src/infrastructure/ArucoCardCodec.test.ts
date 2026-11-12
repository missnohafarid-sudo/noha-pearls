import { describe, expect, it } from 'vitest';
import { choiceFromCorners } from '../domain/cards';
import { ArucoCardCodec } from './ArucoCardCodec';

/** Paints the printable marker into a pixel frame, as a camera would see the card. */
function rasterize(svg: string, quarterTurnsClockwise: number): ImageData {
  const cell = 24;
  const margin = 3;
  const size = Number(/viewBox="0 0 (\d+)/.exec(svg)![1]);
  const side = (size + margin * 2) * cell;
  const gray = new Uint8Array(side * side).fill(255);
  for (const [, x, y, w, h, fill] of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(\w+)"/g)) {
    for (let py = (+y + margin) * cell; py < (+y + +h + margin) * cell; py += 1) {
      for (let px = (+x + margin) * cell; px < (+x + +w + margin) * cell; px += 1) {
        gray[py * side + px] = fill === 'white' ? 255 : 0;
      }
    }
  }
  let turned = gray;
  for (let turn = 0; turn < quarterTurnsClockwise; turn += 1) {
    const next = new Uint8Array(side * side);
    for (let y = 0; y < side; y += 1) for (let x = 0; x < side; x += 1) next[x * side + (side - 1 - y)] = turned[y * side + x];
    turned = next;
  }
  const data = new Uint8ClampedArray(side * side * 4);
  turned.forEach((value, i) => data.set([value, value, value, 255], i * 4));
  return { width: side, height: side, data, colorSpace: 'srgb' } as ImageData;
}

describe('answer card codec', () => {
  const codec = new ArucoCardCodec();

  it('reads back the card number it printed', () => {
    for (const cardNumber of [1, 18, 250, 999]) {
      const markers = codec.detect(rasterize(codec.markerSvg(cardNumber), 0));
      expect(markers.map((m) => m.id)).toEqual([cardNumber]);
    }
  });

  it('reads the card rotation as the chosen option', () => {
    const svg = codec.markerSvg(7);
    const choiceAt = (turns: number) => choiceFromCorners(codec.detect(rasterize(svg, turns))[0].corners);
    // Upright shows the first option; each clockwise quarter turn brings the previous edge to the top.
    expect([0, 1, 2, 3].map(choiceAt)).toEqual([0, 3, 2, 1]);
  });
});
