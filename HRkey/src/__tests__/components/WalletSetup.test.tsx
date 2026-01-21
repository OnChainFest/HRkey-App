import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WalletSetup from '../../components/wallet/WalletSetup';

describe('WalletSetup', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders custodial and MetaMask options', () => {
    render(<WalletSetup userId="user-1" email="user@example.com" />);

    expect(screen.getByText('Create Custodial Wallet')).toBeInTheDocument();
    expect(screen.getByText('Connect MetaMask')).toBeInTheDocument();
  });

  it('calls setup endpoint when creating a custodial wallet', async () => {
    render(<WalletSetup userId="user-1" email="user@example.com" />);

    fireEvent.click(screen.getByText('Create Custodial Wallet'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/wallet/create', expect.any(Object));
    });
  });
});
