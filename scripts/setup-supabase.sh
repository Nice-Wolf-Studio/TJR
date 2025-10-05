#!/bin/bash

###############################################################################
# Supabase Database Setup Script
# Executes schema.sql via Supabase Management API
###############################################################################

set -e

PROJECT_REF="bgxuoythpcjnfhifdgvh"
ACCESS_TOKEN="sbp_255bd52e401a414cee21d2f9a30c1b21f0497ba0"
SCHEMA_FILE="docs/database/schema.sql"

echo "🔧 Setting up Supabase database schema..."
echo "📦 Project: $PROJECT_REF"
echo "📄 Schema: $SCHEMA_FILE"
echo ""

# Check if schema file exists
if [ ! -f "$SCHEMA_FILE" ]; then
    echo "❌ Error: Schema file not found: $SCHEMA_FILE"
    exit 1
fi

# Read SQL file
echo "📖 Reading schema SQL..."
SQL_CONTENT=$(cat "$SCHEMA_FILE")

# Execute SQL via Supabase API
echo "⚡ Executing SQL via Supabase Management API..."

RESPONSE=$(curl -s -X POST \
    "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$SQL_CONTENT" | jq -Rs .)}" \
    2>&1)

# Check for errors
if echo "$RESPONSE" | grep -q '"error"'; then
    echo "❌ Error executing SQL:"
    echo "$RESPONSE" | jq -r '.error // .message // .'
    echo ""
    echo "💡 Alternative: Paste the SQL manually in Supabase SQL Editor"
    echo "   1. Go to: https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
    echo "   2. Copy contents from: $SCHEMA_FILE"
    echo "   3. Click 'Run'"
    exit 1
else
    echo "✅ SQL executed successfully!"
    echo ""
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
fi

echo ""
echo "📊 Verifying tables..."

# Verify each table
for TABLE in "market_data_cache" "query_log" "trades" "analysis"; do
    VERIFY_RESPONSE=$(curl -s \
        -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJneHVveXRocGNqbmZoaWZkZ3ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1NDA4NzksImV4cCI6MjA3NTExNjg3OX0.ZmbJ4uV6ROO_h-pNALM1wSsmWHEobaLPL5gTKpvqX7M" \
        -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJneHVveXRocGNqbmZoaWZkZ3ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1NDA4NzksImV4cCI6MjA3NTExNjg3OX0.ZmbJ4uV6ROO_h-pNALM1wSsmWHEobaLPL5gTKpvqX7M" \
        "https://bgxuoythpcjnfhifdgvh.supabase.co/rest/v1/$TABLE?select=count" \
        -H "Range: 0-0" \
        -H "Prefer: count=exact" 2>&1)

    if echo "$VERIFY_RESPONSE" | grep -q "error"; then
        echo "   ❌ $TABLE: Not found"
    else
        ROW_COUNT=$(echo "$VERIFY_RESPONSE" | grep -i "content-range" | awk -F'/' '{print $2}' || echo "0")
        echo "   ✅ $TABLE: OK (${ROW_COUNT} rows)"
    fi
done

echo ""
echo "🎉 Database setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Restart the Discord bot: cd packages/app && node dist/start.js"
echo "   2. Test with: /ask What is the current ES price?"
echo "   3. Check logs: https://supabase.com/dashboard/project/$PROJECT_REF/editor (SELECT * FROM query_log)"
echo ""
