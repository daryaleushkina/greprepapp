import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import * as icons from './icons';

describe('иконки', () => {
  it('каждая рисуется и спрятана от экранного диктора', async () => {
    const all = Object.entries(icons);
    expect(all.length).toBeGreaterThan(8);
    const screen = await render(
      <div>
        {all.map(([name, Icon]) => (
          <Icon key={name} data-testid={name} />
        ))}
      </div>,
    );
    for (const [name] of all) {
      const svg = screen.getByTestId(name).element();
      expect(svg.getAttribute('aria-hidden'), name).toBe('true');
      expect(svg.childElementCount, name).toBeGreaterThan(0);
    }
  });
});
