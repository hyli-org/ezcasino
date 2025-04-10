pub mod metadata {
    pub const SESSION_KEY_MANAGER_ELF: &[u8] = include_bytes!("../../session-key-manager.img");
    pub const PROGRAM_ID: [u8; 32] = sdk::str_to_u8(include_str!("../../session-key-manager.txt"));
}
use metadata::*;
