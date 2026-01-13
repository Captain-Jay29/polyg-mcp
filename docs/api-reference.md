# API Reference

## MCP Tools

### High-Level Tools (LLM-Powered)

#### `recall`
Query memory with natural language.

```json
{
  "query": "Why did the auth service fail?",
  "include_reasoning": true,
  "max_results": 10
}
```

#### `remember`
Store new information.

```json
{
  "content": "The auth service crashed due to missing AUTH_SECRET",
  "context": "Deployment incident on Jan 7"
}
```

### Entity Tools

#### `get_entity`
```json
{ "name": "auth-service", "include_relationships": true }
```

#### `add_entity`
```json
{ "name": "auth-service", "entity_type": "Service", "properties": {"team": "platform"} }
```

#### `link_entities`
```json
{ "source": "alice", "target": "auth-service", "relationship": "owns" }
```

### Temporal Tools

#### `query_timeline`
```json
{ "from": "2026-01-01", "to": "2026-01-31", "entity": "auth-service" }
```

#### `add_event`
```json
{ "description": "Auth service deployed", "occurred_at": "2026-01-07T14:00:00Z" }
```

#### `add_fact`
```json
{ "subject": "Alice", "predicate": "works_on", "object": "Auth Service", "valid_from": "2025-06-01" }
```

### Causal Tools

#### `get_causal_chain`
```json
{ "event": "auth service crash", "direction": "upstream" }
```

#### `add_causal_link`
```json
{ "cause": "missing AUTH_SECRET", "effect": "auth crash", "confidence": 0.95 }
```

#### `explain_why`
```json
{ "event": "deployment failure" }
```

### Semantic Tools

#### `search_semantic`
```json
{ "query": "authentication", "limit": 10 }
```

#### `add_concept`
```json
{ "name": "OAuth2", "description": "Authentication protocol" }
```

### Management Tools

#### `get_statistics`
```json
{}
```

#### `clear_graph`
```json
{ "graph": "temporal" }
```

#### `export_graph`
```json
{ "format": "cypher" }
```
