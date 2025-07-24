// Suppress the realloc deprecation warning from the program macro
#![allow(deprecated)]
// Suppress the unexpected `cfg` condition value from the program macro
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod error;
pub mod state;

use error::SensorStreamError;
use state::*;

declare_id!("FWgDVkn3UHSRNgiA4WGM5Qo4LvdFTufivURpkZMiYPYo");

#[program]
pub mod sensorstream {
    use super::*;

    pub fn submit_reading(ctx: Context<SubmitReading>, value: u16, timestamp: i64) -> Result<()> {
        // Use AccountLoader's load_init as fallback for load_mut
        // to set the discriminator
        let mut buffer = match ctx.accounts.buffer.load_mut() {
            Ok(v) => v,
            Err(_) => ctx.accounts.buffer.load_init()?,
        };

        // Replay protection
        let last_timestamp =
            buffer.readings[(buffer.idx as usize + 7) % buffer.readings.len()].timestamp;
        if timestamp <= last_timestamp {
            return Err(SensorStreamError::StaleTimestamp.into());
        }

        // Write reading into circular buffer
        let idx = buffer.idx as usize;
        buffer.readings[idx] = Reading {
            value,
            timestamp,
            _padding: [0; 6],
        };
        buffer.idx = (buffer.idx + 1) % buffer.readings.len() as u8;

        // Emit event
        emit!(ReadingSubmitted {
            bot: ctx.accounts.bot.key(),
            value,
            timestamp,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct SubmitReading<'info> {
    #[account(mut, signer)]
    pub bot: Signer<'info>,
    #[account(
        init_if_needed,
        seeds = [b"sensor", bot.key().as_ref()],
        bump,
        payer = bot,
        space = 8 + SensorBuffer::SIZE
    )]
    pub buffer: AccountLoader<'info, SensorBuffer>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct ReadingSubmitted {
    pub bot: Pubkey,
    pub value: u16,
    pub timestamp: i64,
}
