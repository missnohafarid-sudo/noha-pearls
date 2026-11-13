import { pictureSources } from '../../domain/media';
import './pictures.css';

/** The photos of a slide, side by side and centred, wrapping on a narrow screen. Used by every slide kind that carries photos. */
export function Pictures({ links }: { links: readonly string[] }) {
  const sources = pictureSources(links);
  if (sources.length === 0) return null;
  return (
    <div className="slide-pictures">
      {sources.map((src, index) => (
        <img key={index} className="slide-pictures__image" src={src} alt="" referrerPolicy="no-referrer" />
      ))}
    </div>
  );
}
