#!/bin/bash
# Clear the polyg graph in FalkorDB

set -e

GRAPH_NAME="${1:-polyg}"

echo "Clearing graph '$GRAPH_NAME'..."

if redis-cli GRAPH.DELETE "$GRAPH_NAME" 2>/dev/null; then
    echo "Graph '$GRAPH_NAME' cleared successfully."
else
    echo "Graph '$GRAPH_NAME' does not exist or already cleared."
fi
