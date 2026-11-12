/** The plain text of a slide: one paragraph per line, and a line starting with "- " is a bullet. */
export function BodyText({ text }: { text: string }) {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  return (
    <div className="slide-content__text">
      {lines.map((line, index) =>
        line.trimStart().startsWith('- ') ? (
          <p key={index} className="slide-content__bullet">
            {line.trimStart().slice(2)}
          </p>
        ) : (
          <p key={index}>{line}</p>
        ),
      )}
    </div>
  );
}
