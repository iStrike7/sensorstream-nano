# SensorStream Nano – Candidate README

Run `yarn` and then `anchor test`

## Timing

- **Rougly 6 hours approx**
- **Not a continous stretch**

## Compute units used

- **submitReading Init: 8k - 16k**
- **submitReading Update: 4k - 12k**

## Approach summary

Key goals:

1. Keep using zerocopy for performance
2. Keep submitReading as the only function that needs to be called by the sensor

Challenges:

1. zerocopy requires repr(C) & original SensorBuffer impl had incompatible padding for repr(C)
2. zerocopy does not work well with init_if_needed

Method:

1. Add correct padding to the SensorBuffer for repr(C) and fix size consts
2. Use AccountLoader's load_init() as fall back to load_mut() to set the discriminator

## Claim reward instruction

In the SensorBuffer we could store a `updates_since_last_claim` field which is updated upon calling submit_reading. Calling claim_rewards transfers the rewards from the vault account based on the `updates_since_last_claim` to the user and resets it. To prevent a sensor from spamming submit_reading we could enforce a min timestamp difference between consecutive reads and compare reading timestamp against block timestamp (or number of blocks).
