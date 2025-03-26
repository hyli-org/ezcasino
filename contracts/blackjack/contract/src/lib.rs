#![no_std]

extern crate alloc;

use alloc::{
    collections::btree_map::BTreeMap,
    format,
    string::{String, ToString},
    vec::Vec,
};

use borsh::{io::Error, BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use sdk::{BlockHash, Identity, RunResult};

impl sdk::HyleContract for BlackJack {
    /// Entry point of the contract's logic
    fn execute(&mut self, contract_input: &sdk::ContractInput) -> RunResult {
        // Parse contract inputs
        let (action, ctx) =
            sdk::utils::parse_raw_contract_input::<BlackJackAction>(contract_input)?;

        let user = &contract_input.identity;

        let Some(tx_ctx) = contract_input.tx_ctx.as_ref() else {
            return Err("Missing tx context necessary for this contract".to_string());
        };

        // Execute the given action
        let res = match action {
            BlackJackAction::Init => self.new_game(user, &tx_ctx.block_hash)?,
            BlackJackAction::Hit => self.hit(user)?,
            BlackJackAction::Stand => self.stand(user)?,
            BlackJackAction::DoubleDown => self.double_down(user)?,
        };

        Ok((res, ctx, alloc::vec![]))
    }

    /// In this example, we serialize the full state on-chain.
    fn commit(&self) -> sdk::StateCommitment {
        sdk::StateCommitment(self.as_bytes().expect("Failed to encode Balances"))
    }
}

pub const CARDS: [u32; 13] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10];
pub const NB_CARDPACKS: u32 = 6 * 4;

/// The state of the contract, that is totally serialized on-chain
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Debug, Clone)]
pub struct Table {
    pub withdraw: Vec<u32>,
    pub bank: Vec<u32>,
    pub user: Vec<u32>,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Debug, Clone, Default)]
pub struct BlackJack {
    pub tables: BTreeMap<Identity, Table>,
}

/// Enum representing possible calls to the contract functions.
#[derive(Serialize, Deserialize, BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum BlackJackAction {
    Init,
    Hit,
    Stand,
    DoubleDown,
}

impl BlackJack {
    pub fn as_bytes(&self) -> Result<Vec<u8>, Error> {
        borsh::to_vec(self)
    }
}

impl BlackJack {
    pub fn new_game(&mut self, user: &Identity, blockhash: &BlockHash) -> Result<String, String> {
        Ok(format!(
            "Initiated new game for user {user} with block hash {blockhash}",
            user = user,
            blockhash = blockhash.0
        ))
    }
    pub fn hit(&mut self, user: &Identity) -> Result<String, String> {
        Ok(format!("Hit for user {user}", user = user,))
    }
    pub fn stand(&mut self, user: &Identity) -> Result<String, String> {
        Ok(format!("Stand for user {user}", user = user,))
    }
    pub fn double_down(&mut self, user: &Identity) -> Result<String, String> {
        Ok(format!("DoubleDown for user {user}", user = user,))
    }
}

impl From<sdk::StateCommitment> for BlackJack {
    fn from(state: sdk::StateCommitment) -> Self {
        borsh::from_slice(&state.0)
            .map_err(|_| "Could not decode hyllar state".to_string())
            .unwrap()
    }
}
