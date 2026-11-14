import { slideTextBlocks } from '../../domain/slideText';
import { DirectedText } from './DirectedText';

/** The plain text of a slide, drawn block by block in reading order. */
export function BodyText({ text }: { text: string }) {
  return (
    <div className="slide-content__text">
      {slideTextBlocks(text).map((block, index) => (
        <p key={index} className={block.bullet ? 'slide-content__bullet' : undefined}>
          <DirectedText text={block.text} />
        </p>
      ))}
    </div>
  );
}
