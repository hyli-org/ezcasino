pub mod metadata {
    pub const BLACKJACK_ELF: &[u8] = include_bytes!("../../blackjack.img");
    pub const PROGRAM_ID: [u8; 32] = sdk::str_to_u8(include_str!("../../blackjack.txt"));
}
