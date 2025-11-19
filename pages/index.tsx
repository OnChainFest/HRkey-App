import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    // Redirect to WebDapp on mount
    window.location.href = '/WebDapp/index.html';
  }, []);

  return <div>Redirecting...</div>;
}
