# LAN Peer Check-in Test

This tests cross-device duplicate prevention while the internet is down but
both phones are still on the same Wi-Fi.

## Build requirement

`react-native-tcp-socket` is a **native module**. Expo Go cannot load it.
Rebuild the dev client / APK after installing dependencies.

```bash
cd QRScannerApp
npm install
npx expo prebuild --clean
npx expo run:android --device
# or: eas build --profile development --platform android
```

Install the resulting build on both phones. The scanner still functions
(including offline packs) without the native module, but LAN peer sharing will
be disabled and the pack screen will say `not listening`.

## Network setup

- Both phones on the same Wi-Fi SSID/subnet (e.g. `192.168.1.x`).
- Disable router **AP/client isolation** (guest Wi-Fi often enables it).
- Allow local-network access on iOS when prompted.
- TCP port **45999** must be reachable between phones.
- Internet is not required for the LAN exchange, but it is required to
  download the initial offline packs.

## Test steps

1. Log in on both phones as an Owner/Admin/Staff user for the same event.
2. Open the scanner on both phones.
   - Header should show `LAN: 1` on each phone within ~20 seconds.
   - Open **⬇️ Offline Pack** to see local IP, port, listening state, and
     peer count.
   - If peer count stays 0, tap **SCAN FOR PEERS**.
3. Download the same event's offline pack on both phones while internet is up.
4. Turn off internet while keeping Wi-Fi connected:
   - Android: disable mobile data; keep Wi-Fi on.
   - iOS: disable cellular data; keep Wi-Fi on.
   - If your router has no internet, that is fine — LAN still works.
5. On Phone A, scan ticket `TIX...`.
   - Expect **Checked In — Pending Sync**.
6. On Phone B, scan the same ticket.
   - Expect **Already Authenticated** with "checked in on another scanner".
   - This should happen even though neither phone can reach the backend.
7. Re-enable internet.
8. Open **Offline Pack → SYNC NOW** on Phone A.
   - Expect a `success` result and pending count decrease.
9. Check the web admin **Check-in History**:
   - one successful check-in for that ticket,
   - no second successful check-in.

## What to check if it fails

| Symptom | Check |
|---|---|
| `LAN: 0` on both | Phones on different subnets/VLANs; AP isolation enabled; VPN active |
| `not listening` | Native module not in build; rebuild dev client, not Expo Go |
| iOS cannot connect | Local Network permission denied; re-enable in Settings |
| Peer found, scan not blocked | Both phones must have the same event pack; check `LAN` count |
| Duplicate reaches server | LAN was unavailable; server still logs it as `duplicate` for review |

## Protocol

- TCP port `45999`, newline-delimited JSON.
- `hello` → device identity.
- `sync` → all known check-ins (bounded to 5,000).
- `checkin` → real-time check-in gossip.
- Discovery scans the local `/24` every 20 seconds.
- Local seen state is persisted under `tv.lan.seen`.
- The backend remains authoritative; LAN is an additional first-scan guard.
