# Dealer-Member Tree View Specification

## Summary
Add a Hierarchical Tree View mode to the Admin Member Management page (`src/pages/Admin.jsx`) allowing Superadmins to view and navigate dealer-member relationships. Superadmins can toggle between Table View and Tree View, and switch Tree View perspectives between "Group by Dealer" (Dealer -> Members) and "Group by Member" (Member -> Dealers).

## User Context & Future Goals
While the system currently tracks membership via `user_dealer_memberships` (where members can belong to multiple dealers), this Tree View UI also lays the visual and structural foundation for future referral/affiliate commission features.

## Detailed Features

### 1. View Switcher
- Tab controls in Member Management tab:
  - 📑 **Table View**: Flat searchable table of profiles.
  - 🌲 **Tree View**: Expandable tree representation.

### 2. Tree View Modes
- **Dealer Perspective (Dealers -> Members)**:
  - Root nodes: All Users with role `dealer` or `superadmin`.
  - Child nodes: Members belonging to each dealer via `user_dealer_memberships`.
  - Shows total member count per dealer badge (e.g. `สมาชิก 12 คน`).
- **Member Perspective (Members -> Dealers)**:
  - Root nodes: All Users with role `user`.
  - Child nodes: All Dealers that the member belongs to.
  - Shows dealer count per member badge (e.g. `สังกัด 2 เจ้ามือ`).

### 3. Tree Navigation & UX
- Expand/Collapse individual node toggles (`FiChevronRight` / `FiChevronDown`).
- "Expand All" and "Collapse All" quick action buttons.
- Real-time search filter: Auto-expands matching branches when filtering by name or email.
- Tree visual guide lines connecting parent nodes to child branches.
- Distinct color-coded role badges (Admin: Red, Dealer: Gold, User: Green).

### 4. Data Integration
- Queries `profiles` table to list all accounts.
- Queries `user_dealer_memberships` table to construct relations between `user_id` and `dealer_id`.

## Non-Goals (Out of Scope for this phase)
- Affiliate commission calculations & payouts (to be implemented in future phases).
