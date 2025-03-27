#![no_std]

extern crate alloc;

use core::hash::Hasher;

use alloc::vec::Vec;
use alloc::{
    collections::btree_map::BTreeMap,
    format,
    string::{String, ToString},
};
use borsh::{io::Error, BorshDeserialize, BorshSerialize};
use rand::Rng;
use rand_seeder::{SipHasher, SipRng};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use hyle_hyllar::HyllarAction;
use sdk::{BlockHash, ContractName, Identity, RunResult};

#[cfg(feature = "client")]
pub mod client;

#[derive(Debug, borsh::BorshSerialize, borsh::BorshDeserialize)]
pub struct Secp256k1Blob {
    pub identity: Identity,
    pub data: [u8; 32],
    pub public_key: [u8; 33],
    pub signature: [u8; 64],
}

impl sdk::HyleContract for BlackJack {
    /// Entry point of the contract's logic
    fn execute(&mut self, contract_input: &sdk::ContractInput) -> RunResult {
        // Parse contract inputs
        let (action, ctx) = sdk::utils::parse_raw_contract_input::<UniqueAction>(contract_input)?;

        let user = &contract_input.identity;

        let Some(tx_ctx) = contract_input.tx_ctx.as_ref() else {
            return Err("Missing tx context necessary for this contract".to_string());
        };

        // Verify Secp256k1Blob
        let secp_blob = contract_input
            .blobs
            .iter()
            .find(|b| b.contract_name == ContractName("secp256k1".to_string()))
            .ok_or_else(|| "Missing Secp256k1Blob".to_string())?;

        let secp_data: Secp256k1Blob = borsh::from_slice(&secp_blob.data.0)
            .map_err(|_| "Failed to decode Secp256k1Blob".to_string())?;

        // Verify that the identity matches the user
        if secp_data.identity != *user {
            return Err("Secp256k1Blob identity does not match the user".to_string());
        }

        // Verify that the data matches the action
        let expected_data = match action.action {
            BlackJackAction::Init => "init",
            BlackJackAction::Hit => "hit",
            BlackJackAction::Stand => "stand",
            BlackJackAction::DoubleDown => "double_down",
            BlackJackAction::Claim => "claim",
        };

        // Create message hash using SHA256 like in the server
        let mut hasher = Sha256::new();
        hasher.update(expected_data.as_bytes());
        let message_hash: [u8; 32] = hasher.finalize().into();
        if secp_data.data != message_hash {
            return Err("Secp256k1Blob data does not match the action".to_string());
        }

        // Execute the given action
        let res = match action.action {
            BlackJackAction::Init => self.new_game(user, &tx_ctx.block_hash)?,
            BlackJackAction::Hit => self.hit(user, &tx_ctx.block_hash)?,
            BlackJackAction::Stand => self.stand(user)?,
            BlackJackAction::DoubleDown => self.double_down(user)?,
            BlackJackAction::Claim => {
                // Find the Hyllar transfer blob
                let transfer_blob_index = contract_input
                    .blobs
                    .iter()
                    .position(|b| b.contract_name == ContractName("hyllar".to_string()))
                    .ok_or_else(|| "Missing Hyllar transfer blob".to_string())?;

                let transfer_action = sdk::utils::parse_structured_blob::<HyllarAction>(
                    &contract_input.blobs,
                    &sdk::BlobIndex(transfer_blob_index),
                )
                .ok_or_else(|| "Failed to decode Hyllar transfer action".to_string())?
                .data
                .parameters;

                // Verify the transfer is for this contract and extract amount
                match transfer_action {
                    HyllarAction::Transfer { recipient, amount } => {
                        if recipient != ctx.contract_name.0 {
                            return Err("Transfer is not for the blackjack contract".to_string());
                        }

                        // Add to existing balance or create new balance
                        let new_balance = if let Some(current_balance) = self.balances.get(user) {
                            current_balance
                                .checked_add(amount as u32)
                                .ok_or_else(|| "Balance overflow".to_string())?
                        } else {
                            amount as u32
                        };

                        self.balances.insert(user.clone(), new_balance);

                        Ok(format!(
                            "Added {} to balance, new balance is {} for user {}",
                            amount, new_balance, user
                        ))
                    }
                    _ => Err("Invalid Hyllar action type, expected Transfer".to_string()),
                }
            }?,
        };

        Ok((res, ctx, alloc::vec![]))
    }

    /// In this example, we serialize the full state on-chain.
    fn commit(&self) -> sdk::StateCommitment {
        sdk::StateCommitment(self.as_bytes().expect("Failed to encode Balances"))
    }
}

pub const CARDS: [u32; 13] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
// pub const NB_CARDPACKS: usize = 6 * 4;
// pub const TOTAL_CARDS: usize = NB_CARDPACKS * CARDS.len();

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Debug, Clone, Default)]
pub enum TableState {
    Lost,
    #[default]
    Ongoing,
    Won,
}

/// The state of the contract, that is totally serialized on-chain
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Debug, Clone, Default)]
pub struct Table {
    // pub remaining_cards: Vec<u32>,
    pub bank: Vec<u32>,
    pub user: Vec<u32>,
    pub bet: u32,
    pub state: TableState,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Debug, Clone, Default)]
pub struct BlackJack {
    pub tables: BTreeMap<Identity, Table>,
    pub balances: BTreeMap<Identity, u32>,
}

#[derive(Serialize, Deserialize, BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub struct UniqueAction {
    pub id: u64, // random, to have a different blob hash, unused in contract
    pub action: BlackJackAction,
}

/// Enum representing possible calls to the contract functions.
#[derive(Serialize, Deserialize, BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum BlackJackAction {
    Init,
    Hit,
    Stand,
    DoubleDown,
    Claim,
}

impl BlackJackAction {
    pub fn with_id(self, id: u64) -> UniqueAction {
        UniqueAction { id, action: self }
    }
}

impl UniqueAction {
    pub fn as_blob(&self, contract_name: sdk::ContractName) -> sdk::Blob {
        sdk::Blob {
            contract_name,
            data: sdk::BlobData(borsh::to_vec(self).expect("Failed to encode BlackJackAction")),
        }
    }
}

impl BlackJack {
    pub fn as_bytes(&self) -> Result<Vec<u8>, Error> {
        borsh::to_vec(self)
    }
}

impl BlackJack {
    pub fn new_game(&mut self, user: &Identity, blockhash: &BlockHash) -> Result<String, String> {
        if let Some(table) = self.tables.get(user) {
            if matches!(table.state, TableState::Ongoing) {
                return Ok(format!("Game already started for user {user}", user = user,));
            }
        }

        // Check if user has enough balance for a bet
        let balance = self.balances.get(user).copied().unwrap_or(0);
        if balance < 10 {
            return Err("Insufficient balance. Minimum bet is 10".to_string());
        }

        let mut hasher = SipHasher::new();
        hasher.write(blockhash.0.as_bytes());
        let mut rnd = hasher.into_rng();

        let card_1: u32 = *CARDS.get(rnd.random_range(0..(CARDS.len() - 1))).unwrap();
        let card_2: u32 = *CARDS.get(rnd.random_range(0..(CARDS.len() - 1))).unwrap();
        let card_3: u32 = *CARDS.get(rnd.random_range(0..(CARDS.len() - 1))).unwrap();
        let card_4: u32 = *CARDS.get(rnd.random_range(0..(CARDS.len() - 1))).unwrap();

        let mut table = Table {
            bet: 10, // minimum bet
            ..Default::default()
        };

        // Deduct bet from balance
        if let Some(balance) = self.balances.get_mut(user) {
            *balance -= table.bet;
        } else {
            self.balances.insert(user.clone(), balance - table.bet);
        }

        table.user.push(card_1);
        table.bank.push(card_2);
        table.user.push(card_3);
        table.bank.push(card_4);

        let user_score = Self::compute_score(table.user.as_slice());

        if user_score == 21_u32 {
            table.state = TableState::Won;
            // Add winnings (2x bet for blackjack)
            if let Some(balance) = self.balances.get_mut(user) {
                *balance += table.bet * 2;
            }
            self.tables.insert(user.clone(), table);
            Ok(format!(
                "Initiated new game for user {user} with block hash {blockhash}, BLACKJACK!!!!",
                user = user,
                blockhash = blockhash.0
            ))
        } else {
            let bank_score = Self::compute_score(table.bank.as_slice());
            if bank_score == 21_u32 {
                table.state = TableState::Lost;
                self.tables.insert(user.clone(), table);
                Ok(format!(
                    "Initiated new game for user {user} with block hash {blockhash} and loose immediately",
                    user = user,
                    blockhash = blockhash.0
                ))
            } else {
                self.tables.insert(user.clone(), table);
                Ok(format!(
                    "Initiated new game for user {user} with block hash {blockhash}",
                    user = user,
                    blockhash = blockhash.0
                ))
            }
        }
    }

    pub fn compute_score(cards: &[u32]) -> u32 {
        let mut possible_scores: Vec<u32> = Vec::new();
        possible_scores.push(0);

        for card in cards.iter() {
            if *card == 1_u32 {
                possible_scores = possible_scores
                    .iter()
                    .flat_map(|score| [score + 1, score + 11])
                    .collect();
            } else {
                possible_scores = possible_scores
                    .iter()
                    .map(|p| {
                        if *card == 11 || *card == 12 || *card == 13 {
                            p + 10
                        } else {
                            p + *card
                        }
                    })
                    .collect();
            }
        }

        possible_scores.sort();

        for score in possible_scores.iter().rev() {
            if *score <= 21 {
                return *score;
            }
        }

        *possible_scores.first().unwrap()
    }

    fn pick_random_card(rnd: &mut SipRng) -> u32 {
        *CARDS.get(rnd.random_range(0..(CARDS.len() - 1))).unwrap()
    }

    pub fn hit(&mut self, user: &Identity, blockhash: &BlockHash) -> Result<String, String> {
        let Some(table) = self.tables.get_mut(user) else {
            return Err("Table not setup. Start a new game first".to_string());
        };

        if !matches!(table.state, TableState::Ongoing) {
            return Err("Cannot hit on finished game!".to_string());
        }

        let mut hasher = SipHasher::new();
        hasher.write(blockhash.0.as_bytes());
        let mut rnd = hasher.into_rng();

        table.user.push(Self::pick_random_card(&mut rnd));

        let user_score = Self::compute_score(table.user.as_slice());

        if user_score == 21_u32 {
            table.state = TableState::Won;
            // Add winnings (2x bet for blackjack)
            if let Some(balance) = self.balances.get_mut(user) {
                *balance += table.bet * 2;
            }
            Ok(format!(
                "Hit for user {user} with block hash {blockhash}, BLACKJACK!!!!",
                user = user,
                blockhash = blockhash.0
            ))
        } else if user_score > 21_u32 {
            table.state = TableState::Lost;
            Ok(format!(
                "Hit for user {user} with block hash {blockhash}, BURST, you loose",
                user = user,
                blockhash = blockhash.0
            ))
        } else {
            // Still Ongoing
            Ok(format!(
                "Hit for user {user} with block hash {blockhash}, still ongoing",
                user = user,
                blockhash = blockhash.0
            ))
        }
    }
    pub fn stand(&mut self, user: &Identity) -> Result<String, String> {
        let Some(table) = self.tables.get_mut(user) else {
            return Err("Table not setup. Start a new game first".to_string());
        };

        if !matches!(table.state, TableState::Ongoing) {
            return Err("Cannot hit on finished game!".to_string());
        }

        let user_score = Self::compute_score(&table.user);

        // Bank's turn - keep drawing cards until score > 16
        let mut hasher = SipHasher::new();
        hasher.write(user.0.as_bytes());
        let mut rnd = hasher.into_rng();

        while Self::compute_score(&table.bank) <= 16 {
            table.bank.push(Self::pick_random_card(&mut rnd));
        }

        let bank_score = Self::compute_score(&table.bank);

        if bank_score > 21_u32 {
            table.state = TableState::Won;
            // Add winnings (2x bet)
            if let Some(balance) = self.balances.get_mut(user) {
                *balance += table.bet * 2;
            }
            Ok(format!(
                "Stand for user {user}, Bank burst, you win!",
                user = user,
            ))
        } else if user_score == bank_score {
            // Push bet back (tie)
            table.state = TableState::Won;
            if let Some(balance) = self.balances.get_mut(user) {
                *balance += table.bet;
            }
            Ok(format!(
                "Stand for user {user}, get back money",
                user = user,
            ))
        } else if user_score > bank_score {
            table.state = TableState::Won;
            // Add winnings (2x bet)
            if let Some(balance) = self.balances.get_mut(user) {
                *balance += table.bet * 2;
            }
            Ok(format!("Stand for user {user}, you win", user = user,))
        } else {
            table.state = TableState::Lost;
            Ok(format!("Stand for user {user}, you loose", user = user,))
        }
    }
    pub fn double_down(&mut self, user: &Identity) -> Result<String, String> {
        let Some(table) = self.tables.get_mut(user) else {
            return Err("Table not setup. Start a new game first".to_string());
        };

        if !matches!(table.state, TableState::Ongoing) {
            return Err("Cannot double down on finished game!".to_string());
        }

        // Check if user has enough balance for double down
        let balance = self.balances.get(user).copied().unwrap_or(0);
        if balance < table.bet {
            return Err("Insufficient balance for double down".to_string());
        }

        // Double the bet
        table.bet *= 2;

        // Deduct additional bet from balance
        if let Some(balance) = self.balances.get_mut(user) {
            *balance -= table.bet / 2;
        }

        // Draw one more card for the player
        let mut hasher = SipHasher::new();
        hasher.write(user.0.as_bytes());
        let mut rnd = hasher.into_rng();
        table.user.push(Self::pick_random_card(&mut rnd));

        let user_score = Self::compute_score(table.user.as_slice());

        if user_score > 21_u32 {
            table.state = TableState::Lost;
            Ok(format!(
                "DoubleDown for user {user}, bet doubled to {}, BURST, you loose",
                table.bet,
                user = user
            ))
        } else {
            // Bank's turn - keep drawing cards until score > 16
            while Self::compute_score(&table.bank) <= 16 {
                table.bank.push(Self::pick_random_card(&mut rnd));
            }

            let bank_score = Self::compute_score(table.bank.as_slice());
            if bank_score == 21_u32 {
                table.state = TableState::Lost;
                Ok(format!(
                    "DoubleDown for user {user}, bet doubled to {}, Bank made 21, you loose",
                    table.bet,
                    user = user
                ))
            } else if bank_score > 21_u32 {
                table.state = TableState::Won;
                // Add winnings (2x bet)
                if let Some(balance) = self.balances.get_mut(user) {
                    *balance += table.bet * 2;
                }
                Ok(format!(
                    "DoubleDown for user {user}, bet doubled to {}, Bank burst, you win!",
                    table.bet,
                    user = user
                ))
            } else if user_score > bank_score {
                table.state = TableState::Won;
                // Add winnings (2x bet)
                if let Some(balance) = self.balances.get_mut(user) {
                    *balance += table.bet * 2;
                }
                Ok(format!(
                    "DoubleDown for user {user}, bet doubled to {}, you win!",
                    table.bet,
                    user = user
                ))
            } else if user_score == bank_score {
                // Push bet back (tie)
                table.state = TableState::Won;
                if let Some(balance) = self.balances.get_mut(user) {
                    *balance += table.bet;
                }
                Ok(format!(
                    "DoubleDown for user {user}, bet doubled to {}, tie, get back money",
                    table.bet,
                    user = user
                ))
            } else {
                table.state = TableState::Lost;
                Ok(format!(
                    "DoubleDown for user {user}, bet doubled to {}, you loose",
                    table.bet,
                    user = user
                ))
            }
        }
    }
}

impl From<sdk::StateCommitment> for BlackJack {
    fn from(state: sdk::StateCommitment) -> Self {
        borsh::from_slice(&state.0)
            .map_err(|_| "Could not decode hyllar state".to_string())
            .unwrap()
    }
}

#[test]
fn test_compute_scoress() {
    assert_eq!(BlackJack::compute_score(&[1, 2, 3]), 16);
    assert_eq!(BlackJack::compute_score(&[1, 2, 1, 3]), 17);
    assert_eq!(BlackJack::compute_score(&[1, 2, 3, 4, 10]), 20);
    assert_eq!(BlackJack::compute_score(&[1, 2, 8, 3, 4, 10]), 28);
}
