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
- **Backend**: FastAPI (Python) with async MongoDB (Motor)
- **Database**: MongoDB with collections: users, social_accounts, posts
- **Auth**: JWT tokens (7-day expiry), bcrypt password hashing

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

### Backend (FastAPI)
- Auth endpoints: /api/auth/register, /api/auth/login, /api/auth/me
- Accounts endpoints: /api/accounts, /api/accounts/platforms, /api/accounts/oauth/:platform
- Posts CRUD: /api/posts (GET, POST), /api/posts/:id (GET, PUT, DELETE)
- Token encryption for OAuth tokens (AES simulation)
- MongoDB indexes for performance

### Frontend (React)
- Login/Register pages with playful design
- Dashboard with 4 stat cards and recent posts
- Accounts page with 25 platform cards grid
- Posts list with filter tabs
- Add/Edit post forms with platform selector
- Collapsible sidebar with navigation
- Toast notifications (Sonner)
- Responsive design

### Design System
- Light theme with Indigo/Purple/Pink accent colors
- Outfit font for headings, DM Sans for body
- Rounded corners (3xl cards, full buttons)
- Soft shadows with hover effects
- Framer Motion animations

## Prioritized Backlog

### P0 (Critical) - DONE
- [x] Authentication (register, login, protected routes)
- [x] 25 platform cards display
- [x] Posts CRUD functionality
- [x] Dashboard stats

### P1 (High Priority) - Future Phase
- [ ] Post Scheduling with date/time picker
- [ ] Calendar view for scheduled posts
- [ ] node-cron auto-publishing
- [ ] Real OAuth integration for platforms

### P2 (Medium Priority) - Future Phase
- [ ] Inbox for social interactions
- [ ] Analytics dashboard
- [ ] Multi-user team support
- [ ] Content templates

### P3 (Low Priority) - Future Phase
- [ ] AI content suggestions
- [ ] Bulk scheduling
- [ ] Custom branding
- [ ] API integrations

## Next Tasks
1. Implement Post Scheduling feature (date/time picker)
2. Add Calendar view for scheduled posts
3. Set up real OAuth for major platforms (Facebook, Twitter, LinkedIn)
4. Build Analytics dashboard with engagement metrics
5. Add Inbox for managing comments/messages

## Technical Notes
- All API routes prefixed with /api for Kubernetes ingress
- MongoDB _id excluded from all responses
- JWT stored in localStorage as 'socialhub_token'
- OAuth tokens encrypted before storage
- Hot reload enabled for development
