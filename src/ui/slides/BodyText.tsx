import { slideTextBlocks } from '../../domain/slideText';
import { TextBlocks } from './TextBlocks';

/** The plain text of a slide: lines, bullets, pictures and hidden parts, drawn where they sit in the text. */
export function BodyText({ text }: { text: string }) {
  return (
    <div className="slide-content__text">
      <TextBlocks blocks={slideTextBlocks(text)} />
    </div>
  );
}
