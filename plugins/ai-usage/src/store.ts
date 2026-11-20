import type { Reading } from './fetchers';
import type { ProviderKind } from './providers';

export type ProviderStatus = {
  key: string;
  title: string;
  subtitle: string;
  kind: ProviderKind;
  result:
    | { type: 'ok'; reading: Reading }
    | { type: 'error'; message: string }
    | undefined;
};