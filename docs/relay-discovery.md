# Relay Discovery

NostrPad uses a relay exchange event (kind 10002) to enable dynamic relay discovery, similar to how [secure-send-web](https://github.com/nicepkg/secure-send-web) uses PIN hints for discovery.

## Overview

Instead of all pads using the same hardcoded relays, each pad:
1. Discovers the best available relays when created
2. Publishes a relay exchange event with a `#d` tag containing the padId
3. Viewers discover relays by querying bootstrap relays for the padId tag (with a `#p` fallback)

This approach allows viewers to find relays using only the padId (from the URL), without needing the full public key.

## How It Works

### Editor Creates a New Pad

```
1. Probe candidate relays (bootstrap + extras)
   ├── wss://relay.damus.io
   ├── wss://nos.lol
   ├── wss://relay.nostr.band
   ├── wss://relay.primal.net
   ├── wss://nostr.wine
   └── wss://relay.snort.social

2. Select 5 fastest relays by response time

3. Publish kind 10002 event to bootstrap relays
   - Includes #d tag with padId for easy lookup
   - Similar to secure-send-web's PIN hint approach

4. Use selected relays for pad content (kind 30078)

5. Cache relay list locally (5 min TTL)
```

### Viewer Opens Existing Pad

```
1. Check local cache for relay list
   └── If found and fresh → use cached relays

2. Query bootstrap relays for kind 10002 event
   Filter: { kinds: [10002], '#d': ['nostrpad:<padId>'] }
   └── Uses padId tag, not pubkey (works without full key)
   └── Fallback: { kinds: [10002], '#p': [padId] }

3. Parse relay list from event tags

4. Connect to discovered relays
   └── If not found → fallback to bootstrap relays

5. Subscribe to pad content
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
| `BOOTSTRAP_RELAYS` | 3 relays | Initial relays for discovery |
| `CANDIDATE_RELAYS` | 6 relays | Relays to probe for selection |
| `TARGET_RELAY_COUNT` | 5 | Number of relays to select |
| `RELAY_PROBE_TIMEOUT` | 5000ms | Timeout for probing relays |
| `RELAY_CACHE_DURATION` | 5 min | How long to cache relay lists |

## UI Indicators

The footer shows the relay source:

- **(NIP-65)** - Relays discovered from kind 10002 event
- **(cached)** - Using cached relay list from localStorage
- **(bootstrap)** - Fallback to default relays (no NIP-65 found)
- **Discovering relays...** - Currently probing relays

## Fallback Behavior

If relay discovery fails at any step, NostrPad falls back to bootstrap relays:

1. All candidate relays unreachable → use bootstrap relays
2. No kind 10002 event found → use bootstrap relays
3. Network error during discovery → use bootstrap relays
4. Cache expired → re-discover, use bootstrap if fails

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
4. **Caching** - Reduces discovery overhead on page reload
5. **Redundancy** - Bootstrap relays are always included even after discovery

## Comparison with secure-send-web

| Feature | NostrPad | secure-send-web |
|---------|----------|-----------------|
| Lookup tag | `#p` (padId) | `#h` (PIN hint) |
| Event kind | 10002 | 24243 |
| Relay info | In event tags | In encrypted payload |
| Discovery | Query by tag | Query by tag |
| Fallback | Bootstrap relays | Bootstrap relays |

Both use the same pattern: publish a discoverable event with a tag that can be queried without knowing the full pubkey.

## Limitations

1. Bootstrap relays must be available for initial discovery
2. Kind 10002 events may be pruned by some relays
3. 5-minute cache means relay changes take time to propagate
