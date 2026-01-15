# Technology Stack

## Frontend

**Core Technologies:**
- Vanilla JavaScript (no framework)
- HTML5 + CSS3
- Device-specific routing (mobile/PC detection)

**Libraries:**
- axios: HTTP client for API communication
- WaveSurfer.js: Audio waveform visualization

**Architecture:**
- Modular file organization using dot-notation naming
- Separate CSS/JS files per feature module
- Version-controlled static assets via query parameters (`?v=24`)

## Backend

**Framework & Language:**
- Python 3.11
- FastAPI 0.109.0
- Uvicorn ASGI server

**Audio Processing:**
- librosa: Audio analysis and feature extraction
- pydub: Audio manipulation and format conversion
- ffmpeg: Audio encoding/decoding (system dependency)

**Key Dependencies:**
```
fastapi==0.109.0
uvicorn[standard]==0.27.0
librosa==0.10.1
pydub==0.25.1
httpx==0.27.0
aiofiles==23.2.1
```

**External Services:**
- PiAPI ACE-Step: AI audio generation and extension

## Infrastructure

**Web Server:**
- Nginx: Reverse proxy, SSL termination, static file serving
- Configuration: `deploy/bem.it.sc.cn.conf`

**Process Management:**
- PM2: Backend process supervision
- Configuration: `deploy/pm2.config.js`

**Python Environment:**
- Virtual environment (venv) at project root
- PM2 configured to use venv Python interpreter

## Common Commands

### Local Development

```bash
# Quick start (interactive menu)
./go.sh

# Start local development servers
./go.sh 0

# Backend only
cd api && source venv/bin/activate && uvicorn main:app --reload --port 8000

# Frontend only
cd web && python3 -m http.server 8080
```

### Deployment

```bash
# Deploy to production
./go.sh 1

# Check service status
./go.sh 2

# Clean temporary files
./go.sh 3
```

### Service Management

```bash
# PM2 operations
pm2 restart BigEyeMix-API --update-env
pm2 logs BigEyeMix-API --lines 20

# Nginx operations
nginx -t && nginx -s reload
```

### Python Environment

```bash
# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r api/requirements.txt
```

## Build System

No build step required - static files served directly. CSS/JS versioning handled via query parameters.

## Environment Configuration

Backend configuration via `.env` file:
```bash
PIAPI_KEY=your_api_key
PIAPI_BASE_URL=https://api.piapi.ai
SERVER_PUBLIC_URL=https://bem.it.sc.cn
CORS_ORIGINS=http://localhost:8080,https://bem.it.sc.cn
```
