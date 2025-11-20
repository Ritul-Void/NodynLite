Looking at the current v0.2.0 features, here are solid v2 upgrade ideas:

Core Features
Conversation History & Persistence

Save chat threads per-origin to IndexedDB
Resume conversations later
Tree-view of conversation branches
Hybrid Search

Combine keyword matching + semantic similarity
BM25 ranking for keyword relevance
Weighted blend of both scores
Multi-page Context

Option to ingest multiple pages and treat as single knowledge base
Cross-site retrieval (user choice to opt-in)
Domain-wide vs origin-specific toggles
Reply to Citations

Click a citation pill to ask follow-up questions about that specific chunk
Threading/branching conversations
"Explain this chunk further" quick action
UX/Features
Customizable Inference Settings

Control temperature, top-k, max_tokens sliders
Save preset prompts (e.g., "Explain like I'm 5", "Formal summary", etc)
Prompt injection sandbox (user writes custom system prompts)
Visual Improvements

Dark mode toggle
Code block syntax highlighting in responses
Markdown rendering (bold, lists, tables)
Collapsible/expandable chunks in citations
Bulk Operations

Batch ingest multiple tabs at once
Bulk delete vectors across multiple origins
Export all ingested data as JSON/CSV
Advanced
Offline Mode

Detect network loss, queue operations
Cache model weights locally (already done with Transformers.js)
Sync when back online
Knowledge Graph Visualization

Graph view of related chunks/concepts
Network of citations and connections
Retrieval Augmentation

Re-ranking pipeline (cross-encoder model to re-score top-k)
Parent document retrieval (chunk hierarchies)
Query expansion (generate related queries, then blend results)
Integration Layer

Obsidian/Notion plugin exports
Paste summaries directly into docs
Webhook integration for automation
Performance

Quantized embedding models for faster inference
Streaming ingestion (process chunks as they arrive)
Service worker caching of embeddings
Most Impactful for MVP v2:
I'd prioritize:

#1 Conversation History (huge UX win, users expect it)
#2 Hybrid Search (tangibly better retrieval)
#4 Reply to Citations (natural conversational flow)
#5 Prompt Customization (power users want control)
#6 Dark Mode + Markdown (polish & accessibility)