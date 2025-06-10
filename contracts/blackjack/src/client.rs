use alloc::{
    string::{String, ToString},
    vec::Vec,
};
use anyhow::{anyhow, Context, Result};
use client_sdk::contract_indexer::{
    axum::{extract::State, http::StatusCode, response::IntoResponse, Json, Router},
    utoipa::{openapi::OpenApi, ToSchema},
    utoipa_axum::{router::OpenApiRouter, routes},
    AppError, ContractHandler, ContractHandlerStore,
};
use client_sdk::transaction_builder::TxExecutorHandler;
use hyle_modules::modules::prover::AutoProverEvent;
use sdk::{
    tracing::{debug, info},
    utils::as_hyle_output,
    Blob, BlobTransaction, Calldata, Hashed, Identity, RegisterContractEffect, TxContext,
    ZkContract,
};

use client_sdk::contract_indexer::axum;
use client_sdk::contract_indexer::utoipa;

use crate::*;

pub mod metadata {
    pub const BLACKJACK_ELF: &[u8] = include_bytes!("../blackjack.img");
    pub const PROGRAM_ID: [u8; 32] = sdk::str_to_u8(include_str!("../blackjack.txt"));
}

impl TxExecutorHandler for BlackJack {
    fn build_commitment_metadata(&self, _blob: &Blob) -> anyhow::Result<Vec<u8>> {
        borsh::to_vec(self).context("Failed to serialize BlackJack")
    }

    fn handle(&mut self, calldata: &Calldata) -> anyhow::Result<sdk::HyleOutput> {
        let initial_state_commitment = <Self as ZkContract>::commit(self);
        let mut res = <Self as ZkContract>::execute(self, calldata);
        if res.is_err() {
            return Err(anyhow!(res.err().unwrap()));
        }
        let next_state_commitment = <Self as ZkContract>::commit(self);
        Ok(as_hyle_output(
            initial_state_commitment,
            next_state_commitment,
            calldata,
            &mut res,
        ))
    }

    fn construct_state(
        _register_blob: &RegisterContractEffect,
        _metadata: &Option<Vec<u8>>,
    ) -> anyhow::Result<Self> {
        Ok(Self::default())
    }
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Debug, Clone, Default)]
pub struct OptimisticBlackJack {
    pub unsettled_txs: Vec<(BlobTransaction, BlobIndex, TxContext)>,
}

fn apply_tx_to_state(
    state: &mut BlackJack,
    tx: &BlobTransaction,
    index: BlobIndex,
    tx_context: TxContext,
) -> Result<()> {
    let Blob {
        contract_name,
        data: _,
    } = tx.blobs.get(index.0).context("Failed to get blob")?;

    let calldata = Calldata {
        identity: tx.identity.clone(),
        index,
        blobs: tx.blobs.clone().into(),
        tx_blob_count: tx.blobs.len(),
        tx_hash: tx.hashed(),
        tx_ctx: Some(tx_context),
        private_input: vec![],
    };

    let hyle_output = state.handle(&calldata)?;
    let program_outputs = str::from_utf8(&hyle_output.program_outputs).unwrap_or("no output");

    info!("🚀 Executed {contract_name}: {}", program_outputs);
    debug!(
        handler = %contract_name,
        "hyle_output: {:?}", hyle_output
    );
    Ok(())
}

impl OptimisticBlackJack {
    fn compute_optimistic_state(
        &mut self,
        mut state: BlackJack,
        new_unsettled_tx: Option<(BlobTransaction, BlobIndex, TxContext)>,
    ) -> Result<BlackJack> {
        for (tx, index, tx_context) in &self.unsettled_txs {
            let _ = apply_tx_to_state(&mut state, tx, *index, tx_context.clone())
                .context("Failed to apply transaction to optimistic state");
        }

        if let Some(new_unsettled_tx) = new_unsettled_tx {
            apply_tx_to_state(
                &mut state,
                &new_unsettled_tx.0,
                new_unsettled_tx.1,
                new_unsettled_tx.2.clone(),
            )?;
            self.unsettled_txs.push(new_unsettled_tx);
        }
        Ok(state)
    }
}

impl ContractHandler<AutoProverEvent<BlackJack>> for BlackJack {
    async fn api(store: ContractHandlerStore<BlackJack>) -> (Router<()>, OpenApi) {
        let (router, api) = OpenApiRouter::default()
            .routes(routes!(get_state))
            .routes(routes!(get_user_balance))
            .split_for_parts();

        (router.with_state(store), api)
    }

    fn handle_transaction_success(
        &mut self,
        tx: &BlobTransaction,
        index: BlobIndex,
        tx_context: TxContext,
    ) -> Result<Option<AutoProverEvent<BlackJack>>> {
        apply_tx_to_state(self, tx, index, tx_context)
            .context("Failed to apply transaction to state")?;
        self.optimistic_state
            .unsettled_txs
            .retain(|(t, i, _)| t != tx || *i != index);
        Ok(None)
    }

    fn handle_transaction_failed(
        &mut self,
        tx: &BlobTransaction,
        index: BlobIndex,
        _tx_context: TxContext,
    ) -> Result<Option<AutoProverEvent<BlackJack>>> {
        self.optimistic_state
            .unsettled_txs
            .retain(|(t, i, _)| t != tx || *i != index);
        Ok(None)
    }

    fn handle_transaction_timeout(
        &mut self,
        tx: &BlobTransaction,
        index: BlobIndex,
        _tx_context: TxContext,
    ) -> Result<Option<AutoProverEvent<BlackJack>>> {
        self.optimistic_state
            .unsettled_txs
            .retain(|(t, i, _)| t != tx || *i != index);
        Ok(None)
    }

    fn handle_transaction_sequenced(
        &mut self,
        tx: &BlobTransaction,
        index: BlobIndex,
        tx_context: TxContext,
    ) -> Result<Option<AutoProverEvent<BlackJack>>> {
        match self
            .optimistic_state
            .compute_optimistic_state(self.clone(), Some((tx.clone(), index, tx_context)))
        {
            Ok(state) => Ok(Some(AutoProverEvent::SuccessTx(tx.hashed(), state))),
            Err(e) => Ok(Some(AutoProverEvent::FailedTx(tx.hashed(), e.to_string()))),
        }
    }
}

#[utoipa::path(
    get,
    path = "/state",
    tag = "Contract",
    responses(
        (status = OK, description = "Get json state of contract")
    )
)]
pub async fn get_state(
    State(state): State<ContractHandlerStore<BlackJack>>,
) -> Result<impl IntoResponse, AppError> {
    let store = state.read().await;
    store.state.clone().map(Json).ok_or(AppError(
        StatusCode::NOT_FOUND,
        anyhow!("No state found for contract '{}'", store.contract_name),
    ))
}

#[derive(Serialize, ToSchema)]
struct UserBalances {
    oranj: u32,
    vitamin: u32,
}

#[utoipa::path(
    get,
    path = "/user/{user_id}/balances",
    tag = "Contract",
    params(
        ("user_id" = String, Path, description = "User identity")
    ),
    responses(
        (status = OK, description = "Get user balances", body = UserBalances),
        (status = NOT_FOUND, description = "User not found")
    )
)]
pub async fn get_user_balance(
    State(state): State<ContractHandlerStore<BlackJack>>,
    axum::extract::Path(user_id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let mut store = state.write().await;
    let cn = store.contract_name.clone();
    let blackjack_state = store.state.as_mut().ok_or(AppError(
        StatusCode::NOT_FOUND,
        anyhow!("No state found for contract '{}'", cn),
    ))?;
    let state = blackjack_state
        .optimistic_state
        .compute_optimistic_state(blackjack_state.clone(), None)?;

    let user_identity = Identity(user_id);
    let oranj_balance = state
        .oranj_balances
        .get(&user_identity)
        .copied()
        .unwrap_or(0);
    let vitamin_balance = state
        .vitamin_balances
        .get(&user_identity)
        .copied()
        .unwrap_or(0);

    Ok(Json(UserBalances {
        oranj: oranj_balance,
        vitamin: vitamin_balance,
    }))
}
