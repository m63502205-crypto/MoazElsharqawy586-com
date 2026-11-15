# Firestore Security Specification

## 1. Data Invariants
1. **Default-Deny Baseline**: Every path not explicitly matched is denied (`allow read, write: if false`).
2. **Verified Admin Identity**: Only verified Google accounts matching the bootstrapped super admin (`moazmahmoud586@gmail.com` with `request.auth.token.email_verified == true`) or registered in `/admins/{uid}` (with `email_verified == true`) hold admin privileges.
3. **Public vs PII Isolation**: Publicly readable collections (`site_config`, `party_leaders`, `secretariat_leaders`, `secretariats`, `secretariat_members`, `initiatives`, `news`, `events`, `media`, `pages`, `uploads_public`) NEVER store applicant national IDs, member PII, admin password hashes, or audit trails. Hidden/draft documents (`isPublic == false`) are unreadable except by admins.
4. **Strict Key & Size Boundaries**: Every write validates required + allowed keys (`hasAll` + `hasOnly`), document ID pattern `^[a-zA-Z0-9_\-]+$` (<= 128 chars), string types and max sizes.

## 2. Dirty Dozen Adversarial Payloads
1. Unauthenticated read on `/applications/{id}` or `/members/{id}` -> `PERMISSION_DENIED`.
2. Unauthenticated `list` on `/applications` or `/admin_users` -> `PERMISSION_DENIED`.
3. Non-admin authenticated user reading `/audit_logs/{id}` -> `PERMISSION_DENIED`.
4. Spoofed admin email with `email_verified: false` writing to `/site_config/public` -> `PERMISSION_DENIED`.
5. Unauthenticated `get` or `list` on draft news where `isPublic == false` -> `PERMISSION_DENIED`.
6. Ghost field injection (`{ id, isPublic, data, updatedAt, isAdmin: true }`) -> `PERMISSION_DENIED`.
7. Oversized `id` poisoning (> 128 chars or invalid characters) -> `PERMISSION_DENIED`.
8. Non-admin creating entry in `/admins/{uid}` to escalate privileges -> `PERMISSION_DENIED`.
9. Non-admin modifying `roles` or `admin_users` -> `PERMISSION_DENIED`.
10. Invalid type (`data: "json-string"` instead of map) -> `PERMISSION_DENIED`.
11. Oversized `uploads_public` payload exceeding `dataBase64` 900KB cap -> `PERMISSION_DENIED`.
12. `list` query on `news` without filtering `isPublic == true` as unauthenticated user -> `PERMISSION_DENIED`.
