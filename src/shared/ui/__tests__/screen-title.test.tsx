import { render, screen } from '@testing-library/react-native';

import { ScreenTitle } from '../screen-title';

describe('ScreenTitle', () => {
  it('renders the title as a header', async () => {
    await render(<ScreenTitle title="Today" />);
    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
  });
});
