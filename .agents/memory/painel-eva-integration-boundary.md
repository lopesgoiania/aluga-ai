---
name: Painel Eva integration boundary
description: Existing system ownership and separation constraints for future Painel Eva integrations.
---

The existing operational path is WhatsApp → Evolution API → n8n/Eva → Supabase `aluga-ai`. `Buscaimóveis` is a separate property catalog synced by a scraping workflow. Painel Eva is an operations and observability interface, not a replacement for Eva, n8n, or either data system. The initial app uses fictional local data only.

**Why:** The user explicitly requires preserving the working operational database, separate property catalog, and already-published workflows; real service integration is a later phase.

**How to apply:** Keep the demo disconnected from live services until integration is requested. When integrating, connect to the existing systems and preserve the operational/catalog separation. Do not create a parallel database or recreate existing workflows.