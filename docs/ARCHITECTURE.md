# SwarmUI Architecture

## System Overview

```mermaid
graph TB
    subgraph Client["Browser Client"]
        UI[React UI]
        WS[WebSocket Client]
        Store[Zustand Store]
    end
    
    subgraph Server["Node.js Server"]
        HTTP[HTTP Server]
        WSS[WebSocket Server]
        Auth[NextAuth.js]
        
        subgraph API["API Layer"]
            Routes[API Routes]
            Middleware[Middleware]
        end
        
        subgraph Core["Core Services"]
            Orchestrator[Orchestrator]
            JobQueue[Job Queue]
            Scheduler[Scheduler]
        end
        
        subgraph Agents["Agent Layer"]
            CLI[CLI Runner]
            APIRunner[API Runner]
            MCP[MCP Client]
        end
        
        subgraph Storage["Storage Layer"]
            LowDB[(LowDB)]
            FileSystem[File System]
            Cache[Output Cache]
        end
    end
    
    subgraph External["External Services"]
        GitHub[GitHub API]
        Figma[Figma API]
        LLMs[LLM Providers]
    end
    
    UI --> HTTP
    WS --> WSS
    Store --> UI
    
    HTTP --> Routes
    Routes --> Middleware
    Middleware --> Auth
    
    Routes --> Core
    Core --> Agents
    Core --> Storage
    
    Agents --> LLMs
    Agents --> GitHub
    Agents --> Figma
```

## Component Architecture

```mermaid
graph LR
    subgraph Frontend["Frontend Components"]
        AppShell[App Shell]
        ChatView[Chat View]
        IDE[Dev Environment]
        Dashboard[Dashboards]
        Settings[Settings]
    end
    
    subgraph IDE_Components["IDE Components"]
        Editor[Monaco Editor]
        FileTree[File Tree]
        Terminal[Terminal]
        Git[Git Panel]
        Debug[Debugger]
    end
    
    subgraph Dashboard_Components["Dashboard Components"]
        Agent[Agent Dashboard]
        Testing[Testing Dashboard]
        Eclipse[Eclipse Dashboard]
        Project[Project Dashboard]
    end
    
    AppShell --> ChatView
    AppShell --> IDE
    AppShell --> Dashboard
    AppShell --> Settings
    
    IDE --> Editor
    IDE --> FileTree
    IDE --> Terminal
    IDE --> Git
    IDE --> Debug
    
    Dashboard --> Agent
    Dashboard --> Testing
    Dashboard --> Eclipse
    Dashboard --> Project
```

## Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as React UI
    participant WS as WebSocket
    participant O as Orchestrator
    participant Q as Job Queue
    participant A as Agent
    participant S as Storage
    
    U->>UI: Submit prompt
    UI->>WS: start-swarm
    WS->>Q: Enqueue job
    Q->>O: Process job
    
    loop 6 Stages
        O->>A: Spawn agent
        A->>O: Output + confidence
        O->>WS: agent-output
        WS->>UI: Update UI
    end
    
    O->>S: Save evidence
    O->>WS: swarm-result
    WS->>UI: Display result
```

## Pipeline Stages

```mermaid
graph LR
    R[1. Research] --> P[2. Plan]
    P --> C[3. Code]
    C --> V[4. Validate]
    V --> S[5. Security]
    S --> Y[6. Synthesize]
    
    style R fill:#e1f5fe
    style P fill:#fff3e0
    style C fill:#e8f5e9
    style V fill:#fce4ec
    style S fill:#f3e5f5
    style Y fill:#e0f2f1
```

## Security Architecture

```mermaid
graph TB
    subgraph Auth["Authentication"]
        OAuth[OAuth Providers]
        JWT[JWT Sessions]
        RBAC[Role-Based Access]
    end
    
    subgraph Security["Security Checks"]
        Secrets[Secrets Scanner]
        SAST[SAST Analysis]
        Audit[npm Audit]
        TypeCheck[TypeScript]
        Lint[ESLint]
    end
    
    subgraph Protection["Runtime Protection"]
        RateLimit[Rate Limiting]
        Sanitize[Input Sanitization]
        Encrypt[Encryption]
    end
    
    OAuth --> JWT
    JWT --> RBAC
    
    Security --> Protection
```

## Deployment Architecture

```mermaid
graph TB
    subgraph CI["CI/CD Pipeline"]
        Lint[Lint & Type Check]
        Test[Unit & E2E Tests]
        Security[Security Scans]
        Build[Docker Build]
        Deploy[Deploy]
    end
    
    subgraph Monitoring["Observability"]
        Prometheus[Prometheus]
        Grafana[Grafana]
        Loki[Loki]
        Tempo[Tempo]
    end
    
    subgraph Runtime["Runtime"]
        App[SwarmUI App]
        DB[(LowDB)]
    end
    
    Lint --> Test
    Test --> Security
    Security --> Build
    Build --> Deploy
    Deploy --> Runtime
    
    Runtime --> Monitoring
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TypeScript 5, Tailwind CSS v4 |
| State | Zustand 5 |
| UI Components | Shadcn/ui, Radix UI |
| Editor | Monaco Editor |
| Terminal | XTerm.js |
| Backend | Node.js, Next.js API Routes |
| WebSocket | ws |
| Database | LowDB (JSON) |
| Auth | NextAuth.js (Auth.js v5) |
| Testing | Vitest, Playwright |
| CI/CD | GitHub Actions |
| Monitoring | Prometheus, Grafana, Loki, Tempo |
| Container | Docker |

## Directory Structure

```
swarm-ui/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   ├── auth/          # NextAuth endpoints
│   │   ├── files/         # File system API
│   │   ├── git/           # Git operations
│   │   ├── health/        # Health checks
│   │   ├── jobs/          # Job queue API
│   │   ├── projects/      # Project management
│   │   └── ...
│   ├── login/             # Login page
│   ├── globals.css        # Tailwind v4 styles
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── ui/               # Shadcn/ui primitives
│   ├── app-shell.tsx     # Main app container
│   ├── chat-view.tsx     # Chat interface
│   ├── dev-environment.tsx # IDE panel
│   └── ...
├── lib/                   # Shared utilities
│   ├── store.ts          # Zustand store
│   ├── types.ts          # TypeScript types
│   └── ws-client.ts      # WebSocket client
├── server/               # Server-side code
│   ├── orchestrator.ts   # Pipeline orchestrator
│   ├── job-queue.ts      # Background jobs
│   ├── cli-runner.ts     # Agent spawning
│   └── ...
├── e2e/                  # Playwright tests
├── docs/                 # Documentation
└── monitoring/           # Observability configs
```

## Key Architectural Decisions

### 1. Monorepo with Next.js
Single codebase for frontend and backend, simplifying deployment and development.

### 2. WebSocket for Real-time Updates
Bidirectional communication for live agent output streaming during pipeline execution.

### 3. Job Queue for Background Processing
Persistent job queue ensures pipeline runs survive browser disconnects.

### 4. LowDB for Simplicity
JSON-based storage eliminates database setup complexity while supporting persistence.

### 5. Multi-Agent Pipeline
6-stage pipeline (Research → Plan → Code → Validate → Security → Synthesize) with confidence scoring and consensus.
