# Master Idea Document

## End Goal

My app helps **growth teams, agencies, and consultancies managing multiple client accounts** achieve **clear, updated, and actionable visibility of each account's status** using **AI-powered transcript and data processing to generate summaries, extract tasks, detect health/risk/opportunity signals, and maintain an up-to-date situation overview per account**.

---

## Specific Problem

Growth teams, agencies, and consultancies managing multiple client accounts have critical account information scattered across meetings, transcripts, spreadsheets, dashboards, CRMs, emails, and operational tools. As a result, real follow-up depends too much on individual memory and judgment, leading to context loss, tasks not executed on time, low visibility for management, and difficulty detecting risks, growth opportunities, or churn signals early enough. This not only consumes operational time but also makes it harder to react quickly and demonstrate the clear value of the work done to clients.

**Information currently lives in:**
- Meeting transcripts and Google Drive folders
- Google Ads, Meta Ads, and LinkedIn Ads dashboards or connectors
- CRM systems
- Spreadsheets and manual exports
- Follow-up emails
- Meeting notes and minutes
- Tools like Asana, Notion, or similar

---

## All User Types

### Account Managers / Growth Strategists (Primary Users)
- **Who:** Team members directly managing 3-15 client accounts at agencies or growth consultancies
- **Frustrations:**
  - Context is lost between meetings; they rely on memory to know the real status of each account
  - Tasks or actions arising from calls and meetings are not always followed up consistently
  - Difficult to quickly prepare a client update or detect a risk before it escalates
- **Urgent Goals:**
  - Always have a clear, updated view of each account without relying on manual effort
  - Automatically detect risks, pending tasks, and opportunities
  - Clearly demonstrate the value of the work done to clients and management

### Team Leads / Management
- **Who:** Directors, leaders, or managers overseeing multiple account managers and a client portfolio
- **Frustrations:**
  - No consolidated, reliable view of the overall portfolio health
  - Difficult to know which accounts need attention without asking the team one by one
- **Urgent Goals:**
  - See portfolio health status in real time
  - Identify at-risk accounts before the problem escalates
  - Detect cross-sell, upsell, or expansion opportunities earlier

### System Administrators
- **Who:** Operations people, technical profiles, or internal configuration owners
- **Frustrations:**
  - No centralized control over integrations, access, permissions, and configuration of what data to show per account
- **Urgent Goals:**
  - Manage integrations, users, permissions, and configurations from a single panel
  - Adapt which metrics, sources, and views are shown based on client or account type

### Client Stakeholders (post-MVP)
- **Who:** People on the client side who could have read access to their own account — founders, managers, or marketing leads
- **Frustrations:**
  - No clear, organized, and always-updated view of what was done, how the account is performing, and what needs attention
  - Often depend on meetings, emails, or manual reports to understand the situation
- **Urgent Goals:**
  - See the current state of their account in a simple way
  - Understand progress, pending items, risks, and opportunities without needing to ask the team for context
  - Have greater visibility into the value and follow-through of the work performed

---

## Business Model & Revenue Strategy

- **Model Type:** Workspace-based subscription tiers
- **Why this fits:** Agencies and growth teams have ongoing, continuous needs. The platform's value increases as accounts, meetings, history, tasks, and signals accumulate. Pricing per workspace aligns with how these teams evaluate internal tools.

- **Pricing Structure:**
  - **Free Tier:** 1 workspace, up to 2 accounts, limited AI processing (e.g. 5 transcripts/month) — enough to experience core value
  - **Starter (~$49/month):** Up to 10 accounts, full transcript processing, task extraction, summaries, and basic health signals. No client view.
  - **Pro (~$99/month):** Up to 30 accounts, portfolio dashboard for management, client read-only view, ad platform and CRM integrations
  - **Agency/Enterprise (~$199+/month):** Unlimited accounts, custom integrations, white-label client view, advanced admin controls, priority support and SLAs

- **Upgrade triggers:**
  - Reaching account limits
  - Needing client-facing view
  - Wanting to integrate Google Ads, Meta Ads, LinkedIn, or CRM
  - Needing consolidated portfolio view for leadership
  - Requiring higher transcript processing volume or automations

- **Revenue Rationale:** For an agency or consultancy, losing even one client due to poor visibility, bad follow-up, or slow reaction costs far more than a monthly subscription. The ROI is easy to justify if the platform helps retain accounts, detect risk earlier, and organize operations better.

- **Implementation Note:** Store only `stripe_customer_id` in the database. Stripe Customer Portal handles upgrades, downgrades, and subscription management. Usage limits (accounts, transcripts, integrations, active views) are tracked in the product's own database.

- **MVP Note:** The initial MVP will launch without billing for internal use and validation before enabling subscriptions.

---

## Core Functionalities by Role (MVP)

### Account Manager / Growth Strategist
- Create and manage accounts (client profile with context, goals, key contacts, and general status)
- Upload meeting transcripts for AI processing
- View AI-generated account summary: current status, open tasks, risks, opportunities, and latest relevant updates
- View and manage AI-extracted or AI-suggested tasks per account
- Mark tasks as done and add updates or manual notes
- Edit or correct AI-generated summaries, tasks, and detected signals when needed
- View simple account health signals (e.g. green / yellow / red)
- View key defined metrics per account (e.g. Google Ads, Meta Ads, and other MVP-prioritized sources)
- Add manual updates, decisions, and relevant notes even without a meeting transcript
- Set up a new account with goals, contacts, service scope, and relevant context

### Team Lead / Management
- View a portfolio dashboard with all accounts and their general status
- Filter accounts by status, owner, or last activity
- Drill into any account to understand context, pending items, metrics, and AI-generated risk or opportunity signals
- Identify accounts with no recent activity or follow-up

### System Administrator
- Invite and manage users, roles, and permissions
- Assign accounts to internal owners
- Configure which data sources and metrics are shown per account (basic configuration)

### Client Stakeholder (post-MVP)
- Read-only view of their own account
- View general summary, current status, defined metrics, latest updates, and upcoming pending items

---

## Key User Stories

### Account Manager / Growth Strategist

1. **Upload transcript and get account update**
   *As an* Account Manager, *I want to* upload a meeting transcript and have AI generate a summary with tasks, risks, and opportunities, *so that* I don't have to manually process every meeting and can focus on acting instead of documenting.

2. **See current account status at a glance**
   *As an* Account Manager, *I want to* open any account and immediately see its health signal, open tasks, key metrics, and latest AI summary, *so that* I'm always prepared without digging through notes or emails.

3. **Edit AI-generated content**
   *As an* Account Manager, *I want to* correct or adjust tasks, summaries, and signals generated by AI, *so that* the account record stays accurate even when the AI misses nuance.

4. **Track and close tasks per account**
   *As an* Account Manager, *I want to* mark tasks as done and add manual notes, *so that* there's a clear record of what was executed and communicated.

5. **Update an account manually without a transcript**
   *As an* Account Manager, *I want to* add manual updates, decisions, and relevant account notes even when there is no meeting transcript, *so that* the account stays current beyond formal calls.

6. **Set up a new account with key context**
   *As an* Account Manager, *I want to* create a new account with its goals, contacts, service scope, and relevant context, *so that* anyone on the team can understand the account from the beginning.

### Team Lead / Management

1. **Portfolio health overview**
   *As a* Team Lead, *I want to* see all accounts with their health signals on a single dashboard, *so that* I can quickly identify which accounts need attention without asking each account manager.

2. **Drill into an account**
   *As a* Team Lead, *I want to* click into any account and see its full detail, *so that* I can understand context and risks before a client call or team review.

3. **Detect inactive or unattended accounts**
   *As a* Team Lead, *I want to* identify accounts with no recent activity or follow-up, *so that* I can prevent important accounts from being neglected.

### System Administrator

1. **Manage users and access**
   *As an* Admin, *I want to* invite team members, assign roles, and control which accounts they can access, *so that* the workspace stays organized and secure.

2. **Configure account data sources**
   *As an* Admin, *I want to* define which metrics and data sources are active per account, *so that* each account view shows only relevant information.

### System / Background

1. **AI transcript processing** — When a transcript is uploaded, the system extracts tasks, generates a summary, updates the account health signal, and flags risks and opportunities automatically.

2. **Account health recalculation** — When new data (transcript, metrics, manual note) is added to an account, the health signal and situation overview are recalculated and updated.

3. **Inactivity detection** — When an account has no relevant activity for a defined period, the system flags it so the team can review whether there is follow-up risk or lack of account momentum.

---

## Value-Adding Features (Advanced / Post-MVP)

- **Client-facing read-only view:** Clients log in to see their own account status, metrics, and open items without needing a meeting. Directly addresses client transparency pain; clear Pro-tier upgrade trigger.

- **Google Drive folder sync:** Auto-import transcripts from a configured Drive folder per account. Removes the main manual friction point validated in MVP; natural phase-2 unlock.

- **Ad platform integrations (Google Ads, Meta Ads, LinkedIn):** Pull key metrics automatically per account. Eliminates manual dashboard checks; makes health signals data-driven, not just transcript-based.

- **AI-generated client report:** One-click exportable summary of account status, work done, results, and next steps. Directly solves the "show value to client" pain; strong upsell feature for Pro/Agency tiers.

- **Account timeline / activity log:** Chronological view of every update, transcript, task, and note per account. Builds institutional memory; especially valuable when account managers change.

- **Risk and opportunity digest:** Weekly AI-generated email or in-app digest of accounts needing attention across the portfolio. Proactive intelligence without requiring daily logins; high-value for management tier.

- **Flexible per-account configuration:** Define which metrics, sources, and signals are relevant based on client type. Important because not all accounts should look the same or be measured with the same logic.

---

## Product Guardrail

This product must stay focused on its core identity: **intelligence, context, follow-up, and account status**. It should not evolve into a BI suite, a CRM, or a project management tool. Every feature decision should reinforce — not dilute — this focus.
