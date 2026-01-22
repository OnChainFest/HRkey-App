type WalletSetupProps = {
  userId: string;
  email: string;
  onSetupComplete?: () => void;
};

const WalletSetup = ({ userId, email, onSetupComplete }: WalletSetupProps) => {
  const handleCreateCustodial = async () => {
    await fetch('/api/wallet/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, email })
    });
    onSetupComplete?.();
  };

  return (
    <div>
      <h3>Wallet Setup</h3>
      <button type="button" onClick={handleCreateCustodial}>
        Create Custodial Wallet
      </button>
      <button type="button" disabled>
        Connect MetaMask
      </button>
    </div>
  );
};

export default WalletSetup;
