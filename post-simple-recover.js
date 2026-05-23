#!/usr/bin/env node
/**
 * post-simple-recover.js
 * Posts a SimpleRecover launch announcement to multiple Nostr relays.
 * Uses nostr-tools for event creation/signing and raw WebSocket for relay publishing.
 */

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { finalizeEvent } = require('nostr-tools');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const RELAYS_PATH = path.join(__dirname, 'relay-list.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ No config.json found. Run: node nostr-setup.js');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function loadRelays() {
  return JSON.parse(fs.readFileSync(RELAYS_PATH, 'utf-8'));
}

function buildLaunchEvent(privateKeyHex, publicKeyHex, content, extraTags = []) {
  const eventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', 'simple-recover'],
      ['t', 'saas'],
      ['t', 'payments'],
      ['t', 'launch'],
      ...extraTags
    ],
    content: content,
    pubkey: publicKeyHex
  };

  // Use finalizeEvent from nostr-tools (handles id + sig in one call)
  // privateKeyHex is stored as hex string; convert to Uint8Array for signing
  const event = finalizeEvent(eventTemplate, Buffer.from(privateKeyHex, 'hex'));
  return event;
}

async function publishToRelay(wsUrl, event, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let done = false;
    const ws = new WebSocket(wsUrl, { handshakeTimeout: timeoutMs });

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        ws.terminate();
        resolve({ relay: wsUrl, status: 'timeout' });
      }
    }, timeoutMs);

    ws.on('open', () => {
      const message = JSON.stringify(['EVENT', event]);
      ws.send(message);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg[0] === 'OK' && msg[1] === event.id) {
          clearTimeout(timer);
          done = true;
          ws.close();
          resolve({ relay: wsUrl, status: 'ok', message: msg[3] || '' });
        }
      } catch (_) {}
    });

    ws.on('error', (err) => {
      if (!done) {
        clearTimeout(timer);
        done = true;
        resolve({ relay: wsUrl, status: 'error', error: err.message });
      }
    });

    ws.on('close', () => {
      if (!done) {
        clearTimeout(timer);
        done = true;
        resolve({ relay: wsUrl, status: 'closed' });
      }
    });
  });
}

async function publishToAllRelays(event, relayUrls, concurrency = 5) {
  const results = [];
  for (let i = 0; i < relayUrls.length; i += concurrency) {
    const batch = relayUrls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(url => publishToRelay(url, event))
    );
    results.push(...batchResults);
  }
  return results;
}

function printResults(results) {
  const ok = results.filter(r => r.status === 'ok');
  const failed = results.filter(r => r.status !== 'ok');

  console.log(`\n📡 Published to ${ok.length}/${results.length} relays`);
  if (ok.length > 0) {
    console.log('   ✅ Success:');
    ok.forEach(r => console.log(`      ${r.relay}`));
  }
  if (failed.length > 0) {
    console.log('   ❌ Failed:');
    failed.forEach(r => console.log(`      ${r.relay} (${r.status}${r.error ? ': ' + r.error : ''})`));
  }
}

async function main() {
  const config = loadConfig();
  const relays = loadRelays();

  const { privateKey, publicKey } = config.keys;

  const launchContent = `🚀 SimpleRecover is LIVE

The payment recovery tool SaaS founders actually need.

→ Recovers failed Stripe payments automatically
→ Smart dunning sequences that don't annoy customers
→ Real-time dashboard showing recovered revenue
→ Set up in 5 minutes, not 5 hours

Built by a solo founder who got tired of watching MRR leak through the cracks.

Check it out. Your churn rate will thank you.

#simple-recover #saas #stripe #payments #indiehackers`;

  const event = buildLaunchEvent(privateKey, publicKey, launchContent);

  console.log('📝 Event created:');
  console.log(`   id:    ${event.id}`);
  console.log(`   kind:  ${event.kind}`);
  console.log(`   pubkey: ${event.pubkey}`);
  console.log('');
  console.log('📡 Publishing to relays...');

  const results = await publishToAllRelays(event, relays);
  printResults(results);

  // Save posted event log
  const logPath = path.join(__dirname, 'posted-events.json');
  const posted = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf-8')) : [];
  posted.push({ id: event.id, created_at: event.created_at, content: event.content.substring(0, 200) + '...', results });
  fs.writeFileSync(logPath, JSON.stringify(posted, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
