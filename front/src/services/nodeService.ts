//only used for faucet for now, maybe we should use it all the time
import {
    BlobTransaction,
    NodeApiHttpClient,
    TxHash,
  } from 'hyli';
  
  class NodeService {
    client: NodeApiHttpClient;
  
    constructor() {
      this.client = new NodeApiHttpClient(import.meta.env.VITE_NODE_BASE_URL);
    }
  
    async sendBlobTx(tx: BlobTransaction): Promise<TxHash> {
        return this.client.sendBlobTx(tx);
    }
  }
  
  export const nodeService = new NodeService();