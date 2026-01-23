import coreRegistry from './core-registry.json';
import synonyms from './synonyms.json';

export type Registry = typeof coreRegistry;

export function getRegistry(): Registry {
  return coreRegistry;
}

export function resolveFieldKey(inputKey: string): string | null {
  const registry = getRegistry();
  if (registry.attributes[inputKey as keyof typeof registry.attributes]) {
    return inputKey;
  }
  const synonym = synonyms[inputKey as keyof typeof synonyms];
  if (synonym && registry.attributes[synonym as keyof typeof registry.attributes]) {
    return synonym;
  }
  return null;
}

export function getFieldMeta(key: string) {
  return coreRegistry.attributes[key as keyof typeof coreRegistry.attributes] ?? null;
}

export function getProofMeta(type: string) {
  return coreRegistry.proofs[type as keyof typeof coreRegistry.proofs] ?? null;
}
