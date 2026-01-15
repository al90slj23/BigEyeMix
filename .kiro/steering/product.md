# BigEyeMix Product Overview

BigEyeMix (大眼怪の混剪平台) is an AI-powered online audio mixing and editing platform.

## Core Features

**Two Operating Modes:**
- **Muggle Mode** (麻瓜模式): Simplified 3-step audio mixing for quick edits
- **Wizard Mode** (巫师模式): Full-featured professional audio editing

**Key Capabilities:**
- Audio file upload and processing
- AI-powered transition generation (Magic Fill via PiAPI ACE-Step)
- Multiple transition types: magic fill, beat sync, crossfade, silence
- Waveform visualization and timeline editing
- Multi-track audio mixing

## Architecture

- **Frontend**: Vanilla JavaScript SPA with device-specific routing (mobile/PC)
- **Backend**: Python FastAPI serving RESTful API
- **AI Integration**: PiAPI ACE-Step model for intelligent audio transitions
- **Deployment**: Nginx reverse proxy + PM2 process management

## Domain

Production URL: https://bem.it.sc.cn
