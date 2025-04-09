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
use blackjack_contract::{BlackJack, BlackJackAction, Table, TableState};
use client_sdk::rest_client::{IndexerApiHttpClient, NodeApiHttpClient};
use hyle::{
    bus::{BusClientReceiver, BusMessage, SharedMessageBus},
    model::CommonRunContext,
    module_handle_messages,
    utils::modules::{module_bus_client, Module},
};
use hyle_hyllar::{erc20::ERC20, Hyllar, HyllarAction};

use sdk::{
    Blob, BlobData, BlobIndex, BlobTransaction, ContractAction, ContractName, Identity, TxHash,
};
use secp256k1::hashes::{sha256, Hash};
use secp256k1::{ecdsa::Signature, Message, PublicKey, Secp256k1};
use serde::Serialize;
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
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let auth = AuthHeaders::from_headers(&headers)?;
    send(ctx, BlackJackAction::Claim, auth).await
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
    let endpoint = match action {
        BlackJackAction::Init => "init",
        BlackJackAction::Hit => "hit",
        BlackJackAction::Stand => "stand",
        BlackJackAction::DoubleDown => "double_down",
        BlackJackAction::Claim => "claim",
    };

    // Verify signature using ECDSA
    let public_key = PublicKey::from_slice(&hex::decode(&auth.session_key).map_err(|_| {
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
    let message_hash = sha256::Hash::hash(endpoint.as_bytes());
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

    let account = auth.session_key.clone();
    let is_claim = matches!(action, BlackJackAction::Claim);

    let identity = Identity(format!("{}.{}", account, ctx.blackjack_cn));
    // get random
    let random = rand::random::<u64>();

    // Create the EcdsaBlob
    let ecdsa_blob = Secp256k1Blob {
        identity: identity.clone(),
        data: message_hash.to_byte_array(),
        public_key: public_key.serialize(),
        signature: signature.serialize_compact(),
    };

    let mut blobs = vec![
        action.with_id(random).as_blob(ctx.blackjack_cn.clone()),
        ecdsa_blob.as_blob(),
    ];

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

#[derive(Debug, borsh::BorshSerialize, borsh::BorshDeserialize)]
pub struct Secp256k1Blob {
    pub identity: Identity,
    pub data: [u8; 32],
    pub public_key: [u8; 33],
    pub signature: [u8; 64],
}

impl Secp256k1Blob {
    pub fn as_blob(&self) -> Blob {
        <Self as ContractAction>::as_blob(self, "secp256k1".into(), None, None)
    }
}

impl ContractAction for Secp256k1Blob {
    fn as_blob(
        &self,
        contract_name: ContractName,
        _caller: Option<BlobIndex>,
        _callees: Option<Vec<BlobIndex>>,
    ) -> Blob {
        #[allow(clippy::expect_used)]
        Blob {
            contract_name,
            data: BlobData(borsh::to_vec(self).expect("failed to encode EcdsaBlob")),
        }
    }
}
