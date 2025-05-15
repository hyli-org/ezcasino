use alloc::{
    string::{String, ToString},
    vec::Vec,
};
use anyhow::{anyhow, Result};
use client_sdk::contract_indexer::{
    axum::{
        extract::{Path, State},
        http::StatusCode,
        response::IntoResponse,
        Json, Router,
    },
    utoipa::openapi::OpenApi,
    utoipa_axum::{router::OpenApiRouter, routes},
    AppError, ContractHandler, ContractHandlerStore,
};
use client_sdk::transaction_builder::TxExecutorHandler;
use sdk::{utils::as_hyle_output, Blob, Calldata, ZkContract};
use serde::Serialize;

use client_sdk::contract_indexer::axum;
use client_sdk::contract_indexer::utoipa;

use crate::*;

pub mod metadata {
    pub const ELF: &[u8] = include_bytes!("../../methods/guest/guest.img");
    pub const PROGRAM_ID: [u8; 32] = sdk::str_to_u8(include_str!("../../methods/guest/guest.txt"));
}

impl TxExecutorHandler for BlackJack {
    fn build_commitment_metadata(&self, _blob: &Blob) -> Result<Vec<u8>, String> {
        borsh::to_vec(self).map_err(|e| e.to_string())
    }

    fn handle(&mut self, calldata: &Calldata) -> Result<sdk::HyleOutput, String> {
        let initial_state_commitment = <Self as ZkContract>::commit(self);
        let mut res = <Self as ZkContract>::execute(self, calldata);
        if res.is_err() {
            return Err(res.err().unwrap());
        }
        let next_state_commitment = <Self as ZkContract>::commit(self);
        Ok(as_hyle_output(
            initial_state_commitment,
            next_state_commitment,
            calldata,
            &mut res,
        ))
    }
}

impl ContractHandler for BlackJack {
    async fn api(store: ContractHandlerStore<BlackJack>) -> (Router<()>, OpenApi) {
        let (router, api) = OpenApiRouter::default()
            .routes(routes!(get_state))
            .routes(routes!(get_table))
            .split_for_parts();

        (router.with_state(store), api)
    }
}

#[derive(Serialize, Debug, Clone)]
pub struct ApiTable {
    pub bank: Vec<u32>,
    pub bank_count: u32,
    pub user: Vec<u32>,
    pub user_count: u32,
    pub bet: u32,
    pub state: TableState,
    pub balance: u32,
}

impl From<Table> for ApiTable {
    fn from(table: Table) -> Self {
        ApiTable {
            bank_count: BlackJack::compute_score(&table.bank),
            bank: table.bank,
            user_count: BlackJack::compute_score(&table.user),
            user: table.user,
            bet: table.bet,
            state: table.state,
            balance: 0, // Will be set in the send function
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
pub async fn get_state<S: Serialize + Clone + 'static>(
    State(state): State<ContractHandlerStore<S>>,
) -> Result<impl IntoResponse, AppError> {
    let store = state.read().await;
    store.state.clone().map(Json).ok_or(AppError(
        StatusCode::NOT_FOUND,
        anyhow!("No state found for contract '{}'", store.contract_name),
    ))
}

#[utoipa::path(
    get,
    path = "/table/{identity}",
    tag = "Table",
    responses(
        (status = OK, description = "Get table state for identity"),
    )
)]
pub async fn get_table(
    Path(identity): Path<Identity>,
    State(state): State<ContractHandlerStore<BlackJack>>,
) -> Result<impl IntoResponse, AppError> {
    let store = state.read().await;
    let state = store.state.clone().ok_or(AppError(
        StatusCode::NOT_FOUND,
        anyhow!("No state found for contract '{}'", store.contract_name),
    ))?;
    let balance = state.balances.get(&identity).copied().unwrap_or(0);
    let mut table: ApiTable = state
        .tables
        .get(&identity)
        .cloned()
        .unwrap_or_default()
        .into();
    table.balance = balance;
    Ok(Json(table))
}
