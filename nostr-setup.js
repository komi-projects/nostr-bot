#!/usr/bin/env node
/**
 * nostr-setup.js
 * Generates a Nostr keypair (npub/nsec) and stores it in config.json.
 * Uses nostr-tools for proper secp256k1 key generation.
 */

const fs = require('fs');
const path = require('path');
const { generateSecretKey, getPublicKey, nip19 } = require('nostr-tools');

const CONFIG_PATH = path.join(__dirname, 'config.json');

function generateKeypair() {
  const privateKeyBytes = generateSecretKey();
  const privateKeyHex = Buffer.from(privateKeyBytes).toString('hex');
  const publicKeyHex = getPublicKey(privateKeyBytes);

  const nsec = nip19.nsecEncode(privateKeyBytes);
  const npub = nip19.npubEncode(publicKeyHex);

  return {
    privateKey: privateKeyHex,
    publicKey: publicKeyHex,
    nsec,
    npub,
    createdAt: new Date().toISOString()
  };
}

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  }
  return null;
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function main() {
  const existing = loadConfig();
  if (existing && existing.keys) {
    console.log('⚠️  Keypair already exists in config.json');
    console.log(`   npub: ${existing.keys.npub}`);
    console.log('   Use --force to overwrite (destroys old key!)');
    if (process.argv.includes('--force')) {
      console.log('   --force detected. Overwriting...');
    } else {
      process.exit(0);
    }
  }

  const keys = generateKeypair();
  const config = {
    keys,
    relays: require('./relay-list.json'),
    defaults: {
      defaultTags: [['t', 'simple-recover'], ['t', 'saas'], ['t', 'payments']]
    }
  };

  saveConfig(config);

  console.log('✅ Nostr keypair generated and saved to config.json');
  console.log(`   npub: ${keys.npub}`);
  console.log(`   nsec: ${keys.nsec}`);
  console.log(`   pub(hex): ${keys.publicKey}`);
  console.log('');
  console.log('🚨 BACKUP YOUR NSEC NOW. If you lose it, you lose the account.');
  console.log('   Store it in a password manager or offline.');
}

main();
