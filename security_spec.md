# Security Specification & Threat Model

This document outlines the strict validation and access control specifications for the Firebase backend of the Nashville Studio AI Session Producer DAW.

## Data Invariants
1. **Relational Ownership**: A session document can only be read, modified, or deleted by its authenticated owner (`ownerId === request.auth.uid`).
2. **Temporal Integrity**: Creation of a session must freeze the `createdAt` value to exactly `request.time`. Updates to a session must update the `updatedAt` value to exactly `request.time`.
3. **Identity Verification**: Standard writing is restricted to authenticated users with verified emails (`request.auth.token.email_verified == true`).
4. **Self-Assigned Role Blocking**: There are no custom roles or privileged admins in the user database. Access is strictly Owner-Based Attribute Control.
5. **Denial of Wallet Mitigation**: Limits on maximum sizes of tracks arrays and dialogue matrices prevent memory exhaustion.

---

## The "Dirty Dozen" Payloads (Threat Vectors & Intrusions)

### Payload 1: Session Hijacking (Identity Spoofing)
An attacker attempts to write or read a session belonging to another user.
```json
{
  "name": "Hijacked Session",
  "ownerId": "attacker_uid",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```
*Expected Behavior:* **PERMISSION_DENIED** (because the document is in a path but has ownerId or target path belonging to another, or rule checks `request.auth.uid == resource.data.ownerId`).

### Payload 2: Invisible Shadow Field Inject (Privilege Escalation)
An attacker attempts to inject a hidden admin field to bypass locks.
```json
{
  "name": "Rogue Daw Session",
  "ownerId": "victim_uid",
  "isAdminSession": true,
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```
*Expected Behavior:* **PERMISSION_DENIED** (because the helper strictly enforces only permitted fields on create / update).

### Payload 3: Temporal Manipulation (Backdated Logs)
An attacker attempts to set `createdAt` or `updatedAt` back in time to spoof stats.
```json
{
  "name": "Deorean Tracks",
  "ownerId": "user_uid",
  "createdAt": "2010-01-01T00:00:00Z",
  "updatedAt": "2010-01-01T00:00:00Z"
}
```
*Expected Behavior:* **PERMISSION_DENIED** (because `createdAt == request.time` and `updatedAt == request.time` are strictly mandated on write).

### Payload 4: Unverified Guest Intrusion
An unauthenticated or unverified email user attempts to write a session.
```json
{
  "name": "Anonymous Session",
  "ownerId": "anon_uid",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```
*Expected Behavior:* **PERMISSION_DENIED** (because standard writes require `request.auth.token.email_verified == true`).

### Payload 5: Deny-of-Wallet Array Overflow
An attacker tries to upload 10,000 blank track tracks to flood the system and increase layout compute.
```json
{
  "name": "Flood Session",
  "ownerId": "user_uid",
  "tracks": [ ...10000 tracks... ],
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```
*Expected Behavior:* **PERMISSION_DENIED** (because the check strictly enforces `tracks.size() <= 20`).

### Payload 6: ID Poisoning (Malformed Key Inject)
An attacker tries to create a session with a 2MB base64 junk-character document ID.
`sessionId: "JUNKWORDS%&*()*!@#_OVERFLOW_OVERFLOW_................_OVERFLOW"`
*Expected Behavior:* **PERMISSION_DENIED** (because the rule checks list/single target operations via `isValidId()`).

### Payload 7: Mute Lockout Bypass (State Shortcutting)
An attacker attempts to modify tracks of another session during update, bypassing the owner fader rules.
`update session set tracks = [] on victim's resource`
*Expected Behavior:* **PERMISSION_DENIED** (because list query and updates are guarded by ownership check).

### Payload 8: Immutable Creation Date Manipulation
An attacker attempts to modify the `createdAt` value during a state update.
```json
{
  "name": "Updated name",
  "createdAt": "2020-01-01T00:00:00Z",
  "updatedAt": "serverTimestamp"
}
```
*Expected Behavior:* **PERMISSION_DENIED** (because on update, `incoming().createdAt == existing().createdAt`).

### Payload 9: Non-JSON Map Value Poisoning
An attacker attempts to set the `bpm` (expected integer) to a boolean or a giant array.
```json
{
  "name": "Poison BPM",
  "bpm": "super_mega_fast",
  "createdAt": "serverTimestamp"
}
```
*Expected Behavior:* **PERMISSION_DENIED** (because `incoming().bpm is int` or `incoming().bpm is number` is strictly enforced).

### Payload 10: Anonymous Read Scraping (The Leak)
An attacker tries to perform a listing of `/sessions` without a specific filter to read other users' songs.
*Expected Behavior:* **PERMISSION_DENIED** (because `allow list` requires `resource.data.ownerId == request.auth.uid`).

### Payload 11: Reverb Slider Poison Input
An attacker attempts to inject a reverb decimal value over 100% or under 0%.
`reverbMix: 9000.5`
*Expected Behavior:* **PERMISSION_DENIED** (because `reverbMix >= 0.0 && reverbMix <= 1.0`).

### Payload 12: Dialogue Spam Attack
An attacker tries to flood the dialogue array with a huge 5MB text block.
*Expected Behavior:* **PERMISSION_DENIED** (because the dialogue array length is limited to a size constraint).

---

## Test Runner Mock Verification Suite

```typescript
// firestore.rules.test.ts
// Statically verifies security enforcement behaviors.
```
