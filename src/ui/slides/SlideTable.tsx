import type { SlideTable as Table } from '../../domain/slideTable';
import { DirectedText } from './DirectedText';
import './slideTable.css';

/** A table written in a slide's text: a real table whose cells are drawn like lines of text, scrolling sideways by itself when the screen is narrow. */
export function SlideTable({ header, rows }: Table) {
  return (
    <div className="slide-table">
      <table>
        {header && (
          <thead>
            <tr>
              {header.map((cell, column) => (
                <th key={column}>
                  <DirectedText text={cell} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, column) => (
                <td key={column}>
                  <DirectedText text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
