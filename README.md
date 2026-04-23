# FYP Flashcard App

An NLP-powered spaced-repetition flashcard learning platform with multiplayer support, document import, and gamification.

## Features

- **Multiple Practice Modes** — Easy (preview then reveal), Moderate (group-based testing), and Hard (rapid-fire with incorrect card queue)
- **Fill-in-the-Blank NLP** — Six blanking variation types (random, key terms, every other word, increasing difficulty, difficulty levels) with first-letter clues
- **Auto-Generate Flashcards from Documents** — Upload PDF or DOCX files and have cards extracted automatically using NLP
- **Multiplayer** — Real-time room-based competitions via Socket.IO with join codes and live scoring
- **Adaptive Learning** — Reading speed calibration, adaptive display timing, and per-card difficulty statistics
- **Gamification** — 8-badge achievement system, unlockable background themes, daily login streaks, and study goal tracking
- **Email Reminders** — Scheduled review reminders for flashcard sets via Brevo SMTP

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router 7, Socket.IO Client |
| Backend | Node.js 20, Express 5, Socket.IO |
| Database | MySQL 8 |
| NLP Service | Python 3.10, Flask, spaCy |
| Authentication | JWT, bcrypt |
| File Processing | multer, pdf-parse, mammoth |
| Email | nodemailer, Brevo SMTP |
| Task Scheduling | node-cron |
| Containerization | Docker, Docker Compose |

## Project Structure

```
fypDocker/
├── client/          # React frontend (port 3000)
├── server/          # Node.js Express API (port 5000)
├── nlp-service/     # Python Flask NLP microservice (port 6000)
├── database/        # MySQL schema (schema.sql)
├── docker-compose.yml
├── .env             # Environment variables (copy from .env.example)
└── .env.example     # Environment variable template
```

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/get-started) and Docker Compose installed

### Steps

1. Clone the repository and navigate into it:
   ```bash
   git clone <repo-url>
   cd fypDocker
   ```

2. Copy the environment template and fill in your values:
   ```bash
   cp .env.example .env
   ```

3. Start all services:
   ```bash
   docker-compose up
   ```

### Service URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| NLP Service | http://localhost:6000 |
| phpMyAdmin | http://localhost:8080 |
| MySQL | localhost:3308 |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DB_HOST` | MySQL host (use `mysql` inside Docker) |
| `DB_USER` | MySQL username |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | MySQL database name |
| `JWT_SECRET` | Secret key for signing JWTs |
| `NLP_URL` | NLP service endpoint (use `http://nlp:6000` inside Docker) |
| `EMAIL_USER` | SMTP email address (Brevo) |
| `EMAIL_PASS` | SMTP password / API key |
| `EMAIL_FROM` | Sender email address |

## Services Overview

**client** — React SPA with pages for authentication, flashcard set management, practice sessions, multiplayer, profile, and document import. Uses React Router for routing and Socket.IO for real-time multiplayer.

**server** — Express REST API handling all business logic: user auth, flashcard CRUD, practice sessions, multiplayer rooms, file uploads, email reminders via cron job, and proxying NLP requests. Connects to MySQL via a connection pool.

**nlp-service** — Flask microservice exposing two endpoints: `/generate` for creating fill-in-the-blank variations from text, and `/generate-flashcards` for extracting Q&A cards from raw document text using spaCy.

**database** — MySQL 8 schema with tables for users, flashcard sets and cards, practice sessions and results, multiplayer rooms, badges, backgrounds, and streaks. Initialised automatically on first `docker-compose up`.

## Test Account

A pre-seeded test account is included in the database:

| Field | Value |
|-------|-------|
| Username | `testuser` |
| Password | `Roehampton` |

This account has all badges and backgrounds unlocked.
