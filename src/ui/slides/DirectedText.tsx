import { directedRuns } from '../../domain/textDirection';

/** One line of a slide's text, with each left-to-right piece (an equation, an English word) isolated so it keeps its order inside right-to-left text. */
export function DirectedText({ text }: { text: string }) {
  return (
    <>
      {directedRuns(text).map((run, index) =>
        run.ltr ? (
          <bdi key={index} dir="ltr">
            {run.text}
          </bdi>
        ) : (
          run.text
        ),
      )}
    </>
  );
}
