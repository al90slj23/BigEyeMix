# Project Structure

## Root Layout

```
BigEyeMix/
├── web/                    # Frontend static files
├── api/                    # Backend FastAPI application
├── deploy/                 # Deployment configurations
├── docs/                   # Project documentation
├── ZERO/                   # ZERO framework reference specs
├── go.sh                   # Unified entry script
├── go.*.sh                 # Modular operation scripts
└── docker-compose.yml      # Docker setup (optional)
```

## Frontend Structure (`web/`)

```
web/
├── index.html              # Root entry point
├── favicon.svg
├── home/                   # Landing page (mode selection)
│   └── index.html
├── muggle/                 # Muggle mode (simplified editing)
│   ├── index.html          # Device router
│   ├── index.mobile.html   # Mobile interface
│   ├── index.pc.html       # Desktop interface
│   ├── Muggle.*.js         # Feature modules
│   └── Muggle.*.css        # Corresponding styles
└── wizard/                 # Wizard mode (advanced editing)
    └── index.html
```

**Frontend Module Organization:**
- Dot-notation naming: `Muggle.feature.js`, `Muggle.feature.subfeat.js`
- Co-located CSS: `Muggle.feature.css` alongside JS files
- No nested subdirectories for modules

## Backend Structure (`api/`)

```
api/
├── main.py                 # FastAPI application entry
├── requirements.txt        # Python dependencies
├── start.sh               # Startup script
├── .env                   # Environment configuration (not synced)
├── app/
│   ├── __init__.py
│   ├── api/               # API route handlers
│   │   ├── health.py
│   │   ├── upload.py
│   │   └── process.py
│   ├── core/              # Core configuration
│   │   └── config.py
│   ├── models/            # Data models and schemas
│   │   └── schemas.py
│   └── services/          # Business logic
│       ├── audio_service.py
│       ├── file_service.py
│       └── piapi_service.py
└── data/
    ├── uploads/           # User uploaded audio files
    └── outputs/           # Generated mixed audio
        ├── cache/         # Format conversion cache
        └── temp/          # Temporary files (magic fill segments)
```

## Deployment Structure (`deploy/`)

```
deploy/
├── bem.it.sc.cn.conf      # Nginx site configuration
├── nginx.conf             # Nginx base config
├── pm2.config.js          # PM2 process config
├── production.env         # Production environment template
├── deploy.sh              # Deployment script
└── systemd/
    └── bigeye-backend.service
```

## Documentation Structure (`docs/`)

```
docs/
├── references/            # Technical references
│   ├── 01.arch.structure.md
│   ├── 02.deploy.guide.md
│   ├── 03.reference.commands.md
│   └── 04.wavesurfer.waveform.md
└── standards/             # Development standards
    ├── api.piapi.md
    ├── dev.deployment.md
    ├── dev.testing.md
    ├── frontend.js.split.md
    └── frontend.naming.md
```

## ZERO Framework Reference (`ZERO/`)

Contains reference documentation for the ZERO framework conventions that this project follows. Key areas:
- Architecture patterns
- Naming conventions
- Database design standards
- Quality guidelines

## Key File Patterns

**Shell Scripts:**
- `go.sh`: Main entry point with interactive menu
- `go.lib.sh`: Shared utility functions
- `go.0.sh`: Local development
- `go.1.sh`: Deployment
- `go.2.sh`: Status check
- `go.3.sh`: Cleanup

**Configuration Files:**
- `.env`: Backend environment variables (gitignored)
- `.env.example`: Environment template
- `docker-compose.yml`: Container orchestration

## Data Flow

1. User uploads audio → `api/data/uploads/`
2. Processing generates output → `api/data/outputs/`
3. Magic fill creates temp segments → `api/data/outputs/temp/`
4. Frontend accesses via `/api/audio/*` routes
5. Nginx serves static files from `web/` and proxies API to port 8000

## Important Notes

- `data/uploads/` and `data/outputs/` are excluded from deployment sync
- Frontend modules use dot-notation: `Module.feature.js`
- Backend follows standard Python package structure
- All directories use lowercase naming (except `Scope/` and `Shared/` in ZERO framework)
