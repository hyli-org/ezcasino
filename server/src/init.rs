use std::{sync::Arc, time::Duration};

use anyhow::{bail, Result};
use blackjack_contract::BlackJack;
use client_sdk::rest_client::{IndexerApiHttpClient, NodeApiHttpClient};
use sdk::{api::APIRegisterContract, info, ContractName, HyleContract, ProgramId, StateCommitment};
use session_key_manager_contract::SessionKeyManager;
use tokio::time::timeout;

pub async fn init_node(
    node: Arc<NodeApiHttpClient>,
    indexer: Arc<IndexerApiHttpClient>,
    casino_contract_name: impl Into<ContractName>,
    skm_contract_name: impl Into<ContractName>,
) -> Result<()> {
    init_contracts(
        &node,
        &indexer,
        casino_contract_name.into(),
        skm_contract_name.into(),
    )
    .await?;
    Ok(())
}

async fn init_contracts(
    node: &NodeApiHttpClient,
    indexer: &IndexerApiHttpClient,
    casino_contract_name: ContractName,
    skm_contract_name: ContractName,
) -> Result<()> {
    let register_contract = async |contract_name: &ContractName,
                                   program_id: [u8; 32],
                                   state_commitment: StateCommitment| {
        match indexer.get_indexer_contract(&casino_contract_name).await {
            Ok(contract) => {
                let image_id = hex::encode(program_id);
                let program_id = hex::encode(contract.program_id.as_slice());
                if program_id != image_id {
                    bail!(
                        "Invalid contract image_id. On-chain version is {program_id}, expected {image_id}",
                    );
                }
                info!("✅ {} contract is up to date", contract_name);
            }
            Err(_) => {
                info!("🚀 Registering {} contract", contract_name);
                let image_id = hex::encode(blackjack_contract::client::metadata::PROGRAM_ID);
                node.register_contract(&APIRegisterContract {
                    verifier: "risc0-1".into(),
                    program_id: ProgramId(hex::decode(image_id)?),
                    state_commitment,
                    contract_name: contract_name.clone(),
                })
                .await?;
                wait_contract_state(indexer, contract_name).await?;
            }
        };
        Ok(())
    };

    register_contract(
        &casino_contract_name,
        blackjack_contract::client::metadata::PROGRAM_ID,
        BlackJack::default().commit(),
    )
    .await?;
    register_contract(
        &skm_contract_name,
        session_key_manager_contract::client::metadata::PROGRAM_ID,
        SessionKeyManager::default().commit(),
    )
    .await?;
    Ok(())
}

async fn wait_contract_state(
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
