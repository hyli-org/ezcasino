use alloc::{
    string::{String, ToString},
    vec::Vec,
};
use anyhow::{anyhow, Context, Result};
use client_sdk::contract_indexer::{
    axum::{extract::State, http::StatusCode, response::IntoResponse, Json, Router},
    utoipa::openapi::OpenApi,
    utoipa_axum::{router::OpenApiRouter, routes},
    AppError, ContractHandler, ContractHandlerStore,
};
use client_sdk::transaction_builder::TxExecutorHandler;
use sdk::{utils::as_hyle_output, Blob, Calldata, Identity, RegisterContractEffect, ZkContract};
use serde::Serialize;

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

impl ContractHandler for BlackJack {
    async fn api(store: ContractHandlerStore<BlackJack>) -> (Router<()>, OpenApi) {
        let (router, api) = OpenApiRouter::default()
            .routes(routes!(get_state))
            .routes(routes!(get_user_balance))
            .split_for_parts();

        (router.with_state(store), api)
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
    path = "/user/{user_id}/balance",
    tag = "Contract",
    params(
        ("user_id" = String, Path, description = "User identity")
    ),
    responses(
        (status = OK, description = "Get user balance", body = u32),
        (status = NOT_FOUND, description = "User not found")
    )
)]
pub async fn get_user_balance(
    State(state): State<ContractHandlerStore<BlackJack>>,
    axum::extract::Path(user_id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let store = state.read().await;
    let blackjack_state = store.state.as_ref().ok_or(AppError(
        StatusCode::NOT_FOUND,
        anyhow!("No state found for contract '{}'", store.contract_name),
    ))?;

    let user_identity = Identity(user_id);
    let balance = blackjack_state
        .balances
        .get(&user_identity)
        .copied()
        .unwrap_or(0);

    Ok(Json(balance))
}
