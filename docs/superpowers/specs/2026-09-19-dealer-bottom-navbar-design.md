# Dealer Dashboard Mobile Bottom Navigation Bar & Tab Grouping Design

## 1. Overview & Goals

Transition the Dealer Dashboard navigation from a congested 7-item top tab bar to a modern, thumb-friendly **Mobile Floating Island Bottom Navigation Bar** with 5 primary menu items, while retaining an organized grouped top tab bar on Desktop screens:

1. **5 Core Navigation Items (Bottom Bar on Mobile/Tablet)**:
   - 📅 **งวดหวย** (`rounds`): Manage lottery rounds, open/closed rounds, and round history.
   - 👥 **สมาชิก** (`membersGroup`): Unified group for customer members and downstream/upstream layoff partners.
     - Sub-tab A: **สมาชิก** (`members`) with active member count.
     - Sub-tab B: **เจ้ามือตีออก** (`upstreamDealers`) with upstream dealer count.
   - 💬 **LINE Bot** (`lineBotGroup`): Unified group for LINE integration and automated tasks.
     - Sub-tab A: **จัดการ LINE Bot** (`lineBot`) with bot connection and QR code.
     - Sub-tab B: **ตั้งค่าออโตเมชัน** (`automation`) with automated cutoff schedules.
   - 📢 **แนะนำ** (`referral`): Dealer affiliate link, downline network, and commission earnings.
   - 👤 **โปรไฟล์** (`profile`): Account settings, credit balance, bank accounts, and profile info.

2. **Responsive Strategy**:
   - **Mobile & Tablet (`<= 768px`)**:
     - Top `.dealer-tabs` hidden.
     - Floating island capsule bottom navigation bar (`DealerBottomNav.jsx`) affixed above the bottom edge.
     - When inside grouped categories (`membersGroup`, `lineBotGroup`), a sleek top **Segmented Control** (`DealerSubTabsNav.jsx`) is displayed for instant 1-tap toggle.
     - Page content has bottom scroll padding (`calc(88px + env(safe-area-inset-bottom))`) so no content is obscured.
   - **Desktop (`> 768px`)**:
     - Floating bottom navigation bar is hidden.
     - Top `.dealer-tabs` displays grouped cards matching the 5 conceptual domains with clear visual separators.

---

## 2. Architecture & State Management

### 2.1 State Compatibility
The single source of truth remains `activeTab` in `Dealer.jsx`:
```typescript
type ActiveTab = 
  | 'rounds'
  | 'members'
  | 'upstreamDealers'
  | 'lineBot'
  | 'automation'
  | 'referral'
  | 'profile';
```
No existing business logic, URL parameters, sub-modals, or payment settlement flows are changed. The state values remain 100% backward-compatible.

### 2.2 Group Mapping & Memory
When the user taps an icon on the bottom navigation bar:
- `rounds` ➡️ sets `activeTab('rounds')`
- `members` ➡️ checks last visited member sub-tab (`members` or `upstreamDealers`, default: `members`) and activates it.
- `lineBot` ➡️ checks last visited bot sub-tab (`lineBot` or `automation`, default: `lineBot`) and activates it.
- `referral` ➡️ sets `activeTab('referral')`
- `profile` ➡️ sets `activeTab('profile')`

```javascript
// Smart group resolution
const currentGroup = useMemo(() => {
    if (activeTab === 'rounds') return 'rounds';
    if (activeTab === 'members' || activeTab === 'upstreamDealers') return 'members';
    if (activeTab === 'lineBot' || activeTab === 'automation') return 'lineBot';
    if (activeTab === 'referral') return 'referral';
    if (activeTab === 'profile') return 'profile';
    return 'rounds';
}, [activeTab]);
```

---

## 3. Component Specifications

### 3.1 `DealerBottomNav.jsx` (New Component)
Located at `src/components/dealer/DealerBottomNav.jsx`:
- **Props**:
  - `activeTab`: string
  - `onSelectTab`: (tabId: string) => void
  - `membersCount`: number (total active members + downstream dealers)
  - `upstreamCount`: number (total upstream partners)
- **Visual Appearance**:
  - Floating capsule shape with `border-radius: 24px`.
  - Glassmorphic translucent dark background: `rgba(15, 15, 26, 0.88)` with `backdrop-filter: blur(16px)`.
  - Subtle gold border: `1px solid rgba(212, 175, 55, 0.25)`.
  - Position: `fixed`, bottom: `calc(12px + env(safe-area-inset-bottom))`, left: `50%`, `transform: translateX(-50%)`.
  - Dimensions: width `calc(100% - 24px)`, max-width `480px`, height `64px`.
  - `z-index: 995` (below modals which are `1000+`).
- **Interactive States**:
  - **Inactive Items**: Icon + label in `--text-muted` (`#a0a0b0`), font size `11px`.
  - **Active Item**: Icon + label in `--color-primary` (`#d4af37`), gold glow pill container behind icon, subtle scale animation `scale(1.05)`.
  - **Notification Badge**: Count badge on "สมาชิก" item displaying total members.

### 3.2 `DealerSubTabsNav.jsx` (New Component)
Located at `src/components/dealer/DealerSubTabsNav.jsx`:
- Displayed at the top of the content area when `currentGroup === 'members'` or `currentGroup === 'lineBot'`.
- **Pill Segmented Control**:
  - For Members:
    `[ 👥 สมาชิก (${membersCount}) ]` and `[ ↗️ เจ้ามือตีออก (${upstreamCount}) ]`
  - For LINE Bot:
    `[ 💬 จัดการ LINE Bot ]` and `[ ⚙️ ตั้งค่าออโตเมชัน ]`
- **Styling**:
  - Sleek dark background `rgba(26, 26, 46, 0.8)` with gold border on active segment.
  - Smooth sliding pill indicator and tactile feedback.

### 3.3 Desktop Top Navigation Grouping
In `Dealer.jsx` for desktop screen width (`> 768px`):
The top `.dealer-tabs` container is organized into 5 visual sections:
1. `[ 📅 งวดหวย ]`
2. Group Card: `[ 👥 สมาชิก (${members}) | ↗️ เจ้ามือตีออก (${upstream}) ]`
3. Group Card: `[ 💬 จัดการ LINE Bot | ⚙️ ตั้งค่าออโตเมชัน ]`
4. `[ 📢 แนะนำเจ้ามือ (Affiliate) ]`
5. `[ 👤 โปรไฟล์ ]`

---

## 4. CSS & Safe Area Implementation

In `src/pages/Dealer.css` (or `src/index.css`):
```css
/* Mobile Bottom Bar visibility */
.dealer-bottom-nav {
  display: none;
}

@media (max-width: 768px) {
  /* Hide desktop top tab bar */
  .dealer-tabs {
    display: none !important;
  }

  /* Show floating mobile bottom nav */
  .dealer-bottom-nav {
    display: flex;
    position: fixed;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    left: 50%;
    transform: translateX(-50%);
    width: calc(100% - 24px);
    max-width: 480px;
    height: 64px;
    background: rgba(15, 15, 26, 0.88);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(212, 175, 55, 0.25);
    border-radius: 24px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 16px rgba(212, 175, 55, 0.1);
    z-index: 995;
    padding: 6px 8px;
    justify-content: space-around;
    align-items: center;
  }

  /* Content area scroll padding to avoid bottom overlap */
  .dealer-dashboard {
    padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px)) !important;
  }
}
```

---

## 5. Verification Plan

1. **Automated Tests**:
   - Create unit test `src/components/dealer/__tests__/DealerBottomNav.test.jsx` verifying:
     - Renders all 5 icon buttons with correct labels.
     - Active item highlighted based on `activeTab`.
     - Member count badge displays correct total.
     - Tapping calls `onSelectTab` with the expected tab/group.
   - Verify all 571 existing test suites continue to pass (`cmd /c npm run test`).
2. **Build Verification**:
   - Run `cmd /c npm run build` to ensure zero Vite compilation errors.
3. **Manual / Responsive Browser Verification**:
   - Mobile Viewport (375x667, 390x844, 412x915):
     - Confirm bottom nav floats smoothly with glassmorphism blur and gold glow.
     - Confirm switching between 5 tabs works seamlessly.
     - Confirm switching between sub-tabs in "สมาชิก" and "LINE Bot" works smoothly.
     - Confirm scrolling down to bottom reveals all buttons and cards without cutoff.
   - Desktop Viewport (> 768px):
     - Confirm bottom nav is completely hidden.
     - Confirm desktop top bar displays 5 cleanly grouped tab blocks.
