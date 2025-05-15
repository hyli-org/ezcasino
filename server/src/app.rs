use std::{sync::Arc, time::Duration};

use crate::utils::AppError;
use anyhow::Result;
use axum::{
    extract::{Json, State},
    http::{HeaderMap, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use client_sdk::rest_client::{IndexerApiHttpClient, NodeApiHttpClient};
use contract::{BlackJack, BlackJackAction, Table, TableState};
use hyle_hyllar::{erc20::ERC20, Hyllar, HyllarAction};

use hyle_modules::{
    bus::{BusClientReceiver, SharedMessageBus},
    module_bus_client, module_handle_messages,
    modules::{prover::AutoProverEvent, BuildApiContextInner, Module},
};
use sdk::{Blob, BlobTransaction, ContractAction, ContractName, Identity};
use serde::Serialize;
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};

pub struct AppModule {
    bus: AppModuleBusClient,
}

pub struct AppModuleCtx {
    pub api: Arc<BuildApiContextInner>,
    pub node_client: Arc<NodeApiHttpClient>,
    pub indexer_client: Arc<IndexerApiHttpClient>,
    pub blackjack_cn: ContractName,
}

module_bus_client! {
#[derive(Debug)]
pub struct AppModuleBusClient {
    receiver(AutoProverEvent<BlackJack>),
}
}

impl Module for AppModule {
    type Context = Arc<AppModuleCtx>;

    async fn build(bus: SharedMessageBus, ctx: Self::Context) -> Result<Self> {
        let state = RouterCtx {
            blackjack_cn: ctx.blackjack_cn.clone(),
            app: Arc::new(Mutex::new(HyleOofCtx {
                bus: bus.new_handle(),
            })),
            client: ctx.node_client.clone(),
            indexer_client: ctx.indexer_client.clone(),
        };

        // Créer un middleware CORS
        let cors = CorsLayer::new()
            .allow_origin(Any) // Permet toutes les origines (peut être restreint)
            .allow_methods(vec![Method::GET, Method::POST]) // Permet les méthodes nécessaires
            .allow_headers(Any); // Permet tous les en-têtes

        let api = Router::new()
            .route("/_health", get(health))
            .route("/api/claim", post(claim))
            .route("/api/init", post(init))
            .route("/api/hit", post(hit))
            .route("/api/stand", post(stand))
            .route("/api/double_down", post(double_down))
            .route("/api/config", get(get_config))
            .with_state(state)
            .layer(cors); // Appliquer le middleware CORS

        if let Ok(mut guard) = ctx.api.router.lock() {
            if let Some(router) = guard.take() {
                guard.replace(router.merge(api));
            }
        }
        let bus = AppModuleBusClient::new_from_bus(bus.new_handle()).await;

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
    pub indexer_client: Arc<IndexerApiHttpClient>,
    pub blackjack_cn: ContractName,
}

pub struct HyleOofCtx {
    pub bus: SharedMessageBus,
}

async fn health() -> impl IntoResponse {
    Json("OK")
}

// --------------------------------------------------------
//     Headers
// --------------------------------------------------------

const IDENTITY_HEADER: &str = "x-identity";

#[derive(Debug)]
struct AuthHeaders {
    identity: String,
}

impl AuthHeaders {
    fn from_headers(headers: &HeaderMap) -> Result<Self, AppError> {
        let identity = headers
            .get(IDENTITY_HEADER)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| {
                AppError(
                    StatusCode::UNAUTHORIZED,
                    anyhow::anyhow!("Missing identity"),
                )
            })?
            .to_string();

        Ok(AuthHeaders { identity })
    }
}

// --------------------------------------------------------
//     Types
// --------------------------------------------------------

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

#[derive(Serialize)]
struct ConfigResponse {
    contract_name: String,
}

// --------------------------------------------------------
//     Routes
// --------------------------------------------------------

async fn claim(
    State(ctx): State<RouterCtx>,
    headers: HeaderMap,
    Json(wallet_blobs): Json<[Blob; 2]>,
) -> Result<impl IntoResponse, AppError> {
    let auth = AuthHeaders::from_headers(&headers)?;
    send(ctx, BlackJackAction::Claim, auth, wallet_blobs).await
}

async fn init(
    State(ctx): State<RouterCtx>,
    headers: HeaderMap,
    Json(wallet_blobs): Json<[Blob; 2]>,
) -> Result<impl IntoResponse, AppError> {
    let auth = AuthHeaders::from_headers(&headers)?;
    send(ctx, BlackJackAction::Init, auth, wallet_blobs).await
}

async fn hit(
    State(ctx): State<RouterCtx>,
    headers: HeaderMap,
    Json(wallet_blobs): Json<[Blob; 2]>,
) -> Result<impl IntoResponse, AppError> {
    let auth = AuthHeaders::from_headers(&headers)?;
    send(ctx, BlackJackAction::Hit, auth, wallet_blobs).await
}

async fn stand(
    State(ctx): State<RouterCtx>,
    headers: HeaderMap,
    Json(wallet_blobs): Json<[Blob; 2]>,
) -> Result<impl IntoResponse, AppError> {
    let auth = AuthHeaders::from_headers(&headers)?;
    send(ctx, BlackJackAction::Stand, auth, wallet_blobs).await
}

async fn double_down(
    State(ctx): State<RouterCtx>,
    headers: HeaderMap,
    Json(wallet_blobs): Json<[Blob; 2]>,
) -> Result<impl IntoResponse, AppError> {
    let auth = AuthHeaders::from_headers(&headers)?;
    send(ctx, BlackJackAction::DoubleDown, auth, wallet_blobs).await
}

async fn get_config(State(ctx): State<RouterCtx>) -> impl IntoResponse {
    Json(ConfigResponse {
        contract_name: ctx.blackjack_cn.0,
    })
}

async fn send(
    ctx: RouterCtx,
    action: BlackJackAction,
    auth: AuthHeaders,
    wallet_blobs: [Blob; 2],
) -> Result<impl IntoResponse, AppError> {
    let is_claim = matches!(action, BlackJackAction::Claim);

    let identity = Identity(auth.identity);

    let mut blobs = wallet_blobs.into_iter().collect::<Vec<_>>();
    blobs.push(action.as_blob(ctx.blackjack_cn.clone()));

    // Add Hyllar transfer blob for claim action
    if is_claim {
        let hyllar: Hyllar = ctx
            .indexer_client
            .fetch_current_state(&"hyllar".into())
            .await?;
        let balance = hyllar
            .balance_of(&identity.0)
            .map_err(|e| AppError(StatusCode::BAD_REQUEST, anyhow::anyhow!(e)))?;

        // Check if balance is sufficient for minimum bet
        if balance < 10 {
            return Err(AppError(
                StatusCode::BAD_REQUEST,
                anyhow::anyhow!("Insufficient balance. Minimum claim is 10"),
            ));
        }

        let transfer_action = HyllarAction::Transfer {
            recipient: ctx.blackjack_cn.0.clone(),
            amount: balance,
        };
        blobs.insert(1, transfer_action.as_blob("hyllar".into(), None, None));
    }

    let tx_hash = ctx
        .client
        .send_tx_blob(&BlobTransaction::new(identity.clone(), blobs))
        .await?;

    let mut bus = {
        let app = ctx.app.lock().await;
        AppModuleBusClient::new_from_bus(app.bus.new_handle()).await
    };

    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let a = bus.recv().await?;
            match a {
                AutoProverEvent::SuccessTx(sequenced_tx_hash, state) => {
                    if sequenced_tx_hash == tx_hash {
                        let balance = state.balances.get(&identity).copied().unwrap_or(0);
                        let mut table: ApiTable = state
                            .tables
                            .get(&identity)
                            .cloned()
                            .unwrap_or_default()
                            .into();
                        table.balance = balance;
                        return Ok(Json(table));
                    }
                }
                AutoProverEvent::FailedTx(sequenced_tx_hash, error) => {
                    if sequenced_tx_hash == tx_hash {
                        return Err(AppError(StatusCode::BAD_REQUEST, anyhow::anyhow!(error)));
                    }
                }
            }
        }
    })
    .await?
}
