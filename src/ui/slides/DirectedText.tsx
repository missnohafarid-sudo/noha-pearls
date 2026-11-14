import { Fragment } from 'react';
import { lineRuns, type LinePart } from '../../domain/fractions';
import './fraction.css';

function Part({ part }: { part: LinePart }) {
  if (typeof part === 'string') return <>{part}</>;
  return (
    <span className="fraction">
      <span className="fraction__top">
        <DirectedText text={part.top} />
      </span>
      <span className="fraction__bottom">
        <DirectedText text={part.bottom} />
      </span>
    </span>
  );
}

/** One line of a slide's text, with each left-to-right piece (an equation, an English word) isolated so it keeps its order inside right-to-left text, and each `{top/bottom}` drawn as a fraction. */
export function DirectedText({ text }: { text: string }) {
  return (
    <>
      {lineRuns(text).map(({ ltr, parts }, index) => {
        const drawn = parts.map((part, at) => <Part key={at} part={part} />);
        return ltr ? (
          <bdi key={index} dir="ltr">
            {drawn}
          </bdi>
        ) : (
          <Fragment key={index}>{drawn}</Fragment>
        );
      })}
    </>
  );
}
