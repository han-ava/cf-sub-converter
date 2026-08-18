// src/adapters/types.ts
import { AdapterResult, NodeEnvelope } from '../types';

export interface ProtocolAdapter {
  adaptToMihomo(node: NodeEnvelope): AdapterResult;
  adaptToSingbox?(node: NodeEnvelope): AdapterResult;
}
