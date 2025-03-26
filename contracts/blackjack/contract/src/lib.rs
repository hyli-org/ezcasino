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

use sdk::{BlockHash, Identity, RunResult};

#[cfg(feature = "client")]
pub mod client;

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
            BlackJackAction::Hit => self.hit(user, &tx_ctx.block_hash)?,
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
}

/// Enum representing possible calls to the contract functions.
#[derive(Serialize, Deserialize, BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum BlackJackAction {
    Init,
    Hit,
    Stand,
    DoubleDown,
}

impl BlackJackAction {
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
                return Err("Finish the ongoing first!".to_string());
            }
        }

        let mut hasher = SipHasher::new();
        hasher.write(blockhash.0.as_bytes());
        let mut rnd = hasher.into_rng();

        let card_1: u32 = *CARDS.get(rnd.random_range(0..(CARDS.len() - 1))).unwrap();
        let card_2: u32 = *CARDS.get(rnd.random_range(0..(CARDS.len() - 1))).unwrap();
        let card_3: u32 = *CARDS.get(rnd.random_range(0..(CARDS.len() - 1))).unwrap();
        let card_4: u32 = *CARDS.get(rnd.random_range(0..(CARDS.len() - 1))).unwrap();

        let mut table = Table::default();

        table.user.push(card_1);
        table.bank.push(card_2);
        table.user.push(card_3);
        table.bank.push(card_4);

        let user_score = Self::compute_score(table.user.as_slice());

        if user_score == 21_u32 {
            table.state = TableState::Won;
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
                table.bet = 0;
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

    fn compute_score(cards: &[u32]) -> u32 {
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

        let bank_score = Self::compute_score(&table.bank);

        if bank_score <= 16 {
            table.bank.push(Self::pick_random_card(&mut rnd));
        }

        let user_score = Self::compute_score(table.user.as_slice());

        if user_score == 21_u32 {
            table.state = TableState::Won;
            Ok(format!(
                "Hit for user {user} with block hash {blockhash}, BLACKJACK!!!!",
                user = user,
                blockhash = blockhash.0
            ))
        } else if user_score > 21_u32 {
            table.state = TableState::Lost;
            table.bet = 0;
            Ok(format!(
                "Hit for user {user} with block hash {blockhash}, BURST, you loose",
                user = user,
                blockhash = blockhash.0
            ))
        } else {
            let bank_score = Self::compute_score(table.bank.as_slice());
            if bank_score == 21_u32 {
                table.state = TableState::Lost;
                table.bet = 0;
                Ok(format!(
                    "Hit for user {user} with block hash {blockhash} Bank made 21, you loose",
                    user = user,
                    blockhash = blockhash.0
                ))
            } else if bank_score > 21_u32 {
                table.state = TableState::Won;
                Ok(format!(
                    "Hit for user {user} with block hash {blockhash}, Bank burst, you win!",
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
    }
    pub fn stand(&mut self, user: &Identity) -> Result<String, String> {
        let Some(table) = self.tables.get_mut(user) else {
            return Err("Table not setup. Start a new game first".to_string());
        };

        if !matches!(table.state, TableState::Ongoing) {
            return Err("Cannot hit on finished game!".to_string());
        }

        let user_score = Self::compute_score(&table.user);
        let bank_score = Self::compute_score(&table.bank);

        if user_score == bank_score {
            // Recupere mise
            table.state = TableState::Won;
            Ok(format!(
                "Stand for user {user}, get back money",
                user = user,
            ))
        } else if user_score > bank_score {
            table.state = TableState::Won;
            Ok(format!("Stand for user {user}, you win", user = user,))
        } else {
            table.state = TableState::Lost;
            table.bet = 0;
            Ok(format!("Stand for user {user}, you loose", user = user,))
        }
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

#[test]
fn test_compute_scoress() {
    assert_eq!(BlackJack::compute_score(&[1, 2, 3]), 16);
    assert_eq!(BlackJack::compute_score(&[1, 2, 1, 3]), 17);
    assert_eq!(BlackJack::compute_score(&[1, 2, 3, 4, 10]), 20);
    assert_eq!(BlackJack::compute_score(&[1, 2, 8, 3, 4, 10]), 28);
}
