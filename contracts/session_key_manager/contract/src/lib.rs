use std::collections::BTreeMap;

use borsh::{BorshDeserialize, BorshSerialize};
use sdk::utils::parse_contract_input;
use sdk::{
    Blob, BlobData, BlobIndex, ContractAction, ContractInput, ContractName, Identity,
    StructuredBlobData,
};
use sdk::{HyleContract, RunResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

extern crate alloc;

#[cfg(feature = "client")]
pub mod client;

impl HyleContract for SessionKeyManager {
    fn execute(&mut self, contract_input: &ContractInput) -> RunResult {
        let (action, execution_ctx) =
            parse_contract_input::<SessionKeyManagerAction>(contract_input)?;

        let output = match action {
            SessionKeyManagerAction::Add { session_key } => {
                self.add_session_key(execution_ctx.caller, session_key)
            }
            SessionKeyManagerAction::Revoke { session_key } => {
                self.revoke_session_key(execution_ctx.caller, session_key)
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
                hasher.update(session_key.as_bytes());
            }
        }
        sdk::StateCommitment(hasher.finalize().to_vec())
    }
}

type SessionKey = String; // Placeholder for actual session key type

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Debug, Clone, Default)]
pub struct SessionKeyManager {
    session_keys: BTreeMap<Identity, Vec<SessionKey>>, // <Identity, vec![SessionKey]>
}

impl SessionKeyManager {
    pub fn add_session_key(
        &mut self,
        caller: Identity,
        session_key: SessionKey,
    ) -> Result<(), String> {
        if let Some(session_keys) = self.session_keys.get_mut(&caller) {
            session_keys.push(session_key.clone());
        } else {
            self.session_keys
                .insert(caller.clone(), vec![session_key.clone()]);
        }
        Ok(())
    }

    pub fn revoke_session_key(
        &mut self,
        caller: Identity,
        session_key: SessionKey,
    ) -> Result<(), String> {
        if let Some(session_keys) = self.session_keys.get_mut(&caller) {
            if let Some(index) = session_keys.iter().position(|key| key == &session_key) {
                session_keys.remove(index);
            } else {
                return Err(format!(
                    "Session key {} not found for caller {}",
                    session_key, caller
                ));
            }
        } else {
            return Err(format!("No session keys found for caller {}", caller));
        }
        Ok(())
    }
}

/// Enum representing possible calls to ERC-20 contract functions.
#[derive(Serialize, Deserialize, BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum SessionKeyManagerAction {
    Add { session_key: SessionKey },
    Revoke { session_key: SessionKey },
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
