/** The class that gives a PDF frame its zoom step; `media.css` has one rule per step in `PDF_ZOOM_STEPS`. */
export const zoomClassName = (step: number): string => `media-zoom-${step}`;
