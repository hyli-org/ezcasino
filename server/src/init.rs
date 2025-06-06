use std::{sync::Arc, time::Duration};

use anyhow::{bail, Result};
use blackjack::BlackJack;
use client_sdk::rest_client::NodeApiClient;
use client_sdk::rest_client::{IndexerApiHttpClient, NodeApiHttpClient};
use sdk::{api::APIRegisterContract, info, ContractName, ProgramId, ZkContract};
use tokio::time::timeout;

pub async fn init_node(
    node: Arc<NodeApiHttpClient>,
    indexer: Arc<IndexerApiHttpClient>,
    contract_name: impl Into<ContractName>,
) -> Result<()> {
    init_contract(&node, &indexer, contract_name.into()).await?;
    Ok(())
}

async fn init_contract(
    node: &NodeApiHttpClient,
    indexer: &IndexerApiHttpClient,
    contract_name: ContractName,
) -> Result<()> {
    match indexer.get_indexer_contract(&contract_name).await {
        Ok(contract) => {
            let image_id = hex::encode(blackjack::client::metadata::PROGRAM_ID);
            let program_id = hex::encode(contract.program_id.as_slice());
            if program_id != image_id {
                bail!(
                    "Invalid contract image_id. On-chain version is {program_id}, expected {image_id}",
                );
            }
            info!("✅ Blackjack contract is up to date");
        }
        Err(_) => {
            info!("🚀 Registering Blackjack contract");
            let image_id = hex::encode(blackjack::client::metadata::PROGRAM_ID);
            node.register_contract(APIRegisterContract {
                verifier: "risc0-1".into(),
                program_id: ProgramId(hex::decode(image_id)?),
                state_commitment: BlackJack::default().commit(),
                contract_name: contract_name.clone(),
                ..Default::default()
            })
            .await?;
            wait_contract_state(indexer, &contract_name).await?;
        }
    };
    Ok(())
}

pub async fn wait_contract_state(
    indexer: &IndexerApiHttpClient,
    contract: &ContractName,
) -> anyhow::Result<()> {
    timeout(Duration::from_secs(30), async {
        loop {
            let resp = indexer.get_indexer_contract(contract).await;
            if resp.is_err() {
                info!("⏰ Waiting for contract {contract} state to be ready");
                tokio::time::sleep(Duration::from_millis(500)).await;
            } else {
                return Ok(());
            }
        }
    })
    .await?
}
