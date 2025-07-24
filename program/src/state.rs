use anchor_lang::prelude::*;
use bytemuck::{Pod, Zeroable};

#[account(zero_copy)]
#[repr(C)]
pub struct SensorBuffer {
    pub readings: [Reading; 8],
    pub idx: u8,
    pub bump: u8,
    pub _padding: [u8; 6],
}

impl SensorBuffer {
    pub const SIZE: usize = std::mem::size_of::<Self>();
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Copy, Clone, Pod, Zeroable)]
#[repr(C)]
pub struct Reading {
    pub value: u16,
    pub _padding: [u8; 6],
    pub timestamp: i64,
}

impl Reading {
    pub const SIZE: usize = std::mem::size_of::<Self>();
}
