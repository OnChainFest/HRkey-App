"use client";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { baseSepolia } from "viem/chains";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_CDP_API_KEY!}
      chain={baseSepolia}
      appearance={{ name: "HRKey" }}
    >
      {children}
    </OnchainKitProvider>
  );
}
