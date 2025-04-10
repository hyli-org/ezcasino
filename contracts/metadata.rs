#[allow(unused)]
#[cfg(all(not(clippy), feature = "nonreproducible"))]
mod methods {
    include!(concat!(env!("OUT_DIR"), "/methods.rs"));
}

#[cfg(all(not(clippy), feature = "nonreproducible", feature = "all"))]
mod metadata {
    pub const BLACKJACK_ELF: &[u8] = crate::methods::BLACKJACK_ELF;
    pub const BLACKJACK_ID: [u8; 32] = sdk::to_u8_array(&crate::methods::BLACKJACK_ID);

    pub const SESSION_KEY_MANAGER_ELF: &[u8] = crate::methods::SESSION_KEY_MANAGER_ELF;
    pub const SESSION_KEY_MANAGER_ID: [u8; 32] =
        sdk::to_u8_array(&crate::methods::SESSION_KEY_MANAGER_ID);
}

#[cfg(any(clippy, not(feature = "nonreproducible")))]
mod metadata {
    pub const BLACKJACK_ELF: &[u8] =
        blackjack::client::tx_executor_handler::metadata::BLACKJACK_ELF;
    pub const BLACKJACK_ID: [u8; 32] = blackjack::client::tx_executor_handler::metadata::PROGRAM_ID;

    pub const SESSION_KEY_MANAGER_ELF: &[u8] =
        session_key_manager::client::tx_executor_handler::metadata::SESSION_KEY_MANAGER_ELF;
    pub const SESSION_KEY_MANAGER_ID: [u8; 32] =
        session_key_manager::client::tx_executor_handler::metadata::PROGRAM_ID;
}

pub use metadata::*;
