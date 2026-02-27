# SwarmUI

[![CI](https://github.com/your-org/swarm-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/swarm-ui/actions/workflows/ci.yml)
[![Docker](https://github.com/your-org/swarm-ui/actions/workflows/docker.yml/badge.svg)](https://github.com/your-org/swarm-ui/actions/workflows/docker.yml)
[![Azure Deploy](https://github.com/your-org/swarm-ui/actions/workflows/azure-webapps-node.yml/badge.svg)](https://github.com/your-org/swarm-ui/actions/workflows/azure-webapps-node.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A parallel CLI agent orchestrator with a modern Grok/Gemini-style web UI.

## Features

- **Multi-Agent Orchestration**: Run multiple CLI agents in parallel
- **Real-time WebSocket Communication**: Live updates and streaming output
- **Modern UI**: Built with Next.js 15, React 19, and Tailwind CSS v4
- **Integrated IDE**: Monaco editor, file browser, and terminal
- **Job Queue**: Persistent background job processing
- **Confidence Scoring**: Jaccard similarity-based output validation
- **Output Caching**: LRU cache for repeated queries
- **Prometheus Metrics**: Full observability with `/api/metrics`
- **Health Monitoring**: `/api/health` endpoint for load balancers

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/swarm-ui.git
cd swarm-ui

# Install dependencies
npm ci

# Copy environment file
cp .env.example .env

# Start development server
npm run dev
```

The application will be available at `http://localhost:3000`.

### Docker

```bash
# Build and run with Docker
docker build -t swarm-ui .
docker run -p 3000:3000 --env-file .env swarm-ui

# Or use Docker Compose
docker-compose up -d
```

## Development

```bash
# Full dev server (Next.js + WebSocket)
npm run dev

# Next.js only (UI work)
npm run dev:next

# Linting
npm run lint

# Type checking
npm run typecheck

# Build for production
npm run build
```

## Architecture

```
swarm-ui/
├── app/                  # Next.js App Router pages and API routes
│   ├── api/              # REST API endpoints
│   └── page.tsx          # Main application page
├── components/           # React components
├── lib/                  # Shared utilities and types
├── server/               # Server-side code
│   ├── orchestrator.ts   # Agent orchestration logic
│   ├── job-queue.ts      # Background job processing
│   ├── cli-runner.ts     # CLI execution with retry logic
│   └── ws-server.ts      # WebSocket server
└── server.ts             # Custom server entry point
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check with system status |
| `GET /api/metrics` | Prometheus metrics |
| `GET /api/sessions` | List chat sessions |
| `GET /api/settings` | Application settings |
| `GET /api/cli-detect` | Detect installed CLIs |
| `GET /api/files` | File browser listing |
| `GET /api/jobs` | Job queue status |

## Configuration

Environment variables (see `.env.example`):

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `NEXTAUTH_SECRET` | Auth secret | - |
| `NEXTAUTH_URL` | Auth callback URL | - |

## Deployment

### Azure App Service

1. Create an Azure Web App (Node.js 20)
2. Configure `AZURE_WEBAPP_PUBLISH_PROFILE` secret
3. Push to `main` branch

### Tencent Kubernetes Engine

1. Configure TKE cluster credentials
2. Set required secrets:
   - `TENCENT_CLOUD_SECRET_ID`
   - `TENCENT_CLOUD_SECRET_KEY`
   - `TENCENT_CLOUD_ACCOUNT_ID`
   - `TKE_REGISTRY_PASSWORD`
3. Push to `main` branch

### Docker (GHCR)

Images are automatically built and pushed to GitHub Container Registry:

```bash
docker pull ghcr.io/your-org/swarm-ui:latest
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.
