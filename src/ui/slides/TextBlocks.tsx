import type { TextBlock } from '../../domain/slideText';
import { DirectedText } from './DirectedText';
import { HiddenSection } from './HiddenSection';
import { Pictures } from './Pictures';

/** A list of text blocks in reading order: lines, pictures, and hidden parts that each open and close by themselves. */
export function TextBlocks({ blocks }: { blocks: readonly TextBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'line':
            return (
              <p key={index} className={block.bullet ? 'slide-content__bullet' : undefined}>
                <DirectedText text={block.text} />
              </p>
            );
          case 'pictures':
            return <Pictures key={index} links={block.links} />;
          case 'hidden':
            return (
              <HiddenSection key={index}>
                <div className="slide-content__text">
                  <TextBlocks blocks={block.blocks} />
                </div>
              </HiddenSection>
            );
        }
      })}
    </>
  );
}
