# Phase 12: Anonymous-to-Authenticated Migration

**Goal:** Seamlessly merge anonymous user data into permanent accounts when users sign up — preserving chat history, preferences, and usage records.

**Requirements:** MIG-01, MIG-02, MIG-03

## Proposed Changes

### Backend

1. **`migration.service.ts`**:
   - `migrateAnonymousData(userId: string, anonId: string)`: Main entry point for migration.
   - Link chat conversations from `anon_id` to `user_id`.
   - Merge usage records from `anon_id` to `user_id`.
   - Update `anonymous_users` record to mark it as migrated (prevent multiple migrations or re-linkage).

2. **Database Migration**:
   - Add `migrated_to` (UUID referencing `users.id`) to `anonymous_users` table.
   - Update `conversations` table to handle `user_id` update if it was originally `null` but had an `anon_id`.
   - Update `usage_tracking` table to merge counters.

3. **API Integration**:
   - Add a route `/user/migrate` that the frontend calls after successful signup/login if an `anonId` exists.

### Frontend

1. **Auth Store / Signup Flow**:
   - After successful signup/login, check if `anonId` exists.
   - Call the migration endpoint.
   - Clear/Reset anonymous identity after successful migration.

## Tasks

### 1. Database Schema Update
- [x] Add `migrated_to` column to `anonymous_users` table.

### 2. Migration Service Implementation
- [x] Create `backend/src/services/migration.service.ts`.
- [x] Implement `migrateConversations`.
- [x] Implement `migrateUsage`.

### 3. API Integration
- [x] Create `POST /user/migrate` route in `backend/src/routes/user.routes.ts`.

### 4. Frontend Integration
- [x] Update frontend to trigger migration after auth.

## Success Criteria
1. Chat history migrated.
2. Usage counters merged.
3. No data loss.
