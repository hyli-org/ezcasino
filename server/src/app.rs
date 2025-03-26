use std::{sync::Arc, time::Duration};

use crate::utils::AppError;
use anyhow::Result;
use axum::http::StatusCode;
use axum::{
    extract::{Json, State},
    http::Method,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use client_sdk::rest_client::NodeApiHttpClient;
use contract::{BlackJack, BlackJackAction, Table, TableState};
use hyle::{
    bus::{BusClientReceiver, BusMessage, SharedMessageBus},
    model::CommonRunContext,
    module_handle_messages,
    utils::modules::{module_bus_client, Module},
};

use sdk::{BlobTransaction, ContractName, Identity, TxHash};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};

pub struct AppModule {
    bus: AppModuleBusClient,
}

pub struct AppModuleCtx {
    pub common: Arc<CommonRunContext>,
    pub node_client: Arc<NodeApiHttpClient>,
    pub blackjack_cn: ContractName,
}

#[derive(Debug, Clone)]
pub enum AppEvent {
    SequencedTx(TxHash, ApiTable),
    FailedTx(TxHash, String),
}
impl BusMessage for AppEvent {}

module_bus_client! {
#[derive(Debug)]
pub struct AppModuleBusClient {
    receiver(AppEvent),
}
}

impl Module for AppModule {
    type Context = Arc<AppModuleCtx>;

    async fn build(ctx: Self::Context) -> Result<Self> {
        let state = RouterCtx {
            blackjack_cn: ctx.blackjack_cn.clone(),
            app: Arc::new(Mutex::new(HyleOofCtx {
                bus: ctx.common.bus.new_handle(),
            })),
            client: ctx.node_client.clone(),
        };

        // Créer un middleware CORS
        let cors = CorsLayer::new()
            .allow_origin(Any) // Permet toutes les origines (peut être restreint)
            .allow_methods(vec![Method::GET, Method::POST]) // Permet les méthodes nécessaires
            .allow_headers(Any); // Permet tous les en-têtes

        let api = Router::new()
            .route("/_health", get(health))
            .route("/api/init", post(init))
            .route("/api/hit", post(hit))
            .route("/api/stand", post(stand))
            .with_state(state)
            .layer(cors); // Appliquer le middleware CORS

        if let Ok(mut guard) = ctx.common.router.lock() {
            if let Some(router) = guard.take() {
                guard.replace(router.merge(api));
            }
        }
        let bus = AppModuleBusClient::new_from_bus(ctx.common.bus.new_handle()).await;

        Ok(AppModule { bus })
    }

    async fn run(&mut self) -> Result<()> {
        module_handle_messages! {
            on_bus self.bus,
        };

        Ok(())
    }
}

#[derive(Clone)]
struct RouterCtx {
    pub app: Arc<Mutex<HyleOofCtx>>,
    pub client: Arc<NodeApiHttpClient>,
    pub blackjack_cn: ContractName,
}

pub struct HyleOofCtx {
    pub bus: SharedMessageBus,
}

async fn health() -> impl IntoResponse {
    Json("OK")
}

// --------------------------------------------------------
//     Init
// --------------------------------------------------------

#[derive(Deserialize)]
struct BlackJackActionRequest {
    account: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct ApiTable {
    pub bank: Vec<u32>,
    pub bank_count: u32,
    pub user: Vec<u32>,
    pub user_count: u32,
    pub bet: u32,
    pub state: TableState,
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
        }
    }
}

async fn init(
    State(ctx): State<RouterCtx>,
    Json(payload): Json<BlackJackActionRequest>,
) -> Result<impl IntoResponse, AppError> {
    send(ctx, payload.account.into(), BlackJackAction::Init).await
}

async fn hit(
    State(ctx): State<RouterCtx>,
    Json(payload): Json<BlackJackActionRequest>,
) -> Result<impl IntoResponse, AppError> {
    send(ctx, payload.account.into(), BlackJackAction::Hit).await
}

async fn stand(
    State(ctx): State<RouterCtx>,
    Json(payload): Json<BlackJackActionRequest>,
) -> Result<impl IntoResponse, AppError> {
    send(ctx, payload.account.into(), BlackJackAction::Stand).await
}

async fn send(
    ctx: RouterCtx,
    identity: Identity,
    action: BlackJackAction,
) -> Result<impl IntoResponse, AppError> {
    let blobs = vec![action.as_blob(ctx.blackjack_cn.clone())];
    let tx_hash = ctx
        .client
        .send_tx_blob(&BlobTransaction::new(identity, blobs))
        .await?;

    let mut bus = {
        let app = ctx.app.lock().await;
        AppModuleBusClient::new_from_bus(app.bus.new_handle()).await
    };

    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let a = bus.recv().await?;
            match a {
                AppEvent::SequencedTx(sequenced_tx_hash, table) => {
                    if sequenced_tx_hash == tx_hash {
                        return Ok(Json(table));
                    }
                }
                AppEvent::FailedTx(sequenced_tx_hash, error) => {
                    if sequenced_tx_hash == tx_hash {
                        return Err(AppError(StatusCode::BAD_REQUEST, anyhow::anyhow!(error)));
                    }
                }
            }
        }
    })
    .await?
}
