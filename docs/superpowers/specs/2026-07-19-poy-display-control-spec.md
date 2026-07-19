# Poy Display Control System Refactor Spec

This spec outlines the design changes required to implement the group-scoped Poy (Ticket Receipt) Display Control system for the Lao Lotto LINE Bot.

## Goals
1. Allow Admins/Staff (dealers and main managers) to globally control the visibility and format of poy ticket responses under their dealer account for a specific lottery type.
2. Allow group-level overrides (opening/closing/format settings) that take effect immediately.
3. Handle member permissions properly: members can only open/close their group's poy display if the dealer's global status is 'force_open' or 'normal'. If the dealer's global status is 'force_close', members are blocked from changing the group setting and receive a friendly alert.
4. Keep the separate personal override status (by admin) for individual members if set.

## Database Migration Plan

A new migration `supabase/migrations/169_refactor_line_groups_poy_display.sql` will be created:
1. Drop column `poy_display` on `line_groups` table to safely remove its old CHECK constraint (`normal`, `force_open`, `force_close`).
2. Add `poy_display` column back as `TEXT DEFAULT 'open' CHECK (poy_display IN ('open', 'close'))`.
3. Add `poy_format` column as `TEXT DEFAULT 'short' CHECK (poy_format IN ('short', 'full'))`.
4. Add `dealer_poy_display` column as `TEXT DEFAULT 'normal' CHECK (dealer_poy_display IN ('normal', 'force_open', 'force_close'))`.

```sql
-- Migration: 169_refactor_line_groups_poy_display.sql
ALTER TABLE line_groups DROP COLUMN IF EXISTS poy_display;
ALTER TABLE line_groups ADD COLUMN poy_display TEXT DEFAULT 'open' CHECK (poy_display IN ('open', 'close'));
ALTER TABLE line_groups ADD COLUMN poy_format TEXT DEFAULT 'short' CHECK (poy_format IN ('short', 'full'));
ALTER TABLE line_groups ADD COLUMN dealer_poy_display TEXT DEFAULT 'normal' CHECK (dealer_poy_display IN ('normal', 'force_open', 'force_close'));
```

## Proposed Changes

### Component: Database Migrations
#### [NEW] [169_refactor_line_groups_poy_display.sql](file:///f:/Web%20App/Lao_Lotto/supabase/migrations/169_refactor_line_groups_poy_display.sql)
Creates the migration file as defined above.

### Component: LINE Bot
#### [MODIFY] [index.ts](file:///f:/Web%20App/Lao_Lotto/supabase/functions/line-bot/index.ts)
Modifies command handlers and Poy rendering logic:

1. **Global Commands (Admin/Staff only)**:
   - `/โพยปิดหมด`:
     Sets `dealer_poy_display = 'force_close'` and `poy_display = 'close'` for all groups of this dealer and lottery type.
   - `/โพยเปิดหมด`:
     Sets `dealer_poy_display = 'force_open'` and `poy_display = 'open'` for all groups of this dealer and lottery type.
   - `/โพยปกติ`:
     Sets `dealer_poy_display = 'normal'` and `poy_display = 'open'` for all groups of this dealer and lottery type.
   - `/โพยเต็มหมด`:
     Sets `poy_format = 'full'` for all groups of this dealer and lottery type.
   - `/โพยย่อหมด`:
     Sets `poy_format = 'short'` for all groups of this dealer and lottery type.

2. **Group-level Commands**:
   - `/โพยปิด`:
     - **Admin/Staff**: sets `poy_display = 'close'` for the group.
     - **Member**: checks if `dealer_poy_display === 'force_close'`. If yes, returns a warning reply: `"❌ ขออภัยค่ะ ขณะนี้เจ้ามือได้ทำการปิดการแสดงผลโพยในระบบหลักทุกกลุ่มชั่วคราว สมาชิกไม่สามารถเปลี่ยนสถานะได้ค่ะ"`. If no, sets `poy_display = 'close'` for the group.
   - `/โพยเปิด`:
     - **Admin/Staff**: sets `poy_display = 'open'` for the group.
     - **Member**: checks if `dealer_poy_display === 'force_close'`. If yes, returns the warning reply. If no, updates `poy_display = 'open'` (requires that the group's current `poy_display === 'close'`).
   - `/โพยเต็ม`:
     - Updates this group's `poy_format = 'full'`.
   - `/โพยย่อ`:
     - Updates this group's `poy_format = 'short'`.

3. **Poy Render Logic**:
   Evaluate visibility for the member's ticket receipt message:
   ```typescript
   const gDisplay = groupLink.poy_display || 'open'; // 'open' | 'close'
   const gFormat = groupLink.poy_format || 'short';   // 'short' | 'full'
   const dGlobal = groupLink.dealer_poy_display || 'normal'; // 'normal' | 'force_open' | 'force_close'
   const groupMemberAdminPoy = memberRecord?.admin_poy_display || 'normal';

   let finalPoyDisplay = 'short';
   if (groupMemberAdminPoy === 'force_close') {
     finalPoyDisplay = 'none';
   } else if (groupMemberAdminPoy === 'force_open') {
     finalPoyDisplay = gFormat;
   } else {
     let isGroupVisible = true;
     if (dGlobal === 'force_close') {
       isGroupVisible = (gDisplay === 'open');
     } else if (dGlobal === 'force_open') {
       isGroupVisible = (gDisplay !== 'close');
     } else {
       isGroupVisible = (gDisplay === 'open');
     }
     finalPoyDisplay = isGroupVisible ? gFormat : 'none';
   }
   ```

## Verification Plan
1. Run database migrations and verify schema changes in Postgres.
2. Unit tests or manual test flows on webhook parsing:
   - Test admin `/โพยปิดหมด` command and verify all related groups are updated.
   - Test member `/โพยเปิด` under `force_close` status and verify it returns the warning reply.
   - Test admin `/โพยเปิด` under `force_close` status and verify it succeeds and enables poy rendering in that group.
