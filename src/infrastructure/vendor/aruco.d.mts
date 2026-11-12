interface ArucoPoint {
  x: number;
  y: number;
}

interface ArucoMarker {
  id: number;
  corners: ArucoPoint[];
}

declare class Detector {
  constructor(config?: { dictionaryName?: string; maxHammingDistance?: number });
  detect(image: { width: number; height: number; data: Uint8ClampedArray }): ArucoMarker[];
}

declare class Dictionary {
  constructor(dictionaryName: string);
  generateSVG(id: number): string;
}

declare const library: { AR: { Detector: typeof Detector; Dictionary: typeof Dictionary } };
export default library;
