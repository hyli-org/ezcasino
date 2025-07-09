use std::{sync::Arc, time::Duration};

use anyhow::{bail, Result};
use blackjack::BlackJack;
use client_sdk::rest_client::NodeApiClient;
use client_sdk::rest_client::NodeApiHttpClient;
use sdk::{api::APIRegisterContract, info, ContractName, ProgramId, ZkContract};
use tokio::time::timeout;

pub async fn init_node(
    node: Arc<NodeApiHttpClient>,
    contract_name: impl Into<ContractName>,
) -> Result<()> {
    init_contract(&node, contract_name.into()).await?;
    Ok(())
}

async fn init_contract(node: &NodeApiHttpClient, contract_name: ContractName) -> Result<()> {
    match node.get_contract(contract_name.clone()).await {
        Ok(contract) => {
            let image_id = blackjack::client::metadata::PROGRAM_ID;
            let program_id = contract.program_id.0;
            if program_id != image_id {
                bail!(
                    "Invalid contract image_id. On-chain version is {:?}, expected {:?}",
                    hex::encode(program_id),
                    hex::encode(image_id),
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
            wait_contract_state(node, &contract_name).await?;
        }
    };
    Ok(())
}

pub async fn wait_contract_state(
    node: &NodeApiHttpClient,
    contract_name: &ContractName,
) -> anyhow::Result<()> {
    timeout(Duration::from_secs(30), async {
        loop {
            let resp = node.get_contract(contract_name.clone()).await;
            if resp.is_err() {
                info!("⏰ Waiting for contract {contract_name} state to be ready");
                tokio::time::sleep(Duration::from_millis(500)).await;
            } else {
                return Ok(());
            }
        }
    })
    .await?
}
