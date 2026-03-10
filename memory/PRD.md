# SocialHub - Social Media Management Dashboard PRD

## Original Problem Statement
Build "SocialHub" — a Social Media Management Dashboard with React + FastAPI + MongoDB + JWT Auth + Passport.js OAuth structure. Features include auth, 25 social platform connections, and post management (create/edit/delete posts with platform selection).

## User Choices
- Authentication: JWT-based custom auth (email/password)
- OAuth Integration: Flow structure for all 25 platforms (mock credentials)
- Design: Light theme with playful, modern style
- Database: Existing MongoDB setup

## Architecture
- **Frontend**: React with Tailwind CSS, Shadcn/UI components, Framer Motion
- **Backend**: Node.js/Express with Mongoose (converted from Python/FastAPI on March 10, 2026)
- **Database**: MongoDB with collections: users, socialaccounts, posts, messages, analytics
- **Auth**: JWT tokens (7-day expiry), bcryptjs password hashing
- **Scheduler**: node-cron for auto-publish, inbox sync, analytics sync

## User Personas
1. **Social Media Manager** - Manages multiple brand accounts across platforms
2. **Content Creator** - Creates and publishes content to personal accounts
3. **Marketing Team** - Collaborates on content for business presence

## Core Requirements
- [x] User registration and login with JWT auth
- [x] Protected routes requiring authentication
- [x] Dashboard with stat cards (accounts, posts, published, drafts)
- [x] 25 social platform cards with connect/disconnect functionality
- [x] Mock OAuth flow for platform connections
- [x] Posts CRUD (create, read, update, delete)
- [x] Platform selection for posts
- [x] Filter posts by status (All/Drafts/Published)
- [x] Collapsible sidebar navigation

## What's Been Implemented
**Date: March 7, 2026**

### Phase 1-2: MVP (Completed)
- Auth endpoints: /api/auth/register, /api/auth/login, /api/auth/me
- Accounts endpoints with 25 platform support (OAuth MOCKED)
- Posts CRUD with platform selector
- Dashboard with 4 stat cards
- Token encryption for OAuth tokens

### Phase 3: Scheduler (Completed)
- POST /api/posts with scheduledAt field for scheduling
- POST /api/posts/:postId/publish for force publish
- GET /api/scheduler/calendar for calendar data
- APScheduler cron job running every minute for auto-publish
- Calendar view + List view with filters
- Schedule picker with date/time/timezone
- 5 post statuses: draft, scheduled, publishing, published, failed

### Phase 4: Unified Inbox (Completed)
- GET /api/inbox with filters (platform, type, isRead)
- GET /api/inbox/unread-count for badge counts
- PUT /api/inbox/:messageId/read
- PUT /api/inbox/read-all
- POST /api/inbox/:messageId/reply
- POST /api/inbox/sync (auto-syncs every 15 minutes)
- 3-panel layout: filters, message list, thread view
- Message types: dm, comment, mention, reply

### Phase 5: Analytics Dashboard (Completed)
- GET /api/analytics/overview with date range
- GET /api/analytics/followers for line chart
- GET /api/analytics/engagement for bar chart
- GET /api/analytics/posts for top posts table
- POST /api/analytics/sync (daily sync at 2 AM)
- Recharts integration (LineChart, BarChart)
- Platform breakdown accordion
- Date range selector (7D/30D/90D)

### Design System
- Light theme with Indigo/Purple/Pink accent colors
- Outfit font for headings, DM Sans for body
- Framer Motion animations throughout

## Prioritized Backlog

### P0 (Critical) - DONE
- [x] Authentication (register, login, protected routes)
- [x] 25 platform cards display
- [x] Posts CRUD functionality
- [x] Dashboard stats
- [x] Post Scheduling with date/time picker
- [x] Calendar view for scheduled posts
- [x] Auto-publishing via APScheduler
- [x] Unified Inbox with 3-panel layout
- [x] Analytics dashboard with charts

### P1 (High Priority) - Future Phase
- [ ] Real OAuth integration for platforms (Facebook, Twitter, LinkedIn APIs)
- [ ] Multi-user team support with roles
- [ ] Real-time notifications (WebSocket)

### P2 (Medium Priority) - Future Phase
- [ ] AI content suggestions
- [ ] Content templates library
- [ ] Bulk scheduling
- [ ] Content calendar drag-and-drop

### P3 (Low Priority) - Future Phase
- [ ] Custom branding
- [ ] White-label solution
- [ ] API for external integrations

## Next Tasks
1. Integrate real Facebook/Twitter/LinkedIn OAuth and APIs
2. Add real-time notifications for new messages
3. Implement AI-powered content suggestions
4. Add team collaboration features

## Technical Notes
- All API routes prefixed with /api for Kubernetes ingress
- MongoDB _id excluded from all responses
- JWT stored in localStorage as 'socialhub_token'
- OAuth tokens encrypted before storage
- Hot reload enabled for development
