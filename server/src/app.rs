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
use blackjack::{BlackJack, BlackJackAction, Table, TableState};
use client_sdk::rest_client::NodeApiClient;
use client_sdk::rest_client::NodeApiHttpClient;
use hyle_smt_token::SmtTokenAction;

use hyle_modules::{
    bus::{BusClientReceiver, SharedMessageBus},
    module_bus_client, module_handle_messages,
    modules::{
        contract_state_indexer::CSIBusEvent, prover::AutoProverEvent, BuildApiContextInner, Module,
    },
};
use sdk::{Blob, BlobIndex, BlobTransaction, ContractAction, ContractName, Identity};
use serde::Serialize;
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};

pub struct AppModule {
    bus: AppModuleBusClient,
}

pub struct AppModuleCtx {
    pub api: Arc<BuildApiContextInner>,
    pub node_client: Arc<NodeApiHttpClient>,
    pub blackjack_cn: ContractName,
}

module_bus_client! {
#[derive(Debug)]
pub struct AppModuleBusClient {
    receiver(AutoProverEvent<BlackJack>),
    receiver(CSIBusEvent<AutoProverEvent<BlackJack>>),
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
        };

        // Créer un middleware CORS
        let cors = CorsLayer::new()
            .allow_origin(Any) // Permet toutes les origines (peut être restreint)
            .allow_methods(vec![Method::GET, Method::POST]) // Permet les méthodes nécessaires
            .allow_headers(Any); // Permet tous les en-têtes

        let api = Router::new()
            .route("/_health", get(health))
            .route("/api/deposit", post(deposit))
            .route("/api/withdraw", post(withdraw))
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
            on_self self,
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

#[derive(Serialize, Debug, Clone)]
pub struct Resp {
    pub tx_hash: String,
    pub table: ApiTable,
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

#[derive(serde::Deserialize)]
struct WithdrawRequest {
    wallet_blobs: [Blob; 2],
    withdraw: u32,
    token: String,
}

#[derive(serde::Deserialize)]
struct InitRequest {
    wallet_blobs: [Blob; 2],
    bet: u32,
}

#[derive(serde::Deserialize)]
struct DepositRequest {
    wallet_blobs: [Blob; 2],
    deposit: u32,
}

// --------------------------------------------------------
//     Routes
// --------------------------------------------------------

async fn withdraw(
    State(ctx): State<RouterCtx>,
    headers: HeaderMap,
    Json(request): Json<WithdrawRequest>,
) -> Result<impl IntoResponse, AppError> {
    let auth = AuthHeaders::from_headers(&headers)?;
    send(
        ctx,
        BlackJackAction::Withdraw(request.withdraw, request.token),
        auth,
        request.wallet_blobs,
    )
    .await
}

async fn deposit(
    State(ctx): State<RouterCtx>,
    headers: HeaderMap,
    Json(request): Json<DepositRequest>,
) -> Result<impl IntoResponse, AppError> {
    let auth = AuthHeaders::from_headers(&headers)?;
    send(
        ctx,
        BlackJackAction::Deposit(request.deposit),
        auth,
        request.wallet_blobs,
    )
    .await
}

async fn init(
    State(ctx): State<RouterCtx>,
    headers: HeaderMap,
    Json(request): Json<InitRequest>,
) -> Result<impl IntoResponse, AppError> {
    let auth = AuthHeaders::from_headers(&headers)?;
    send(
        ctx,
        BlackJackAction::Init(request.bet),
        auth,
        request.wallet_blobs,
    )
    .await
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
    let identity = Identity(auth.identity);
    let mut blobs = vec![];

    match action {
        BlackJackAction::Deposit(amount) => {
            handle_deposit_action(amount, &ctx, &identity, &mut blobs).await?;
        }
        BlackJackAction::Withdraw(amount, token) => {
            handle_withdraw_action(amount, token, &ctx, &identity, &mut blobs).await?;
        }
        _ => {
            blobs.push(action.as_blob(ctx.blackjack_cn.clone(), None, None));
        }
    }

    blobs.extend_from_slice(&wallet_blobs);

    execute_transaction(ctx, identity, blobs).await
}

async fn handle_deposit_action(
    amount: u32,
    ctx: &RouterCtx,
    identity: &Identity,
    blobs: &mut Vec<Blob>,
) -> Result<(), AppError> {
    let transfer_action = SmtTokenAction::Transfer {
        sender: identity.clone(),
        recipient: ctx.blackjack_cn.0.clone().into(),
        amount: amount as u128,
    };

    blobs.push(BlackJackAction::Deposit(amount).as_blob(ctx.blackjack_cn.clone(), None, None));
    blobs.push(transfer_action.as_blob("oranj".into(), None, None));

    Ok(())
}

async fn handle_withdraw_action(
    amount: u32,
    token: String,
    ctx: &RouterCtx,
    identity: &Identity,
    blobs: &mut Vec<Blob>,
) -> Result<(), AppError> {
    let transfer_action = SmtTokenAction::Transfer {
        sender: ctx.blackjack_cn.0.clone().into(),
        recipient: identity.clone(),
        amount: amount as u128,
    };

    blobs.insert(
        0,
        BlackJackAction::Withdraw(amount, token.clone()).as_blob(
            ctx.blackjack_cn.clone(),
            None,
            Some(vec![BlobIndex(1)]),
        ),
    );
    blobs.insert(
        1,
        transfer_action.as_blob(token.into(), Some(BlobIndex(0)), None),
    );

    Ok(())
}

async fn execute_transaction(
    ctx: RouterCtx,
    identity: Identity,
    blobs: Vec<Blob>,
) -> Result<impl IntoResponse, AppError> {
    let tx_hash = ctx
        .client
        .send_tx_blob(BlobTransaction::new(identity.clone(), blobs))
        .await?;

    let mut bus = {
        let app = ctx.app.lock().await;
        AppModuleBusClient::new_from_bus(app.bus.new_handle()).await
    };

    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let event = bus.recv().await?;
            match event {
                CSIBusEvent {
                    event: AutoProverEvent::SuccessTx(sequenced_tx_hash, state),
                } => {
                    if sequenced_tx_hash == tx_hash {
                        let balance = state.oranj_balances.get(&identity).copied().unwrap_or(0);
                        let mut table: ApiTable = state
                            .tables
                            .get(&identity)
                            .cloned()
                            .unwrap_or_default()
                            .into();
                        table.balance = balance;
                        return Ok(Json(Resp {
                            tx_hash: sequenced_tx_hash.to_string(),
                            table,
                        }));
                    }
                }
                CSIBusEvent {
                    event: AutoProverEvent::FailedTx(sequenced_tx_hash, error),
                } => {
                    if sequenced_tx_hash == tx_hash {
                        return Err(AppError(StatusCode::BAD_REQUEST, anyhow::anyhow!(error)));
                    }
                }
            }
        }
    })
    .await?
}
