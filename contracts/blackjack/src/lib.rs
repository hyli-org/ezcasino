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
use sdk::caller::ExecutionContext;
use sdk::{Blob, BlobData, BlobIndex, Calldata, ContractAction, StructuredBlobData};
use serde::{Deserialize, Serialize};

use hyle_smt_token::SmtTokenAction;
use sdk::{BlockHash, ContractName, Identity, RunResult};

#[cfg(feature = "client")]
use crate::client::OptimisticBlackJack;

#[cfg(feature = "client")]
pub mod client;

impl sdk::FullStateRevert for BlackJack {}

impl sdk::ZkContract for BlackJack {
    /// Entry point of the contract's logic
    fn execute(&mut self, calldata: &sdk::Calldata) -> RunResult {
        // Parse contract inputs
        let (action, mut ctx) = sdk::utils::parse_calldata::<BlackJackAction>(calldata)?;

        let user = &calldata.identity;

        let Some(tx_ctx) = calldata.tx_ctx.as_ref() else {
            return Err("Missing tx context necessary for this contract".to_string());
        };

        // Execute the given action
        let res = match action {
            BlackJackAction::Init(bet) => self.new_game(user, &tx_ctx.block_hash, bet)?,
            BlackJackAction::Hit => self.hit(user, &tx_ctx.block_hash)?,
            BlackJackAction::Stand => self.stand(user)?,
            BlackJackAction::DoubleDown => self.double_down(user)?,
            BlackJackAction::Deposit(amount) => self.claim(amount, user, calldata, &ctx)?,
            BlackJackAction::Withdraw(amount, token) => {
                self.withdraw(amount, user, token, &mut ctx)?
            }
            BlackJackAction::CleanTick(_nonce) => {
                // Remove all tables and balances that are 0
                self.tables
                    .retain(|_, table| !matches!(table.state, TableState::Ongoing));
                self.oranj_balances.retain(|_, &mut balance| balance > 0);
                self.vitamin_balances.retain(|_, &mut balance| balance > 0);
                "Cleaned state".to_string()
            }
        };

        Ok((res.into(), ctx, alloc::vec![]))
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
    pub oranj_balances: BTreeMap<Identity, u32>,
    pub vitamin_balances: BTreeMap<Identity, u32>,
    #[cfg(feature = "client")]
    #[serde(skip)]
    #[borsh(skip)]
    pub optimistic_state: OptimisticBlackJack,
}

/// Enum representing possible calls to the contract functions.
#[derive(Serialize, Deserialize, BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum BlackJackAction {
    Init(u32),
    Hit,
    Stand,
    DoubleDown,
    Deposit(u32),
    Withdraw(u32, String), // amount, token ("oranj" or "vitamin")
    CleanTick(u128),       // remove all tables and balances that are 0
}

impl ContractAction for BlackJackAction {
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

impl BlackJack {
    pub fn as_bytes(&self) -> Result<Vec<u8>, Error> {
        borsh::to_vec(self)
    }
}

impl BlackJack {
    pub fn new_game(
        &mut self,
        user: &Identity,
        blockhash: &BlockHash,
        bet: u32,
    ) -> Result<String, String> {
        if let Some(table) = self.tables.get(user) {
            if matches!(table.state, TableState::Ongoing) {
                return Ok(format!("Game already started for user {user}", user = user,));
            }
        }

        if bet < 10 {
            return Err("Minimum bet is 10".to_string());
        }

        // Check if user has enough balance for a bet
        let balance = self.oranj_balances.get(user).copied().unwrap_or(0);
        if balance < bet {
            return Err(format!(
                "Insufficient balance. You have {} but bet is {}",
                balance, bet
            ));
        }

        let mut hasher = SipHasher::new();
        hasher.write(blockhash.0.as_bytes());
        let mut rnd = hasher.into_rng();

        let card_1: u32 = *CARDS.get(rnd.random_range(0..(CARDS.len() - 1))).unwrap();
        let card_2: u32 = *CARDS.get(rnd.random_range(0..(CARDS.len() - 1))).unwrap();
        let card_3: u32 = *CARDS.get(rnd.random_range(0..(CARDS.len() - 1))).unwrap();
        let card_4: u32 = *CARDS.get(rnd.random_range(0..(CARDS.len() - 1))).unwrap();

        let mut table = Table {
            bet,
            ..Default::default()
        };

        // Deduct bet from balance
        if let Some(balance) = self.oranj_balances.get_mut(user) {
            *balance -= table.bet;
        } else {
            self.oranj_balances
                .insert(user.clone(), balance - table.bet);
        }

        table.user.push(card_1);
        table.bank.push(card_2);
        table.user.push(card_3);
        table.bank.push(card_4);

        let user_score = Self::compute_score(table.user.as_slice());

        if user_score == 21_u32 {
            table.state = TableState::Won;
            // Return bet in Oranj tokens
            if let Some(balance) = self.oranj_balances.get_mut(user) {
                *balance += table.bet;
            } else {
                self.oranj_balances.insert(user.clone(), table.bet);
            }
            // Award same amount in Vitamin tokens
            if let Some(balance) = self.vitamin_balances.get_mut(user) {
                *balance += table.bet;
            } else {
                self.vitamin_balances.insert(user.clone(), table.bet);
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
        let mut possible_scores: Vec<u32> = vec![0];

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

        match user_score {
            21 => {
                table.state = TableState::Won;
                // Return bet in Oranj tokens
                if let Some(balance) = self.oranj_balances.get_mut(user) {
                    *balance += table.bet;
                } else {
                    self.oranj_balances.insert(user.clone(), table.bet);
                }
                // Award same amount in Vitamin tokens
                if let Some(balance) = self.vitamin_balances.get_mut(user) {
                    *balance += table.bet;
                } else {
                    self.vitamin_balances.insert(user.clone(), table.bet);
                }
                Ok(format!(
                    "Hit for user {user} with block hash {blockhash}, BLACKJACK!!!!",
                    user = user,
                    blockhash = blockhash.0
                ))
            }
            score if score > 21 => {
                table.state = TableState::Lost;
                Ok(format!(
                    "Hit for user {user} with block hash {blockhash}, BURST, you loose",
                    user = user,
                    blockhash = blockhash.0
                ))
            }
            _ => {
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
            // Return bet in Oranj tokens
            if let Some(balance) = self.oranj_balances.get_mut(user) {
                *balance += table.bet;
            } else {
                self.oranj_balances.insert(user.clone(), table.bet);
            }
            // Award same amount in Vitamin tokens
            if let Some(balance) = self.vitamin_balances.get_mut(user) {
                *balance += table.bet;
            } else {
                self.vitamin_balances.insert(user.clone(), table.bet);
            }
            Ok(format!(
                "Stand for user {user}, Bank burst, you win!",
                user = user,
            ))
        } else if user_score == bank_score {
            // Push bet back (tie) - return the bet in Oranj tokens
            table.state = TableState::Won;
            if let Some(balance) = self.oranj_balances.get_mut(user) {
                *balance += table.bet;
            } else {
                self.oranj_balances.insert(user.clone(), table.bet);
            }
            Ok(format!(
                "Stand for user {user}, get back money",
                user = user,
            ))
        } else if user_score > bank_score {
            table.state = TableState::Won;
            // Return bet in Oranj tokens
            if let Some(balance) = self.oranj_balances.get_mut(user) {
                *balance += table.bet;
            } else {
                self.oranj_balances.insert(user.clone(), table.bet);
            }
            // Award same amount in Vitamin tokens
            if let Some(balance) = self.vitamin_balances.get_mut(user) {
                *balance += table.bet;
            } else {
                self.vitamin_balances.insert(user.clone(), table.bet);
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
        let balance = self.oranj_balances.get(user).copied().unwrap_or(0);
        if balance < table.bet {
            return Err("Insufficient balance for double down".to_string());
        }

        // Double the bet
        table.bet *= 2;

        // Deduct additional bet from balance
        if let Some(balance) = self.oranj_balances.get_mut(user) {
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
                // Return bet in Oranj tokens
                if let Some(balance) = self.oranj_balances.get_mut(user) {
                    *balance += table.bet;
                } else {
                    self.oranj_balances.insert(user.clone(), table.bet);
                }
                // Award same amount in Vitamin tokens
                if let Some(balance) = self.vitamin_balances.get_mut(user) {
                    *balance += table.bet;
                } else {
                    self.vitamin_balances.insert(user.clone(), table.bet);
                }
                Ok(format!(
                    "DoubleDown for user {user}, bet doubled to {}, Bank burst, you win!",
                    table.bet,
                    user = user
                ))
            } else if user_score > bank_score {
                table.state = TableState::Won;
                // Return bet in Oranj tokens
                if let Some(balance) = self.oranj_balances.get_mut(user) {
                    *balance += table.bet;
                } else {
                    self.oranj_balances.insert(user.clone(), table.bet);
                }
                // Award same amount in Vitamin tokens
                if let Some(balance) = self.vitamin_balances.get_mut(user) {
                    *balance += table.bet;
                } else {
                    self.vitamin_balances.insert(user.clone(), table.bet);
                }
                Ok(format!(
                    "DoubleDown for user {user}, bet doubled to {}, you win!",
                    table.bet,
                    user = user
                ))
            } else if user_score == bank_score {
                // Push bet back (tie) - return the bet in Oranj tokens
                table.state = TableState::Won;
                if let Some(balance) = self.oranj_balances.get_mut(user) {
                    *balance += table.bet;
                } else {
                    self.oranj_balances.insert(user.clone(), table.bet);
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

    pub fn claim(
        &mut self,
        amount: u32,
        user: &Identity,
        calldata: &Calldata,
        ctx: &ExecutionContext,
    ) -> Result<String, String> {
        // Find the oranj transfer blob
        let transfer_blob_index = calldata
            .blobs
            .iter()
            .position(|(_, b)| b.contract_name == ContractName("oranj".to_string()))
            .ok_or_else(|| "Missing Oranj transfer blob".to_string())?;

        let transfer_action = sdk::utils::parse_structured_blob::<SmtTokenAction>(
            &calldata.blobs,
            &sdk::BlobIndex(transfer_blob_index),
        )
        .ok_or_else(|| "Failed to decode Oranj transfer action".to_string())?
        .data
        .parameters;

        // Verify the transfer is for this contract and extract amount
        match transfer_action {
            SmtTokenAction::Transfer {
                sender,
                recipient,
                amount: transfer_amount,
            } => {
                if amount as u128 != transfer_amount {
                    return Err("Transfer amount is not the same as the deposit amount".to_string());
                }
                if &sender != user {
                    return Err("Transfer is not from the user".to_string());
                }
                if recipient.0 != ctx.contract_name.0 {
                    return Err("Transfer is not for the blackjack contract".to_string());
                }

                // Add to existing balance or create new balance
                let new_balance = if let Some(current_balance) = self.oranj_balances.get(user) {
                    current_balance
                        .checked_add(amount)
                        .ok_or_else(|| "Balance overflow".to_string())?
                } else {
                    amount
                };

                self.oranj_balances.insert(user.clone(), new_balance);

                Ok(format!(
                    "Added {} to balance, new balance is {} for user {}",
                    amount, new_balance, user
                ))
            }
            _ => Err("Invalid Oranj action type, expected Transfer".to_string()),
        }
    }

    pub fn withdraw(
        &mut self,
        amount: u32,
        user: &Identity,
        token: String,
        ctx: &mut ExecutionContext,
    ) -> Result<String, String> {
        // Check if user has an ongoing game
        if let Some(table) = self.tables.get(user) {
            if matches!(table.state, TableState::Ongoing) {
                return Err("Cannot withdraw while a game is in progress".to_string());
            }
        }

        match token.as_str() {
            "oranj" => {
                let Some(current_balance) = self.oranj_balances.get(user).cloned() else {
                    return Err("Unknown user, can't withdraw Oranj".to_string());
                };
                if amount > current_balance {
                    return Err("Insufficient Oranj balance to withdraw".to_string());
                }
                ctx.is_in_callee_blobs(
                    &"oranj".into(),
                    SmtTokenAction::Transfer {
                        sender: "blackjack".into(),
                        recipient: user.clone(),
                        amount: amount as u128,
                    },
                )?;

                self.oranj_balances
                    .insert(user.clone(), current_balance - amount);
                Ok(format!(
                    "Withdrew {} Oranj tokens to {}'s balance",
                    amount, user
                ))
            }
            "vitamin" => {
                let Some(current_balance) = self.vitamin_balances.get(user).cloned() else {
                    return Err("Unknown user, can't withdraw Vitamin".to_string());
                };
                if amount > current_balance {
                    return Err("Insufficient Vitamin balance to withdraw".to_string());
                }
                ctx.is_in_callee_blobs(
                    &"vitamin".into(),
                    SmtTokenAction::Transfer {
                        sender: "blackjack".into(),
                        recipient: user.clone(),
                        amount: amount as u128,
                    },
                )?;

                self.vitamin_balances
                    .insert(user.clone(), current_balance - amount);
                Ok(format!(
                    "Withdrew {} Vitamin tokens to {}'s balance",
                    amount, user
                ))
            }
            _ => Err("Invalid token type. Use 'oranj' or 'vitamin'".to_string()),
        }
    }
}

impl From<sdk::StateCommitment> for BlackJack {
    fn from(state: sdk::StateCommitment) -> Self {
        borsh::from_slice(&state.0)
            .map_err(|_| "Could not decode oranj state".to_string())
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
