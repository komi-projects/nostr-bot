# SimpleRecover Nostr Automation

A self-contained Nostr social media automation system for SimpleRecover — a Stripe payment recovery SaaS. Generates a Nostr keypair, publishes posts to public relays, and schedules a week's worth of content.

## Quick Start

### 1. Install dependencies

```bash
cd /root/.openclaw/workspace/ventures/nostr-automation
npm install
```

(Already done if you're reading this.)

### 2. Generate your Nostr keypair

```bash
node nostr-setup.js
```

This creates `config.json` containing:
- `npub` — your public Nostr identifier (share this)
- `nsec` — your private key (keep secret, back it up)
- `pubkey` (hex) — raw public key for protocol use

**⚠️ Backup your `nsec` immediately.** If you lose it, you lose the account. There is no password reset on Nostr.

### 3. Post the launch announcement

```bash
node post-simple-recover.js
```

This creates a Nostr event (kind 1 text note) with the SimpleRecover launch message and publishes it to all 12 configured relays.

### 4. Run the content scheduler

```bash
# See what's queued
node content-scheduler.js --list

# Post the next item immediately
node content-scheduler.js --run-now

# Post all remaining items (2s delay between each)
node content-scheduler.js --run-all

# Run as daemon — posts every 24 hours
node content-scheduler.js --daemon

# Reset queue if you want to start over
node content-scheduler.js --reset
```

## File Reference

| File | Purpose |
|------|---------|
| `nostr-setup.js` | Generates keypair, stores in `config.json` |
| `post-simple-recover.js` | One-shot launch announcement poster |
| `content-scheduler.js` | Queue-based scheduler with 7 pre-loaded posts |
| `relay-list.json` | 12 public Nostr relays |
| `config.json` | Your keys + relay config (created by setup) |
| `post-queue.json` | Queue state (created by scheduler) |
| `posted-events.json` | Log of all published events |

## The 7-Day Post Plan

| Day | Topic | Status |
|-----|-------|--------|
| 0 | Launch announcement | ⏳ Ready |
| 1 | Payment recovery tip | ⏳ Ready |
| 2 | Stripe dunning stats | ⏳ Ready |
| 3 | Churn prevention | ⏳ Ready |
| 4 | Failed payment cost | ⏳ Ready |
| 5 | SimpleRecover features | ⏳ Ready |
| 6 | Call to action | ⏳ Ready |

All posts are pre-written in `content-scheduler.js` and tagged with `#simple-recover`, `#saas`, `#payments`.

## Relay List

12 public relays configured in `relay-list.json`:

- `wss://relay.damus.io`
- `wss://relay.nostr.band`
- `wss://nos.lol`
- `wss://relay.nostr.bg`
- `wss://relay.snort.social`
- `wss://offchain.pub`
- `wss://nostr.wine`
- `wss://eden.nostr.land`
- `wss://nostr.mom`
- `wss://puravida.nostr.land`
- `wss://relay.orangepill.dev`
- `wss://nostr.oxtr.dev`

## How It Works (Protocol-Level)

Nostr is a simple, open protocol for censorship-resistant social media:

1. **Keys**: You own your identity via secp256k1 keypair (like Bitcoin). No server, no signup.
2. **Events**: Everything is a signed JSON object ("event") with a `kind` (text note = 1).
3. **Relays**: WebSocket servers that store and forward events. Anyone can run one.
4. **Clients**: Apps like Damus, Amethyst, or Iris that read from relays and display content.

This tool uses `nostr-tools` for cryptography (key generation, event signing) and raw WebSocket for relay communication.

### Event Structure

```json
{
  "id": "<sha256-of-serialized-event>",
  "pubkey": "<your-public-key-hex>",
  "created_at": 1716451200,
  "kind": 1,
  "tags": [
    ["t", "simple-recover"],
    ["t", "saas"]
  ],
  "content": "Your post text here...",
  "sig": "<secp256k1-signature>"
}
```

## Verifying Your Posts

Once posted, you can find your content on:

- **Nostr Explorer**: https://nostr.band/ — paste your `npub` to see all your posts
- **Iris.to**: https://iris.to/ — web client, search your npub
- **Snort.social**: https://snort.social/ — another web client

## Security Notes

- `config.json` contains your `nsec` (private key). Protect it.
- Never commit `config.json` to a public repo.
- The `nsec` is the only thing that proves ownership of your npub. Lose it = lose the identity.

## Extending

- **Add more posts**: Edit the `DEFAULT_POSTS` array in `content-scheduler.js`, then `--reset`.
- **Add more relays**: Edit `relay-list.json`.
- **Custom tags**: Pass extra tags in `buildEvent()` calls.
- **Different event kinds**: Change `kind` to 30023 for long-form articles, 9734 for zaps, etc.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "No config.json found" | Run `node nostr-setup.js` first |
| All relays fail | Check network. Try `wss://relay.damus.io` manually |
| Event not showing on clients | Relays take time to gossip. Wait 30-60s. |
| "nsec" shows undefined | You may be using an old nostr-tools version. Run `npm install` |

## Dependencies

- `nostr-tools` — Nostr cryptography and utilities
- `ws` — WebSocket client for relay connections

Both are pure JS, no native dependencies.

---

Built for SimpleRecover. Don't worry. Even if the world forgets, it'll be on the relays. ❤️‍🔥
