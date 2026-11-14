import type { TextBlock } from '../../domain/slideText';
import { DirectedText } from './DirectedText';
import { HiddenSection } from './HiddenSection';
import { Pictures } from './Pictures';
import { SlideTable } from './SlideTable';

/** A list of text blocks in reading order: lines, pictures, tables, and hidden parts. */
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
          case 'table':
            return <SlideTable key={index} header={block.header} rows={block.rows} />;
          case 'hidden':
            return (
              <HiddenSection key={index} partKey={block.key}>
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
