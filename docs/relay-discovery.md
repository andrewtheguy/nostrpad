# Relay Discovery

NostrPad uses a relay exchange event (kind 10002) to enable dynamic relay discovery, similar to how [secure-send-web](https://github.com/nicepkg/secure-send-web) uses PIN hints for discovery.

## Overview

Instead of all pads using the same hardcoded relays, each pad:
1. Uses bootstrap relays by default and only discovers additional relays if bootstrap relays fail
2. Publishes a relay exchange event with a `#d` tag containing the padId
3. Viewers discover relays by querying bootstrap relays for the padId tag (with a `#p` fallback)

This approach allows viewers to find relays using only the padId (from the URL), without needing the full public key.

## How It Works

### Editor Creates a New Pad

```
1. Probe bootstrap relays
   ├── wss://relay.damus.io
   ├── wss://nos.lol
   ├── wss://relay.primal.net

2. If bootstrap fails, discover relays via seed relays (NIP-66 + NIP-65)
3. Probe discovered relays (NIP-11 + WebSocket) and select 5 fastest

4. Publish kind 10002 event to bootstrap relays
   - Includes #d tag with padId for easy lookup
   - Similar to secure-send-web's PIN hint approach

5. Use selected relays for pad content (kind 30078)

```

### Viewer Opens Existing Pad

```
1. Query bootstrap relays for kind 10002 event
   Filter: { kinds: [10002], '#d': ['nostrpad:<padId>'] }
   └── Uses padId tag, not pubkey (works without full key)
   └── Fallback: { kinds: [10002], '#p': [padId] }

2. Parse relay list from event tags

3. Connect to discovered relays
   └── If not found → fallback to bootstrap relays

4. Subscribe to pad content
```

## Relay Exchange Event Format

The relay list is stored as a kind 10002 event with padId tags:

```json
{
  "kind": 10002,
  "pubkey": "<pad's public key>",
  "created_at": 1234567890,
  "tags": [
    ["d", "nostrpad:79ggjXVP"],
    ["p", "79ggjXVP"],
    ["r", "wss://relay.damus.io"],
    ["r", "wss://nos.lol"],
    ["r", "wss://relay.primal.net"]
  ],
  "content": "",
  "sig": "..."
}
```

Tag meanings:
- `["d", "nostrpad:<padId>"]` - Makes event replaceable per pad
- `["p", "<padId>"]` - Optional fallback lookup by padId
- `["r", "url"]` - Relay URL (read and write)

## Configuration

Constants in `src/lib/constants.ts`:

| Constant | Default | Description |
|----------|---------|-------------|
| `RELAY_LIST_KIND` | 10002 | NIP-65 event kind |
| `RELAY_DISCOVERY_KIND` | 30166 | NIP-66 event kind |
| `BOOTSTRAP_RELAYS` | 3 relays | Initial relays for discovery |
| `TARGET_RELAY_COUNT` | 5 | Number of relays to select |
| `RELAY_DISCOVERY_TIMEOUT` | 3000ms | Timeout for discovery queries |
| `RELAY_INFO_TIMEOUT` | 2000ms | Timeout for NIP-11 fetch |
| `RELAY_PROBE_TIMEOUT` | 2000ms | Timeout for probing relays |
| `MAX_RELAYS_TO_PROBE` | 30 | Max relays to probe after discovery |

## UI Indicators

The footer shows the relay source:

- **(NIP-65)** - Relays discovered from kind 10002 event
- **(bootstrap)** - Fallback to default relays (no NIP-65 found)
- **Discovering relays...** - Currently probing relays

## Fallback Behavior

If relay discovery fails at any step, NostrPad falls back to bootstrap relays:

1. Bootstrap relays unavailable → attempt discovery
2. No suitable relays respond → use bootstrap relays
2. No kind 10002 event found → use bootstrap relays
3. Network error during discovery → use bootstrap relays

## Files

| File | Purpose |
|------|---------|
| `src/lib/relayDiscovery.ts` | Core discovery functions |
| `src/hooks/useRelayDiscovery.ts` | React hook for components |
| `src/lib/constants.ts` | Configuration constants |

## Benefits

1. **Better reliability** - Pads aren't dependent on specific relays being up
2. **Improved performance** - Uses fastest available relays
3. **Decentralization** - Different pads can use different relay sets
4. **Redundancy** - Bootstrap relays are always included even after discovery

## Comparison with secure-send-web

| Feature | NostrPad | secure-send-web |
|---------|----------|-----------------|
| Lookup tag | `#d` + fallback `#p` (padId) | `#h` (PIN hint) |
| Event kind | 10002 | 24243 |
| Relay info | In event tags | In encrypted payload |
| Discovery | Query by tag | Query by tag |
| Fallback | Bootstrap relays | Bootstrap relays |

Both use the same pattern: publish a discoverable event with a tag that can be queried without knowing the full pubkey.

## Limitations

1. Bootstrap relays must be available for initial discovery
2. Kind 10002 events may be pruned by some relays
3. Discovery relies on NIP-66/NIP-65 events being available on seed relays
