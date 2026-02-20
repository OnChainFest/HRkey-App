export interface CanonicalReference {
  referenceId: string;
  subjectUserId: string;
  observerUserId: string;
  timestamp: string;  // ISO 8601 UTC
  kpis: Record<string, number>;
  overallScore: number;
  metadata: { version: string; role?: string; relationship?: string; [key: string]: any };
}

export interface AnchorResult {
  referenceId: string;
  canonicalJson: string;  // ADDED - exact string that was hashed
  hash: string;
  txHash: string;
  blockNumber: number;
  chainId: number;
  timestamp: Date;
  explorerUrl: string;
}
