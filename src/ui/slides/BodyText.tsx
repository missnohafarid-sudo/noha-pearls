import { slideTextBlocks } from '../../domain/slideText';
import { TextBlocks } from './TextBlocks';

/** The plain text of a slide: lines, bullets, pictures and hidden parts, drawn where they sit in the text. Its first hidden part is part `firstPart` of the slide. */
export function BodyText({ text, firstPart = 0 }: { text: string; firstPart?: number }) {
  return (
    <div className="slide-content__text">
      <TextBlocks blocks={slideTextBlocks(text)} firstPart={firstPart} />
    </div>
  );
}
