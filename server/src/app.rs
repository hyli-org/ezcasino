use std::{sync::Arc, time::Duration};

use crate::utils::AppError;
use anyhow::Result;
use axum::{
    extract::{Json, Path, State},
    http::{HeaderMap, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use blackjack::{BlackJack, BlackJackAction, Table, TableState};
use client_sdk::rest_client::{IndexerApiHttpClient, NodeApiHttpClient};
use hyle::{
    bus::{BusClientReceiver, BusMessage, SharedMessageBus},
    model::{verifiers::Secp256k1Blob, CommonRunContext},
    module_handle_messages,
    utils::modules::{module_bus_client, Module},
};
use hyle_hyllar::{erc20::ERC20, Hyllar, HyllarAction};

use sdk::{BlobTransaction, ContractAction, ContractName, Identity, TxHash};
use secp256k1::hashes::{sha256, Hash};
use secp256k1::{ecdsa::Signature, Message, PublicKey, Secp256k1};
use serde::Serialize;
use session_key_manager::{SessionKeyManager, SessionKeyManagerAction};
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};

pub struct AppModule {
    bus: AppModuleBusClient,
}

pub struct AppModuleCtx {
    pub common: Arc<CommonRunContext>,
    pub node_client: Arc<NodeApiHttpClient>,
    pub indexer_client: Arc<IndexerApiHttpClient>,
    pub blackjack_cn: ContractName,
    pub session_key_manager_cn: ContractName,
}

#[derive(Debug, Clone)]
pub enum AppEvent {
    SequencedTx(TxHash, ApiTable, u32),
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
            session_key_manager_cn: ctx.session_key_manager_cn.clone(),
            app: Arc::new(Mutex::new(HyleOofCtx {
                bus: ctx.common.bus.new_handle(),
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
    pub indexer_client: Arc<IndexerApiHttpClient>,
    pub blackjack_cn: ContractName,
    pub session_key_manager_cn: ContractName,
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

const SESSION_KEY_HEADER: &str = "x-session-key";
const SIGNATURE_HEADER: &str = "x-request-signature";

#[derive(Debug)]
struct AuthHeaders {
    session_key: String,
    signature: String,
}

impl AuthHeaders {
    fn from_headers(headers: &HeaderMap) -> Result<Self, AppError> {
        let session_key = headers
            .get(SESSION_KEY_HEADER)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| {
                AppError(
                    StatusCode::UNAUTHORIZED,
                    anyhow::anyhow!("Missing session key"),
                )
            })?;

        let signature = headers
            .get(SIGNATURE_HEADER)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| {
                AppError(
                    StatusCode::UNAUTHORIZED,
                    anyhow::anyhow!("Missing signature"),
                )
            })?;

        Ok(AuthHeaders {
            session_key: session_key.to_string(),
            signature: signature.to_string(),
        })
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
    Path(amount): Path<u128>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let auth = AuthHeaders::from_headers(&headers)?;
    send_claim(ctx, amount, auth).await
}

async fn init(
    State(ctx): State<RouterCtx>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let auth = AuthHeaders::from_headers(&headers)?;
    send(ctx, BlackJackAction::Init, auth).await
}

async fn hit(
    State(ctx): State<RouterCtx>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let auth = AuthHeaders::from_headers(&headers)?;
    send(ctx, BlackJackAction::Hit, auth).await
}

async fn stand(
    State(ctx): State<RouterCtx>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let auth = AuthHeaders::from_headers(&headers)?;
    send(ctx, BlackJackAction::Stand, auth).await
}

async fn double_down(
    State(ctx): State<RouterCtx>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let auth = AuthHeaders::from_headers(&headers)?;
    send(ctx, BlackJackAction::DoubleDown, auth).await
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
) -> Result<impl IntoResponse, AppError> {
    let account = auth.session_key.clone();

    // TODO: add the correct identity value
    let identity = Identity(format!("{}.{}", account, ctx.blackjack_cn));

    let blobs = vec![action.as_blob(ctx.blackjack_cn.clone())];

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
            match bus.recv().await? {
                AppEvent::SequencedTx(sequenced_tx_hash, mut table, balance) => {
                    if sequenced_tx_hash == tx_hash {
                        table.balance = balance;
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

async fn send_claim(
    ctx: RouterCtx,
    amount: u128,
    auth: AuthHeaders,
) -> Result<impl IntoResponse, AppError> {
    let account = auth.session_key.clone();

    // depending on the action, the blobs will be different
    let mut blobs = vec![];

    // TODO: add the correct identity value for user (should not contain .sessionKeyManager)
    let user = Identity(format!("{}.{}", account, ctx.blackjack_cn));

    let session_key_manager: SessionKeyManager = ctx
        .indexer_client
        .fetch_current_state(&"session-key-manager".into())
        .await?;

    let session_key = session_key_manager
        .get_user_session_key(&user, &account)
        .ok_or_else(|| {
            AppError(
                StatusCode::BAD_REQUEST,
                anyhow::anyhow!("Session key not found"),
            )
        })?;

    let session_key_manager_action = SessionKeyManagerAction::Use {
        session_key: session_key.clone(),
    };

    // First position in blobs: session-key-manager
    blobs.push(session_key_manager_action.as_blob(ctx.session_key_manager_cn, None, None));

    // Verify signature using ECDSA
    let public_key = PublicKey::from_slice(&hex::decode(&account).map_err(|_| {
        AppError(
            StatusCode::UNAUTHORIZED,
            anyhow::anyhow!("Invalid public key format"),
        )
    })?)
    .map_err(|_| {
        AppError(
            StatusCode::UNAUTHORIZED,
            anyhow::anyhow!("Invalid public key"),
        )
    })?;

    let signature = Signature::from_der(&hex::decode(&auth.signature).map_err(|_| {
        AppError(
            StatusCode::UNAUTHORIZED,
            anyhow::anyhow!("Invalid signature format"),
        )
    })?)
    .map_err(|_| {
        AppError(
            StatusCode::UNAUTHORIZED,
            anyhow::anyhow!("Invalid signature"),
        )
    })?;

    // Create message hash
    let message_hash = sha256::Hash::hash(&session_key.nonce.to_le_bytes());
    let message = Message::from_digest(message_hash.to_byte_array());

    // Verify the signature
    let secp = Secp256k1::new();
    secp.verify_ecdsa(&message, &signature, &public_key)
        .map_err(|e| {
            AppError(
                StatusCode::UNAUTHORIZED,
                anyhow::anyhow!("Invalid ecdsa signature: {e:#?}"),
            )
        })?;

    // Create the EcdsaBlob
    let ecdsa_blob = Secp256k1Blob {
        identity: user.clone(),
        data: message_hash.to_byte_array(),
        public_key: public_key.serialize(),
        signature: signature.serialize_compact(),
    };

    // Second position in blobs, add the EcdsaBlob
    blobs.push(ecdsa_blob.as_blob());

    let action = BlackJackAction::Claim { amount };
    // Third position in blobs, add the BlackJackAction
    blobs.push(action.as_blob(ctx.blackjack_cn.clone()));

    // Add Hyllar transfer blob for claim action
    let hyllar: Hyllar = ctx
        .indexer_client
        .fetch_current_state(&"hyllar".into())
        .await?;
    let balance = hyllar
        .balance_of(&user.0)
        .map_err(|e| AppError(StatusCode::BAD_REQUEST, anyhow::anyhow!(e)))?;

    // Check if balance is sufficient for minimum bet
    if balance < 10 {
        return Err(AppError(
            StatusCode::BAD_REQUEST,
            anyhow::anyhow!("Insufficient balance. Minimum claim is 10"),
        ));
    }

    let transfer_action = HyllarAction::Transfer {
        recipient: user.0.clone(),
        amount: balance,
    };

    // Forth position in blobs, add the transfer action from ezcasino account to user
    blobs.insert(1, transfer_action.as_blob("hyllar".into(), None, None));

    let tx_hash = ctx
        .client
        .send_tx_blob(&BlobTransaction::new(user.clone(), blobs))
        .await?;

    let mut bus = {
        let app = ctx.app.lock().await;
        AppModuleBusClient::new_from_bus(app.bus.new_handle()).await
    };

    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            match bus.recv().await? {
                AppEvent::SequencedTx(sequenced_tx_hash, mut table, balance) => {
                    if sequenced_tx_hash == tx_hash {
                        table.balance = balance;
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
