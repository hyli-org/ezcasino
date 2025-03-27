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
use client_sdk::rest_client::NodeApiHttpClient;
use contract::{BlackJack, BlackJackAction, Table, TableState};
use hyle::{
    bus::{BusClientReceiver, BusMessage, SharedMessageBus},
    model::CommonRunContext,
    module_handle_messages,
    utils::modules::{module_bus_client, Module},
};
use hmac::{Hmac, Mac};
use sha2::Sha256;

use sdk::{Blob, BlobData, BlobIndex, BlobTransaction, ContractAction, ContractName, Identity, TxHash};
use serde::Serialize;
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};
use hex;

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
            .ok_or_else(|| AppError(StatusCode::UNAUTHORIZED, anyhow::anyhow!("Missing session key")))?;

        let signature = headers
            .get(SIGNATURE_HEADER)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError(StatusCode::UNAUTHORIZED, anyhow::anyhow!("Missing signature")))?;

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

// --------------------------------------------------------
//     Routes
// --------------------------------------------------------

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
    send(ctx,  BlackJackAction::Stand, auth).await
}

async fn send(
    ctx: RouterCtx,
    action: BlackJackAction,
    auth: AuthHeaders,
) -> Result<impl IntoResponse, AppError> {
    let account = auth.session_key.clone();
    
    // Get the endpoint name based on the action
    let endpoint = match action {
        BlackJackAction::Init => "init",
        BlackJackAction::Hit => "hit",
        BlackJackAction::Stand => "stand",
        BlackJackAction::DoubleDown => "double_down",
    };

    // Verify signature using HMAC-SHA256
    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(auth.session_key.as_bytes())
        .map_err(|_| AppError(StatusCode::UNAUTHORIZED, anyhow::anyhow!("Invalid session key")))?;
    mac.update(endpoint.as_bytes());
    let signature = mac.finalize().into_bytes();

    if signature.as_slice() != hex::decode(&auth.signature)
        .map_err(|_| AppError(StatusCode::UNAUTHORIZED, anyhow::anyhow!("Invalid signature format")))?
    {
        return Err(AppError(
            StatusCode::UNAUTHORIZED,
            anyhow::anyhow!("Invalid signature"),
        ));
    }

    let identity = Identity(format!("{}.{}", account, ctx.blackjack_cn));
    // get random
    let random = rand::random::<u64>();
    
    // Create the HmacSha256 blob
    let hmac_blob = HmacSha256Blob {
        identity: identity.clone(),
        data: endpoint.as_bytes().to_vec(),
        key: auth.session_key.as_bytes().to_vec(),
        hmac: signature.to_vec(),
    };

    let blobs = vec![
        action.with_id(random).as_blob(ctx.blackjack_cn.clone()),
        hmac_blob.as_blob(),
    ];

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
pub struct HmacSha256Blob {
    pub identity: Identity,
    pub data: Vec<u8>,
    pub key: Vec<u8>,
    pub hmac: Vec<u8>,
}

impl HmacSha256Blob {
    pub fn as_blob(&self) -> Blob {
        <Self as ContractAction>::as_blob(self, "hmac_sha256".into(), None, None)
    }
}

impl ContractAction for HmacSha256Blob {
    fn as_blob(
        &self,
        contract_name: ContractName,
        _caller: Option<BlobIndex>,
        _callees: Option<Vec<BlobIndex>>,
    ) -> Blob {
        #[allow(clippy::expect_used)]
        Blob {
            contract_name,
            data: BlobData(borsh::to_vec(self).expect("failed to encode HmacSha256Blob")),
        }
    }
}
