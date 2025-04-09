pub mod metadata {
    pub const ELF: &[u8] =
        include_bytes!("../../methods/session_key_manager_guest/session_key_manager_guest.img");
    pub const PROGRAM_ID: [u8; 32] = sdk::str_to_u8(include_str!(
        "../../methods/session_key_manager_guest/session_key_manager_guest.txt"
    ));
}
