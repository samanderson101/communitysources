import { render, screen } from '@testing-library/react';
import App from './App';

test('shows the age confirmation modal on first load', () => {
  render(<App />);
  const heading = screen.getByText(/Welcome to Community Sources/i);
  expect(heading).toBeInTheDocument();
});
