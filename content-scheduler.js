#!/usr/bin/env node
/**
 * content-scheduler.js
 * Queues and posts pre-loaded content to Nostr relays on a schedule.
 * Contains 7 days of SimpleRecover posts ready to publish.
 *
 * Usage:
 *   node content-scheduler.js --run-now          # Post the next queued item immediately
 *   node content-scheduler.js --list               # Show all queued posts
 *   node content-scheduler.js --run-all            # Post all remaining (use with care)
 *   node content-scheduler.js --daemon             # Run as daemon, post on schedule
 *   node content-scheduler.js --reset              # Reset queue to all pending
 */

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { finalizeEvent } = require('nostr-tools');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const RELAYS_PATH = path.join(__dirname, 'relay-list.json');
const QUEUE_PATH = path.join(__dirname, 'post-queue.json');

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

// ── 7 days of pre-loaded posts ─────────────────────────────────────────────
const DEFAULT_POSTS = [
  {
    day: 0,
    title: 'Launch announcement',
    content: `🚀 SimpleRecover is LIVE

The payment recovery tool SaaS founders actually need.

→ Recovers failed Stripe payments automatically
→ Smart dunning sequences that don't annoy customers
→ Real-time dashboard showing recovered revenue
→ Set up in 5 minutes, not 5 hours

Built by a solo founder who got tired of watching MRR leak through the cracks.

Check it out. Your churn rate will thank you.

#simple-recover #saas #stripe #payments #indiehackers`,
    tags: [['t', 'launch']],
    posted: false,
    postedAt: null,
    eventId: null
  },
  {
    day: 1,
    title: 'Payment recovery tip',
    content: `💡 Payment Recovery Tip #1

The #1 mistake SaaS founders make with dunning?
Sending the same email 3 times and calling it a "sequence."

Here's what actually works:

1️⃣ Day 1: Friendly reminder (soft tone, helpful)
2️⃣ Day 3: "Your account will be restricted" (clear consequence)
3️⃣ Day 7: "Here's how to update your card" (make it easy)
4️⃣ Day 14: Personal outreach (for high-value accounts)

Each message should feel different. Same problem, different angle.

Your customers aren't ignoring you. They're busy. Help them solve it.

#saas #payments #dunning #churn #simple-recover`,
    tags: [['t', 'tip']],
    posted: false,
    postedAt: null,
    eventId: null
  },
  {
    day: 2,
    title: 'Stripe dunning stats',
    content: `📊 Stripe Dunning Stats That Hurt

→ 15% of SaaS payments fail on average
→ 70% of those failures are recoverable
→ Only 30% of SaaS companies have ANY dunning flow
→ The average recovered payment is worth $147 ARR

Do the math: If you have 1000 customers and 15% fail, that's 150 failed payments.
Recover 70% = 105 customers saved.
At $147 ARR = $15,435 recovered per month.

That's $185k/year you're probably leaving on the table.

SimpleRecover was built to grab that money back.

#stripe #saas #metrics #mrr #simple-recover`,
    tags: [['t', 'stats']],
    posted: false,
    postedAt: null,
    eventId: null
  },
  {
    day: 3,
    title: 'Churn prevention',
    content: `🛡️ Churn Prevention is Revenue Protection

Most founders treat churn as a "customer success problem."

Wrong. It's a revenue operations problem.

Involuntary churn (failed payments) is the silent killer:
→ Customer didn't choose to leave
→ They just didn't update their expired card
→ They might not even KNOW their payment failed

Fix the payment issue = fix the churn.
No cancel flow needed. No win-back campaign. No "we miss you" email.

Just get the money before it walks out the door.

That's what SimpleRecover does. Automatically.

#churn #saas #revenue #simple-recover #indiehackers`,
    tags: [['t', 'churn']],
    posted: false,
    postedAt: null,
    eventId: null
  },
  {
    day: 4,
    title: 'Failed payment cost',
    content: `💸 What Does a Failed Payment Actually Cost?

Direct cost: Lost revenue (obviously)

Hidden costs:
→ Support tickets asking "why doesn't my login work?"
→ Time spent manually following up with customers
→ Engineering time building custom retry logic
→ Customer confusion and bad UX
→ Reputation damage when accounts get locked unexpectedly

The total cost is 3-5x the actual failed payment amount.

SimpleRecover handles the whole pipeline:
retries → emails → dunning → recovery → reporting.

One tool. One setup. Done.

#saas #operations #stripe #simple-recover`,
    tags: [['t', 'cost']],
    posted: false,
    postedAt: null,
    eventId: null
  },
  {
    day: 5,
    title: 'SimpleRecover features',
    content: `⚡ SimpleRecover Features (The Short List)

→ Stripe Connect integration (read-only, secure)
→ Smart retry engine with backoff logic
→ Multi-step dunning sequences (email + in-app)
→ Real-time recovery dashboard
→ Failed payment analytics and trends
→ Customer health scoring
→ Webhook-based, near-instant updates
→ REST API for custom workflows
→ GDPR compliant, no customer PIP stored

Built for founders who want their payment recovery DONE, not managed.

Set it up once. Watch your MRR stabilize.

#saas #features #stripe #simple-recover #buildinpublic`,
    tags: [['t', 'features']],
    posted: false,
    postedAt: null,
    eventId: null
  },
  {
    day: 6,
    title: 'Call to action',
    content: `👋 Last day of launch week. Here's the ask.

If you're running a SaaS and you've ever looked at your churn number and thought "that feels high" — you're probably losing money to failed payments.

SimpleRecover fixes that. In 5 minutes. For less than you're losing per month.

→ Link in bio
→ Free trial, no credit card required
→ See your recoverable revenue in the first hour

Built in public. Shipped fast. Improving weekly.

Thanks for following along this week. The real work starts now.

#simple-recover #saas #launch #indiehackers #buildinpublic`,
    tags: [['t', 'cta']],
    posted: false,
    postedAt: null,
    eventId: null
  }
];

function initQueue(reset = false) {
  if (!fs.existsSync(QUEUE_PATH) || reset) {
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(DEFAULT_POSTS, null, 2));
    console.log(reset ? '🔄 Queue reset to default.' : '📦 Queue initialized with 7 posts.');
  }
  return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
}

function buildEvent(privateKeyHex, publicKeyHex, content, extraTags = []) {
  const eventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', 'simple-recover'],
      ['t', 'saas'],
      ['t', 'payments'],
      ...extraTags
    ],
    content: content,
    pubkey: publicKeyHex
  };
  // privateKeyHex is stored as hex string; convert to Uint8Array for signing
  return finalizeEvent(eventTemplate, Buffer.from(privateKeyHex, 'hex'));
}

async function publishToRelay(wsUrl, event, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let done = false;
    const ws = new WebSocket(wsUrl, { handshakeTimeout: timeoutMs });

    const timer = setTimeout(() => {
      if (!done) { done = true; ws.terminate(); resolve({ relay: wsUrl, status: 'timeout' }); }
    }, timeoutMs);

    ws.on('open', () => { ws.send(JSON.stringify(['EVENT', event])); });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg[0] === 'OK' && msg[1] === event.id) {
          clearTimeout(timer); done = true; ws.close();
          resolve({ relay: wsUrl, status: 'ok' });
        }
      } catch (_) {}
    });
    ws.on('error', (err) => { if (!done) { clearTimeout(timer); done = true; resolve({ relay: wsUrl, status: 'error', error: err.message }); } });
    ws.on('close', () => { if (!done) { clearTimeout(timer); done = true; resolve({ relay: wsUrl, status: 'closed' }); } });
  });
}

async function publishToAllRelays(event, relayUrls, concurrency = 5) {
  const results = [];
  for (let i = 0; i < relayUrls.length; i += concurrency) {
    const batch = relayUrls.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(url => publishToRelay(url, event)));
    results.push(...batchResults);
  }
  return results;
}

async function runPost(post, config, relays) {
  const event = buildEvent(config.keys.privateKey, config.keys.publicKey, post.content, post.tags);
  console.log(`\n📝 Posting: "${post.title}" (Day ${post.day})`);
  console.log(`   Event ID: ${event.id}`);

  const results = await publishToAllRelays(event, relays);
  const okCount = results.filter(r => r.status === 'ok').length;

  post.posted = true;
  post.postedAt = new Date().toISOString();
  post.eventId = event.id;
  post.results = results;

  console.log(`   Published to ${okCount}/${results.length} relays`);
  return post;
}

function listQueue(queue) {
  console.log('\n📋 Post Queue:');
  console.log('─'.repeat(60));
  queue.forEach(post => {
    const status = post.posted ? '✅ Posted' : '⏳ Pending';
    const date = post.postedAt ? new Date(post.postedAt).toLocaleDateString() : '—';
    console.log(`   Day ${post.day}: ${post.title} [${status}] ${date}`);
  });
  console.log('─'.repeat(60));
  const pending = queue.filter(p => !p.posted).length;
  console.log(`   ${pending}/${queue.length} posts remaining\n`);
}

async function runDaemon(config, relays) {
  console.log('👹 Daemon mode started. Press Ctrl+C to stop.\n');

  while (true) {
    const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));
    const nextPost = queue.find(p => !p.posted);

    if (!nextPost) {
      console.log('✅ All posts published. Daemon exiting.');
      break;
    }

    // Post immediately then wait 24 hours
    await runPost(nextPost, config, relays);
    saveQueue(queue);

    const nextTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    console.log(`   Next post scheduled: ${nextTime.toLocaleString()}\n`);
    await sleep(24 * 60 * 60 * 1000);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const args = process.argv.slice(2);
  const runNow = args.includes('--run-now');
  const list = args.includes('--list');
  const runAll = args.includes('--run-all');
  const daemon = args.includes('--daemon');
  const reset = args.includes('--reset');

  const config = loadConfig();
  const relays = loadRelays();
  const queue = initQueue(reset);

  if (list) {
    listQueue(queue);
    return;
  }

  if (reset) {
    listQueue(queue);
    return;
  }

  if (runNow) {
    const nextPost = queue.find(p => !p.posted);
    if (!nextPost) {
      console.log('✅ All posts already published.');
      return;
    }
    await runPost(nextPost, config, relays);
    saveQueue(queue);
    listQueue(queue);
    return;
  }

  if (runAll) {
    const pending = queue.filter(p => !p.posted);
    if (pending.length === 0) {
      console.log('✅ All posts already published.');
      return;
    }
    console.log(`⚠️ About to publish ${pending.length} posts to ${relays.length} relays.`);
    for (const post of pending) {
      await runPost(post, config, relays);
      await sleep(2000); // 2s delay between posts
    }
    saveQueue(queue);
    listQueue(queue);
    return;
  }

  if (daemon) {
    await runDaemon(config, relays);
    return;
  }

  // Default: show help
  console.log(`
📅 SimpleRecover Nostr Content Scheduler

Usage:
  node content-scheduler.js --list      Show all queued posts
  node content-scheduler.js --run-now   Post the next pending item
  node content-scheduler.js --run-all   Post all pending items (with delay)
  node content-scheduler.js --daemon    Run as 24h interval daemon
  node content-scheduler.js --reset       Reset queue to initial state

Queue file: ${QUEUE_PATH}
`);
  listQueue(queue);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
