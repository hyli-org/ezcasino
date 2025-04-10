use std::sync::Arc;

use crate::app::{AppEvent, AppModuleCtx};
use anyhow::{anyhow, Result};
use blackjack::BlackJack;
use client_sdk::helpers::risc0::Risc0Prover;
use hyle::{
    bus::BusClientSender,
    log_error, module_handle_messages,
    node_state::module::NodeStateEvent,
    utils::modules::{module_bus_client, Module},
};
use hyle_hyllar::Hyllar;
use sdk::{
    BlobTransaction, Block, BlockHeight, Calldata, Hashed, ProofTransaction, TransactionData,
    TxHash, ZkContract, HYLE_TESTNET_CHAIN_ID,
};
use session_key_manager::SessionKeyManager;
use tracing::{error, info};

pub struct ProverModule {
    bus: ProverModuleBusClient,
    ctx: Arc<ProverModuleCtx>,
    unsettled_txs: Vec<BlobTransaction>,
    blackjack: BlackJack,
    session_key_manager: SessionKeyManager,
    hyllar: Hyllar,
}

module_bus_client! {
#[derive(Debug)]
pub struct ProverModuleBusClient {
    sender(AppEvent),
    receiver(NodeStateEvent),
}
}
pub struct ProverModuleCtx {
    pub app: Arc<AppModuleCtx>,
    pub start_height: BlockHeight,
}

impl Module for ProverModule {
    type Context = Arc<ProverModuleCtx>;

    async fn build(ctx: Self::Context) -> Result<Self> {
        let bus = ProverModuleBusClient::new_from_bus(ctx.app.common.bus.new_handle()).await;

        let blackjack = BlackJack::default();
        let session_key_manager = SessionKeyManager::default();
        // TODO: fetch state from chain
        let hyllar = Hyllar::default();

        Ok(ProverModule {
            bus,
            blackjack,
            session_key_manager,
            hyllar,
            ctx,
            unsettled_txs: vec![],
        })
    }

    async fn run(&mut self) -> Result<()> {
        module_handle_messages! {
            on_bus self.bus,
            listen<NodeStateEvent> event => {
                _ = log_error!(self.handle_node_state_event(event).await, "handle note state event")
            }

        };

        Ok(())
    }
}

impl ProverModule {
    async fn handle_node_state_event(&mut self, event: NodeStateEvent) -> Result<()> {
        let NodeStateEvent::NewBlock(block) = event;
        self.handle_processed_block(*block).await?;

        Ok(())
    }

    async fn handle_processed_block(&mut self, block: Block) -> Result<()> {
        for (_, tx) in block.txs {
            if let TransactionData::Blob(tx) = tx.transaction_data {
                let tx_ctx = sdk::TxContext {
                    block_height: block.block_height,
                    block_hash: block.hash.clone(),
                    timestamp: block.block_timestamp.clone(),
                    lane_id: block.lane_ids.get(&tx.hashed()).unwrap().clone(),
                    chain_id: HYLE_TESTNET_CHAIN_ID,
                };

                self.handle_blob(tx, tx_ctx);
            }
        }

        for s_tx in block.successful_txs {
            self.settle_tx(s_tx)?;
        }

        for timedout in block.timed_out_txs {
            self.settle_tx(timedout)?;
        }

        for failed in block.failed_txs {
            self.settle_tx(failed)?;
        }

        Ok(())
    }

    fn handle_blob(&mut self, tx: BlobTransaction, tx_ctx: sdk::TxContext) {
        self.prove_blackjack_tx(&tx, &tx_ctx);
        self.prove_session_key_manager(&tx, &tx_ctx);
        self.prove_hyllar(&tx, &tx_ctx);
        self.unsettled_txs.push(tx);
    }

    fn settle_tx(&mut self, tx: TxHash) -> Result<usize> {
        let tx = self.unsettled_txs.iter().position(|t| t.hashed() == tx);
        if let Some(pos) = tx {
            self.unsettled_txs.remove(pos);
            Ok(pos)
        } else {
            Ok(0)
        }
    }

    fn prove_blackjack_tx(&mut self, tx: &BlobTransaction, tx_ctx: &sdk::TxContext) {
        if tx_ctx.block_height.0 < self.ctx.start_height.0 {
            return;
        }
        if let Some((index, blob)) = tx
            .blobs
            .iter()
            .enumerate()
            .find(|(_, b)| b.contract_name == self.ctx.app.blackjack_cn)
        {
            let blobs = tx.blobs.clone();
            let tx_hash = tx.hashed();

            let prover =
                Risc0Prover::new(blackjack::client::tx_executor_handler::metadata::BLACKJACK_ELF);

            info!("Proving tx: {}. Blob for {}", tx_hash, blob.contract_name);

            let Ok(state) = self.blackjack.as_bytes() else {
                error!("Failed to serialize state on tx: {}", tx_hash);
                return;
            };

            let commitment_metadata = state;

            let calldata = Calldata {
                identity: tx.identity.clone(),
                tx_hash: tx_hash.clone(),
                private_input: vec![],
                blobs: blobs.clone().into(),
                index: sdk::BlobIndex(index),
                tx_ctx: Some(tx_ctx.clone()),
                tx_blob_count: blobs.len(),
            };

            if let Err(e) = self.blackjack.execute(&calldata).map_err(|e| anyhow!(e)) {
                error!("error while executing contract: {e}");
                self.bus
                    .send(AppEvent::FailedTx(tx_hash.clone(), e.to_string()))
                    .unwrap();
            }

            let balance = self
                .blackjack
                .balances
                .get(&tx.identity)
                .copied()
                .unwrap_or(0);
            let table = self
                .blackjack
                .tables
                .get(&tx.identity)
                .cloned()
                .unwrap_or_default();
            self.bus
                .send(AppEvent::SequencedTx(
                    tx_hash.clone(),
                    table.into(),
                    balance,
                ))
                .unwrap();

            let node_client = self.ctx.app.node_client.clone();
            let blob = blob.clone();
            tokio::task::spawn(async move {
                match prover.prove(commitment_metadata, calldata).await {
                    Ok(proof) => {
                        info!("Proof generated for tx: {}", tx_hash);
                        let tx = ProofTransaction {
                            contract_name: blob.contract_name.clone(),
                            proof,
                        };
                        let _ = log_error!(
                            node_client.send_tx_proof(&tx).await,
                            "failed to send proof to node"
                        );
                    }
                    Err(e) => {
                        error!("Error proving tx: {:?}", e);
                    }
                };
            });
        }
    }

    fn prove_session_key_manager(&mut self, tx: &BlobTransaction, tx_ctx: &sdk::TxContext) {
        if tx_ctx.block_height.0 < self.ctx.start_height.0 {
            return;
        }
        if let Some((index, blob)) = tx
            .blobs
            .iter()
            .enumerate()
            .find(|(_, b)| b.contract_name == self.ctx.app.session_key_manager_cn)
        {
            let blobs = tx.blobs.clone();
            let tx_hash = tx.hashed();

            let prover = Risc0Prover::new(
                session_key_manager::client::tx_executor_handler::metadata::SESSION_KEY_MANAGER_ELF,
            );

            info!("Proving tx: {}. Blob for {}", tx_hash, blob.contract_name);

            let Ok(state) = self.session_key_manager.as_bytes() else {
                error!("Failed to serialize state on tx: {}", tx_hash);
                return;
            };

            let commitment_metadata = state;

            let calldata = Calldata {
                identity: tx.identity.clone(),
                tx_hash: tx_hash.clone(),
                private_input: vec![],
                blobs: blobs.clone().into(),
                index: sdk::BlobIndex(index),
                tx_ctx: Some(tx_ctx.clone()),
                tx_blob_count: blobs.len(),
            };

            if let Err(e) = self.blackjack.execute(&calldata).map_err(|e| anyhow!(e)) {
                error!("error while executing contract: {e}");
                self.bus
                    .send(AppEvent::FailedTx(tx_hash.clone(), e.to_string()))
                    .unwrap();
            }

            let balance = self
                .blackjack
                .balances
                .get(&tx.identity)
                .copied()
                .unwrap_or(0);
            let table = self
                .blackjack
                .tables
                .get(&tx.identity)
                .cloned()
                .unwrap_or_default();
            self.bus
                .send(AppEvent::SequencedTx(
                    tx_hash.clone(),
                    table.into(),
                    balance,
                ))
                .unwrap();

            let node_client = self.ctx.app.node_client.clone();
            let blob = blob.clone();
            tokio::task::spawn(async move {
                match prover.prove(commitment_metadata, calldata).await {
                    Ok(proof) => {
                        info!("Proof generated for tx: {}", tx_hash);
                        let tx = ProofTransaction {
                            contract_name: blob.contract_name.clone(),
                            proof,
                        };
                        let _ = log_error!(
                            node_client.send_tx_proof(&tx).await,
                            "failed to send proof to node"
                        );
                    }
                    Err(e) => {
                        error!("Error proving tx: {:?}", e);
                    }
                };
            });
        }
    }

    fn prove_hyllar(&mut self, tx: &BlobTransaction, tx_ctx: &sdk::TxContext) {
        if tx_ctx.block_height.0 < self.ctx.start_height.0 {
            return;
        }
        if let Some((index, blob)) = tx
            .blobs
            .iter()
            .enumerate()
            .find(|(_, b)| b.contract_name == self.ctx.app.session_key_manager_cn)
        {
            let blobs = tx.blobs.clone();
            let tx_hash = tx.hashed();

            let prover =
                Risc0Prover::new(hyle_hyllar::client::tx_executor_handler::metadata::HYLLAR_ELF);

            info!("Proving tx: {}. Blob for {}", tx_hash, blob.contract_name);

            let state = self.hyllar.to_bytes();

            let commitment_metadata = state;

            let calldata = Calldata {
                identity: tx.identity.clone(),
                tx_hash: tx_hash.clone(),
                private_input: vec![],
                blobs: blobs.clone().into(),
                index: sdk::BlobIndex(index),
                tx_ctx: Some(tx_ctx.clone()),
                tx_blob_count: blobs.len(),
            };

            if let Err(e) = self.blackjack.execute(&calldata).map_err(|e| anyhow!(e)) {
                error!("error while executing contract: {e}");
                self.bus
                    .send(AppEvent::FailedTx(tx_hash.clone(), e.to_string()))
                    .unwrap();
            }

            let balance = self
                .blackjack
                .balances
                .get(&tx.identity)
                .copied()
                .unwrap_or(0);
            let table = self
                .blackjack
                .tables
                .get(&tx.identity)
                .cloned()
                .unwrap_or_default();
            self.bus
                .send(AppEvent::SequencedTx(
                    tx_hash.clone(),
                    table.into(),
                    balance,
                ))
                .unwrap();

            let node_client = self.ctx.app.node_client.clone();
            let blob = blob.clone();
            tokio::task::spawn(async move {
                match prover.prove(commitment_metadata, calldata).await {
                    Ok(proof) => {
                        info!("Proof generated for tx: {}", tx_hash);
                        let tx = ProofTransaction {
                            contract_name: blob.contract_name.clone(),
                            proof,
                        };
                        let _ = log_error!(
                            node_client.send_tx_proof(&tx).await,
                            "failed to send proof to node"
                        );
                    }
                    Err(e) => {
                        error!("Error proving tx: {:?}", e);
                    }
                };
            });
        }
    }
}
