use std::{collections::HashMap, sync::Arc};

use crate::app::AppModuleCtx;
use anyhow::Result;
use client_sdk::helpers::risc0::Risc0Prover;
use hyle::{
    log_error, module_handle_messages,
    node_state::module::NodeStateEvent,
    utils::modules::{module_bus_client, Module},
};
use sdk::{
    BlobTransaction, Block, BlockHeight, ContractInput, ContractName, Hashed, HyleOutput,
    ProofTransaction, TransactionData, TxHash,
};
use tracing::{error, info};

pub struct ProverModule {
    bus: ProverModuleBusClient,
    ctx: Arc<ProverModuleCtx>,
    unsettled_txs: Vec<BlobTransaction>,
}

module_bus_client! {
#[derive(Debug)]
pub struct ProverModuleBusClient {
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

        Ok(ProverModule {
            bus,
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
        let mut should_trigger = self.unsettled_txs.is_empty();

        for (_, tx) in block.txs {
            if let TransactionData::Blob(tx) = tx.transaction_data {
                self.handle_blob(tx);
            }
        }

        for s_tx in block.successful_txs {
            should_trigger = self.settle_tx(s_tx)? == 0 || should_trigger;
        }

        for timedout in block.timed_out_txs {
            should_trigger = self.settle_tx(timedout)? == 0 || should_trigger;
        }

        for failed in block.failed_txs {
            should_trigger = self.settle_tx(failed)? == 0 || should_trigger;
        }

        if should_trigger && block.block_height > self.ctx.start_height {
            self.trigger_prove_first();
        }

        Ok(())
    }

    fn handle_blob(&mut self, tx: BlobTransaction) {
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

    fn trigger_prove_first(&self) {
        if let Some(tx) = self.unsettled_txs.first().cloned() {
            info!("Triggering prove for tx: {}", tx.hashed());
            let ctx = self.ctx.clone();
            tokio::task::spawn(async move {
                match prove_blob_tx(&ctx.app, tx).await {
                    Ok(_) => {}
                    Err(e) => {
                        info!("Error proving tx: {:?}", e);
                    }
                }
            });
        }
    }
}

fn get_prover(cn: &ContractName) -> Option<Risc0Prover> {
    match cn.0.as_str() {
        //"hyllar" => Some(Risc0Prover::new(hyllar::client::metadata::HYLLAR_ELF)),
        _ => None,
    }
}

fn execute(cn: &ContractName, input: &ContractInput) -> Option<(Vec<u8>, HyleOutput)> {
    match cn.0.as_str() {
        //"hyllar" | "hyllar2" => {
        //    let (s, o) = sdk::guest::execute::<Hyllar>(input);
        //    Some((s.to_bytes(), o))
        //}
        _ => None,
    }
}

async fn get_state(ctx: &Arc<AppModuleCtx>, cn: &ContractName) -> Result<Vec<u8>> {
    match cn.0.as_str() {
        //"hyllar" | "hyllar2" => Ok(ctx
        //    .indexer_client
        //    .fetch_current_state::<Hyllar>(cn)
        //    .await?
        //    .to_bytes()),
        _ => Err(anyhow::anyhow!("contract not found")),
    }
}

async fn prove_blob_tx(ctx: &Arc<AppModuleCtx>, tx: BlobTransaction) -> Result<()> {
    let blobs = tx.blobs.clone();
    let tx_hash = tx.hashed();
    let mut states = HashMap::<ContractName, Vec<u8>>::new();

    for (index, blob) in tx.blobs.iter().enumerate() {
        if let Some(prover) = get_prover(&blob.contract_name) {
            info!("Proving tx: {}. Blob for {}", tx_hash, blob.contract_name);
            if !states.contains_key(&blob.contract_name) {
                states.insert(
                    blob.contract_name.clone(),
                    get_state(ctx, &blob.contract_name).await?,
                );
            }

            let inputs = ContractInput {
                state: states.get(&blob.contract_name).unwrap().clone(),
                identity: tx.identity.clone(),
                tx_hash: tx_hash.clone(),
                private_input: vec![],
                blobs: blobs.clone(),
                index: sdk::BlobIndex(index),
                tx_ctx: None,
            };

            let success = {
                let (next_state, hyle_outputs) =
                    execute(&blob.contract_name, &inputs).expect("contract not found");

                states.insert(blob.contract_name.clone(), next_state);

                hyle_outputs.success
            };

            match prover.prove(inputs).await {
                Ok(proof) => {
                    info!("Proof generated for tx: {}", tx_hash);
                    let tx = ProofTransaction {
                        contract_name: blob.contract_name.clone(),
                        proof,
                    };
                    let _ = log_error!(
                        ctx.node_client.send_tx_proof(&tx).await,
                        "failed to send proof to node"
                    );
                    if !success {
                        return Ok(()); // Will fail-fast on first "failed" proof
                    }
                }
                Err(e) => {
                    error!("Error proving tx: {:?}", e);
                }
            };
        }
    }
    Ok(())
}
