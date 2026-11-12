import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArucoCardCodec } from '../src/infrastructure/ArucoCardCodec';

const WIDTH = 640;
const HEIGHT = 480;
const CELL_PIXELS = 36;
const FRAMES = 10;
const WHITE = 235;
const BLACK = 16;

/** Quarter turns the card is rotated in front of the camera: 0 shows option 1 on top, 1 shows option 4, and so on. */
export const CARD_TURNS = Number(process.env.TURNS ?? 0);

/** The option index the app must read from the card at CARD_TURNS: each quarter turn moves the top edge on by one letter, backwards. */
export const EXPECTED_OPTION_INDEX = [0, 3, 2, 1][CARD_TURNS % 4];

/** Paints the marker as a square of 0 (black) and 1 (white) pixels, CELL_PIXELS per marker cell. */
function markerPixels(svg: string): { pixels: Uint8Array; side: number } {
  const cells = Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1]);
  const side = cells * CELL_PIXELS;
  const pixels = new Uint8Array(side * side).fill(1);
  for (const [, x, y, w, h, fill] of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(\w+)"/g)) {
    for (let py = +y * CELL_PIXELS; py < (+y + +h) * CELL_PIXELS; py++) {
      for (let px = +x * CELL_PIXELS; px < (+x + +w) * CELL_PIXELS; px++) pixels[py * side + px] = fill === 'white' ? 1 : 0;
    }
  }
  return { pixels, side };
}

function rotateQuarter(pixels: Uint8Array, side: number): Uint8Array {
  const turned = new Uint8Array(side * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) turned[x * side + (side - 1 - y)] = pixels[y * side + x];
  return turned;
}

/** Writes a short video of answer card `cardNumber` for Chrome's fake camera, and returns its path. */
export function writeCardVideo(cardNumber: number, turns: number): string {
  const { pixels: upright, side } = markerPixels(new ArucoCardCodec().markerSvg(cardNumber));
  let pixels = upright;
  for (let turn = 0; turn < turns; turn++) pixels = rotateQuarter(pixels, side);

  const luma = Buffer.alloc(WIDTH * HEIGHT, WHITE);
  const left = (WIDTH - side) >> 1;
  const top = (HEIGHT - side) >> 1;
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) luma[(y + top) * WIDTH + x + left] = pixels[y * side + x] ? WHITE : BLACK;
  const chroma = Buffer.alloc((WIDTH * HEIGHT) / 2, 128);

  const frames = Array.from({ length: FRAMES }, () => [Buffer.from('FRAME\n'), luma, chroma]).flat();
  const file = join(mkdtempSync(join(tmpdir(), 'card-video-')), 'card.y4m');
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F10:1 Ip A1:1 C420jpeg\n`), ...frames]));
  return file;
}
