use std::collections::BTreeMap;

use borsh::{BorshDeserialize, BorshSerialize};
use sdk::utils::parse_contract_input;
use sdk::{
    Blob, BlobData, BlobIndex, ContractAction, ContractInput, ContractName, Identity,
    StructuredBlobData, TxContext, TxHash,
};
use sdk::{HyleContract, RunResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

extern crate alloc;

#[cfg(feature = "client")]
pub mod client;

#[derive(Debug, borsh::BorshSerialize, borsh::BorshDeserialize)]
pub struct Secp256k1Blob {
    pub identity: Identity,
    pub data: [u8; 32],
    pub public_key: [u8; 33],
    pub signature: [u8; 64],
}

impl HyleContract for SessionKeyManager {
    fn execute(&mut self, contract_input: &ContractInput) -> RunResult {
        let (action, execution_ctx) =
            parse_contract_input::<SessionKeyManagerAction>(contract_input)?;

        let output = match action {
            SessionKeyManagerAction::Add { session_key } => {
                self.add_session_key(&execution_ctx.caller, session_key)
            }
            SessionKeyManagerAction::Revoke { session_key } => {
                self.revoke_session_key(&execution_ctx.caller, session_key)
            }
            SessionKeyManagerAction::Use { session_key } => {
                let native_verifier_blob = contract_input.blobs.get(contract_input.index.0 + 1);
                self.use_session_key(
                    &execution_ctx.caller,
                    session_key,
                    native_verifier_blob,
                    &contract_input.tx_hash,
                    &contract_input.tx_ctx,
                )
            }
        };

        match output {
            Err(e) => Err(e),
            Ok(output) => Ok((output, execution_ctx, vec![])),
        }
    }

    fn commit(&self) -> sdk::StateCommitment {
        let mut hasher = Sha256::new();
        for (identity, session_keys) in self.session_keys.iter() {
            hasher.update(identity.0.as_bytes());
            for session_key in session_keys {
                hasher.update(session_key.key.as_bytes());
                hasher.update(session_key.expiration_date.to_le_bytes());
                hasher.update(session_key.nonce.to_le_bytes());
            }
        }
        sdk::StateCommitment(hasher.finalize().to_vec())
    }
}

#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Debug, Clone, Default, PartialEq,
)]
pub struct SessionKey {
    key: String,
    expiration_date: u128,
    nonce: u64,
    // contracts_whitelist: Vec[ContractName],
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Debug, Clone, Default)]
pub struct SessionKeyManager {
    session_keys: BTreeMap<Identity, Vec<SessionKey>>,
}

impl SessionKeyManager {
    pub fn add_session_key(
        &mut self,
        caller: &Identity,
        session_key: SessionKey,
    ) -> Result<String, String> {
        if let Some(session_keys) = self.session_keys.get_mut(caller) {
            session_keys.push(session_key.clone());
        } else {
            self.session_keys
                .insert(caller.clone(), vec![session_key.clone()]);
        }
        Ok(format!(
            "Session key {} added successfully for {}",
            session_key.key, caller
        ))
    }

    pub fn revoke_session_key(
        &mut self,
        caller: &Identity,
        session_key: SessionKey,
    ) -> Result<String, String> {
        if let Some(session_keys) = self.session_keys.get_mut(caller) {
            if let Some(index) = session_keys
                .iter()
                .position(|sess_key| sess_key == &session_key)
            {
                session_keys.remove(index);
            } else {
                return Err(format!(
                    "Session key {} not found for caller {}",
                    session_key.key, caller
                ));
            }
        } else {
            return Err(format!("No session keys found for caller {}", caller));
        }
        // TODO: remove session key that expired
        Ok(format!(
            "Session key {} removed successfully for {}",
            session_key.key, caller
        ))
    }

    pub fn use_session_key(
        &mut self,
        caller: &Identity,
        session_key: SessionKey,
        native_verifier_blob: Option<&Blob>,
        tx_hash: &TxHash,
        tx_ctx: &Option<TxContext>,
    ) -> Result<String, String> {
        let Some(tx_ctx) = tx_ctx else {
            return Err("tx_ctx is missing".to_string());
        };
        let Some(native_verifier_blob) = native_verifier_blob else {
            return Err("Native verifier blob is missing".to_string());
        };
        let Some(user_session_keys) = self.session_keys.get_mut(caller) else {
            return Err(format!("No session keys found for caller {}", caller));
        };

        if !user_session_keys.contains(&session_key) {
            return Err(format!(
                "Session key {} not found for caller {}",
                session_key.key, caller
            ));
        }
        // On veut vérifier que le nonce du native blob est correct
        let secp_data: Secp256k1Blob = borsh::from_slice(&native_verifier_blob.data.0)
            .map_err(|_| "Failed to decode Secp256k1Blob".to_string())?;

        // Verify that the identity matches the caller
        if secp_data.identity != *caller {
            return Err("Secp256k1Blob identity does not match the caller".to_string());
        }
        let mut hasher = Sha256::new();
        hasher.update(tx_hash.0.as_bytes());
        hasher.update(session_key.nonce.to_le_bytes());
        let message_hash: [u8; 32] = hasher.finalize().into();
        if secp_data.data != message_hash {
            return Err("Secp256k1Blob data does not match the expected data".to_string());
        }

        // On veut vérifier que le timestamp du contexte est avant l'expiration date dans le native blob
        if session_key.expiration_date < tx_ctx.timestamp {
            return Err("Session key has expired".to_string());
        }

        if let Some(s) = user_session_keys.iter_mut().find(|s| **s == session_key) {
            s.nonce += 1;
        }

        Ok("Session key used successfully".to_string())
    }
}

/// Enum representing possible calls to ERC-20 contract functions.
#[derive(Serialize, Deserialize, BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum SessionKeyManagerAction {
    Add { session_key: SessionKey },
    Revoke { session_key: SessionKey },
    Use { session_key: SessionKey },
}

impl ContractAction for SessionKeyManagerAction {
    fn as_blob(
        &self,
        contract_name: ContractName,
        caller: Option<BlobIndex>,
        callees: Option<Vec<BlobIndex>>,
    ) -> Blob {
        Blob {
            contract_name,
            data: BlobData::from(StructuredBlobData {
                caller,
                callees,
                parameters: self.clone(),
            }),
        }
    }
}
