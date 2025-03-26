use std::sync::Arc;

use anyhow::Result;
use client_sdk::rest_client::{IndexerApiHttpClient, NodeApiHttpClient};

pub async fn init_node(
    node: Arc<NodeApiHttpClient>,
    indexer: Arc<IndexerApiHttpClient>,
) -> Result<()> {
    Ok(())
}
