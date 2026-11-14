import { hiddenBlocksBefore, type TextBlock } from '../../domain/slideText';
import { DirectedText } from './DirectedText';
import { HiddenSection } from './HiddenSection';
import { Pictures } from './Pictures';

/** A list of text blocks in reading order: lines, pictures, and hidden parts. The first hidden block here is part `firstPart` of its slide. */
export function TextBlocks({ blocks, firstPart }: { blocks: readonly TextBlock[]; firstPart: number }) {
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
              <HiddenSection key={index} part={firstPart + hiddenBlocksBefore(blocks, index)}>
                <div className="slide-content__text">
                  <TextBlocks blocks={block.blocks} firstPart={0} />
                </div>
              </HiddenSection>
            );
        }
      })}
    </>
  );
}
