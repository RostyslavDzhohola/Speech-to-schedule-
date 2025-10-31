# Voice Calendar MVP

A Next.js application that allows users to manage their Google Calendar through voice commands using OpenAI's Voice Agents API.

## Features

- 🔐 Clerk authentication
- 🗣️ Voice interaction via OpenAI Realtime API (WebRTC)
- 📅 Google Calendar integration (create, update, delete, list events)
- 💾 Convex database for token storage and logging
- 🔄 Real-time event list updates

## Prerequisites

- Node.js 18+
- pnpm
- Clerk account
- OpenAI API key
- Google Cloud project with Calendar API enabled
- Convex account

## Setup

1. **Clone and install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment variables:**
   Copy `.env.example` to `.env.local` and fill in all values:
   ```bash
   cp .env.example .env.local
   ```

3. **Set up Clerk:**
   - Create a Clerk account at https://clerk.com
   - Create a new application
   - Copy the publishable key and secret key to `.env.local`

4. **Set up Google OAuth:**
   - Go to Google Cloud Console
   - Create a new project or select existing
   - Enable Google Calendar API
   - Create OAuth 2.0 credentials (Web application)
   - Add authorized redirect URI: `http://localhost:3000/api/google/oauth/callback`
   - Copy Client ID and Client Secret to `.env.local`

5. **Set up Convex:**
   ```bash
   pnpm dlx convex dev
   ```
   This will initialize Convex and give you the deployment URL. Add it to `.env.local` as `NEXT_PUBLIC_CONVEX_URL`.

6. **Run the development server:**
   ```bash
   pnpm dev
   ```

7. **Open your browser:**
   Navigate to http://localhost:3000

## Usage

1. Sign in with Clerk
2. Connect your Google Calendar account
3. Navigate to `/voice-test`
4. Click "Connect & Start Voice Session"
5. Grant microphone permissions
6. Start speaking to manage your calendar!

## Voice Commands Examples

- "Create a meeting tomorrow at 2pm"
- "Show me my events for next week"
- "Delete the meeting on Friday"
- "Update the Tuesday meeting to start at 3pm"

## Project Structure

```
src/
  app/
    api/
      calendar/          # Calendar API routes
      google/oauth/       # Google OAuth routes
      server/            # Server actions
    voice-test/          # Voice agent test page
  components/
    ConnectCalendarBadge.tsx
    EventsList.tsx
convex/
  schema.ts             # Database schema
  tokens.ts             # Token helpers
```

## Technologies Used

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Clerk (Authentication)
- OpenAI Agents SDK (Voice Agents)
- Google Calendar API
- Convex (Database)
- Zod (Validation)

