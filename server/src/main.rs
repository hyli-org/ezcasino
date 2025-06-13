use anyhow::{Context, Result};
use app::{AppModule, AppModuleCtx};
use axum::Router;
use blackjack::BlackJack;
use clap::Parser;
use client_sdk::{
    helpers::risc0::Risc0Prover,
    rest_client::{IndexerApiHttpClient, NodeApiHttpClient},
};
use conf::Conf;
use hyle_modules::{
    bus::{metrics::BusMetrics, SharedMessageBus},
    modules::{
        contract_state_indexer::{ContractStateIndexer, ContractStateIndexerCtx},
        da_listener::{DAListener, DAListenerConf},
        prover::{AutoProver, AutoProverCtx, AutoProverEvent},
        rest::{RestApi, RestApiRunContext},
        BuildApiContextInner, ModulesHandler,
    },
    utils::logger::setup_tracing,
};
use prometheus::Registry;
use sdk::api::NodeInfo;
use std::sync::Arc;
use tracing::{error, info, warn};

mod app;
mod conf;
mod init;
mod utils;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
pub struct Args {
    #[arg(long, default_value = "config.toml")]
    pub config_file: Vec<String>,

    #[arg(long, default_value = "blackjack")]
    pub contract_name: String,

    #[clap(long, action)]
    pub pg: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let config = Conf::new(args.config_file).context("reading config file")?;

    setup_tracing(&config.log_format, "ezcasino".to_string()).context("setting up tracing")?;

    let config = Arc::new(config);

    info!("Starting app with config: {:?}", &config);

    let node_client =
        Arc::new(NodeApiHttpClient::new(config.node_url.clone()).context("build node client")?);
    let indexer_client = Arc::new(
        IndexerApiHttpClient::new(config.indexer_url.clone()).context("build indexer client")?,
    );
    match init::init_node(
        node_client.clone(),
        indexer_client.clone(),
        args.contract_name.clone(),
    )
    .await
    {
        Ok(_) => {}
        Err(e) => {
            error!("Error initializing node: {:?}", e);
            return Ok(());
        }
    }

    let bus = SharedMessageBus::new(BusMetrics::global("ezcasino".to_string()));

    std::fs::create_dir_all(&config.data_directory).context("creating data directory")?;

    let registry = Registry::new();
    // Init global metrics meter we expose as an endpoint
    let provider = opentelemetry_sdk::metrics::SdkMeterProvider::builder()
        .with_reader(
            opentelemetry_prometheus::exporter()
                .with_registry(registry.clone())
                .build()
                .context("starting prometheus exporter")?,
        )
        .build();

    opentelemetry::global::set_meter_provider(provider.clone());

    let mut handler = ModulesHandler::new(&bus).await;

    let build_api_ctx = Arc::new(BuildApiContextInner {
        router: std::sync::Mutex::new(Some(Router::new())),
        openapi: std::sync::Mutex::new(Default::default()),
    });

    let app_ctx = Arc::new(AppModuleCtx {
        api: build_api_ctx.clone(),
        node_client,
        wallet_indexer_url: Arc::new(config.indexer_url.clone()),
        blackjack_cn: args.contract_name.into(),
    });

    handler.build_module::<AppModule>(app_ctx.clone()).await?;
    handler
        .build_module::<ContractStateIndexer<BlackJack, AutoProverEvent<BlackJack>>>(
            ContractStateIndexerCtx {
                contract_name: app_ctx.blackjack_cn.clone(),
                data_directory: config.data_directory.clone(),
                api: build_api_ctx.clone(),
            },
        )
        .await?;

    handler
        .build_module::<AutoProver<BlackJack>>(
            AutoProverCtx {
                data_directory: config.data_directory.clone(),
                prover: Arc::new(Risc0Prover::new(blackjack::client::metadata::BLACKJACK_ELF)),
                contract_name: app_ctx.blackjack_cn.clone(),
                node: app_ctx.node_client.clone(),
                buffer_blocks: config.buffer_blocks,
                max_txs_per_proof: config.max_txs_per_proof,
                default_state: BlackJack::default(),
            }
            .into(),
        )
        .await?;

    handler
        .build_module::<DAListener>(DAListenerConf {
            start_block: None,
            data_directory: config.data_directory.clone(),
            da_read_from: config.da_read_from.clone(),
        })
        .await?;

    // Should come last so the other modules have nested their own routes.
    #[allow(clippy::expect_used, reason = "Fail on misconfiguration")]
    let router = build_api_ctx
        .router
        .lock()
        .expect("Context router should be available")
        .take()
        .expect("Context router should be available");
    #[allow(clippy::expect_used, reason = "Fail on misconfiguration")]
    let openapi = build_api_ctx
        .openapi
        .lock()
        .expect("OpenAPI should be available")
        .clone();

    handler
        .build_module::<RestApi>(RestApiRunContext {
            port: config.rest_server_port,
            max_body_size: config.rest_server_max_body_size,
            registry,
            router,
            openapi,
            info: NodeInfo {
                id: "ezcasino".to_string(),
                da_address: config.da_read_from.clone(),
                pubkey: None,
            },
        })
        .await?;

    #[cfg(unix)]
    {
        use tokio::signal::unix;
        let mut terminate = unix::signal(unix::SignalKind::interrupt())?;
        tokio::select! {
            Err(e) = handler.start_modules() => {
                error!("Error running modules: {:?}", e);
            }
            _ = tokio::signal::ctrl_c() => {
                info!("Ctrl-C received, shutting down");
            }
            _ = terminate.recv() =>  {
                info!("SIGTERM received, shutting down");
            }
        }
        _ = handler.shutdown_modules().await;
    }
    #[cfg(not(unix))]
    {
        tokio::select! {
            Err(e) = handler.start_modules() => {
                error!("Error running modules: {:?}", e);
            }
            _ = tokio::signal::ctrl_c() => {
                info!("Ctrl-C received, shutting down");
            }
        }
        _ = handler.shutdown_modules().await;
    }

    if args.pg {
        warn!("--pg option given. Postgres server will stop. Cleaning data dir");
        std::fs::remove_dir_all(&config.data_directory).context("removing data directory")?;
    }

    Ok(())
}
