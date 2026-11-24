// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import Splash from './Splash';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Splash', () => {
  it('muestra el logo de Lister y es accesible como "cargando"', () => {
    render(<Splash show />);
    expect(screen.getByRole('status', { name: /cargando lister/i })).toBeTruthy();
    expect(screen.getByAltText('Lister').getAttribute('src')).toContain('lister-logo-white.svg');
  });

  it('al ocultarse se desvanece y luego se desmonta', () => {
    const { rerender } = render(<Splash show />);
    rerender(<Splash show={false} />);
    expect(screen.getByTestId('splash').className).toContain('boot-splash--out');
    act(() => void vi.advanceTimersByTime(400));
    expect(screen.queryByTestId('splash')).toBeNull();
  });

  it('no se monta si arranca oculto, y entra con fundido solo si se pide', () => {
    const { rerender } = render(<Splash show={false} />);
    expect(screen.queryByTestId('splash')).toBeNull();
    rerender(<Splash show animateIn />);
    expect(screen.getByTestId('splash').className).toContain('boot-splash--in');
  });
});
