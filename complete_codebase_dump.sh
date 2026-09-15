#!/bin/bash

# ============================================================
# TicketVolt — Complete Codebase Dump (fast + hang-proof)
# Compatible with macOS default Bash 3.2 (no mapfile needed)
# Excludes: all .env files, celerybeat-schedule, previous dump
#           files, poison sentinel, .git and stale Git backup
#           directories.
# NOTE: baileys-gateway/ IS INCLUDED. Its node_modules and
#       sessions/ dirs are still pruned for size and safety.
# ============================================================

set -o pipefail

# ---------- Colors ----------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ---------- Config ----------
PER_FILE_TIMEOUT="${PER_FILE_TIMEOUT:-8}"

# ---------- Output file ----------
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="complete_codebase_dump_${TIMESTAMP}.txt"

# ---------- File marker ----------
FILE_MARKER='@@@FILE@@@'

# ---------- Poison list ----------
POISON_FILE=".dump_poison_files"
touch "$POISON_FILE" 2>/dev/null || true

# ---------- Exclusions ----------
# Explicit enumeration — no globbing.
# ✅ baileys-gateway is NO LONGER excluded here.
#    Its node_modules/ and sessions/ subdirs are still pruned below.
EXCLUDE_DIR_RE='(^|/)(node_modules|__pycache__|\.git|\.git-projects-old|\.expo|\.expo-shared|build|dist|out|coverage|sessions|logs|media|staticfiles|\.metro|\.gradle|\.kotlin|\.cache|\.vscode|\.idea|\.npm|\.yarn|venv|env|\.venv|\.tox|\.mypy_cache|\.pytest_cache|Pods|\.next|\.nuxt|\.turbo|\.parcel-cache|\.serverless|\.terraform|\.husky|_build|target|vendor)(/|$)'

EXCLUDE_FILE_RE='\.(pyc|pyo|so|dylib|dll|exe|log|lock|map|min\.js|min\.css|png|jpg|jpeg|gif|ico|bmp|webp|tiff|pdf|zip|tar|gz|bz2|xz|7z|rar|db|sqlite|sqlite3|woff|woff2|ttf|otf|eot|mp3|mp4|mov|avi|webm|DS_Store|bak|swp|swo)$'

EXCLUDE_NAME_RE='(\.DS_Store|Thumbs\.db|celerybeat-schedule|\.dump_poison_files|complete_codebase_dump_.*\.txt)$'

EXCLUDE_ENV_RE='(^|/)\.env(\..*)?$'

SECRETS_TO_REDACT_RE='(SECRET_KEY|PASSWORD|ADMIN_TOKEN|API_KEY|DJANGO_SUPERUSER_PASSWORD|POSTGRES_PASSWORD|JWT_SECRET|JWT_SIGNING_KEY|AWS_SECRET|PRIVATE_KEY|ACCESS_TOKEN|REFRESH_TOKEN|BOT_PASSWORD)'

# ---------- find -prune expression ----------
# ✅ `-name baileys-gateway` removed — that dir is now included.
#    `-name sessions` and `-name node_modules` remain so the
#    Baileys session JSONs and deps are still skipped.
PRUNE_EXPR='-type d ( -name node_modules -o -name __pycache__ -o -name .git -o -name .git-projects-old -o -name .expo -o -name .expo-shared -o -name build -o -name dist -o -name out -o -name coverage -o -name sessions -o -name logs -o -name media -o -name staticfiles -o -name .metro -o -name .gradle -o -name .kotlin -o -name .cache -o -name .vscode -o -name .idea -o -name .npm -o -name .yarn -o -name venv -o -name env -o -name .venv -o -name .tox -o -name .mypy_cache -o -name .pytest_cache -o -name Pods -o -name .next -o -name .nuxt -o -name .turbo -o -name .parcel-cache -o -name .serverless -o -name .terraform -o -name .husky -o -name _build -o -name target -o -name vendor ) -prune'

# ---------- Banner ----------
clear
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   📦  TicketVolt — Complete Codebase Dump (fast)             ║${NC}"
echo -e "${BLUE}║       per-file timeout: ${PER_FILE_TIMEOUT}s                              ║${NC}"
echo -e "${BLUE}║       find: -prune (.git, node_modules, build, …)            ║${NC}"
echo -e "${BLUE}║       INCLUDES: baileys-gateway/ (source only)               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ---------- Locate project root ----------
if [ $# -ge 1 ] && [ -d "$1" ]; then
    cd "$1" </dev/null || { echo -e "${RED}❌ Cannot cd into $1${NC}"; exit 1; }
fi

PROJECT_ROOT="$(pwd)"
PROJECT_NAME="$(basename "$PROJECT_ROOT")"

echo -e "${CYAN}Project root:${NC} $PROJECT_ROOT"
echo -e "${CYAN}Output file:${NC}  $OUTPUT_FILE"

HAS_GTIMEOUT=0
if command -v gtimeout >/dev/null 2>&1; then
    HAS_GTIMEOUT=1
    echo -e "${CYAN}Timeout bin:${NC}  gtimeout (fast)"
else
    echo -e "${CYAN}Timeout bin:${NC}  built-in poll wrapper (install coreutils for speed)"
    echo -e "${DIM}               brew install coreutils${NC}"
fi

POISON_COUNT=0
if [ -s "$POISON_FILE" ]; then
    POISON_COUNT=$(grep -c . "$POISON_FILE" || true)
fi
if [ "$POISON_COUNT" -gt 0 ]; then
    echo -e "${CYAN}Poison files:${NC} ${POISON_COUNT} (will be skipped; rm .dump_poison_files to retry)"
fi
echo ""

# ---------- Helpers ----------
safe_grep_count() {
    local n
    n=$(grep -c "$1" "$2" 2>/dev/null) || n=0
    echo "$n"
}

run_read_timeout() {
    local secs="$1"
    shift
    local out
    out=$(mktemp -t run_out.XXXXXX)
    local rc=""

    if [ "$HAS_GTIMEOUT" = "1" ]; then
        gtimeout -s KILL "$secs" "$@" </dev/null > "$out" 2>/dev/null
        rc=$?
        cat "$out"
        rm -f "$out"
        return $rc
    fi

    (
        set -m
        "$@" </dev/null > "$out" 2>/dev/null
    ) &
    local pid=$!

    local waited=0
    local limit=$((secs * 5))

    while kill -0 "$pid" 2>/dev/null; do
        if [ "$waited" -ge "$limit" ]; then
            kill -KILL -"$pid" 2>/dev/null
            local reap_wait=0
            while kill -0 "$pid" 2>/dev/null && [ "$reap_wait" -lt 10 ]; do
                sleep 0.1
                reap_wait=$((reap_wait + 1))
            done
            rc=124
            break
        fi
        sleep 0.2
        waited=$((waited + 1))
    done

    if [ -z "$rc" ]; then
        wait "$pid" 2>/dev/null
        rc=$?
    fi

    cat "$out" 2>/dev/null
    rm -f "$out"
    return $rc
}

dump_file_content() {
    local file_path="$1"

    if [ ! -s "$file_path" ]; then
        return 0
    fi

    local head_bytes
    head_bytes=$(head -c 512 "$file_path" 2>/dev/null | LC_ALL=C tr -d '\0')
    if [ -z "$head_bytes" ]; then
        return 1
    fi

    run_read_timeout "$PER_FILE_TIMEOUT" \
        sed -E "s/(${SECRETS_TO_REDACT_RE})[[:space:]]*=[[:space:]]*['\"]?[^'\"[:space:]]+['\"]?/\1 = [REDACTED]/g" \
        "$file_path"
    return $?
}

dump_file_to_stdout() {
    local file_path="$1"
    local description="$2"
    local rel="${file_path#$PROJECT_ROOT/}"

    echo "${FILE_MARKER} ${rel}"
    echo "LOCATION: $rel"
    echo "DESCRIPTION: $description"

    if [ -s "$POISON_FILE" ] && grep -Fxq "$rel" "$POISON_FILE" 2>/dev/null; then
        echo "SIZE: "
        echo "LINES: "
        echo ""
        echo "[file is on the poison list — contents skipped; rm .dump_poison_files to retry]"
        echo ""
        return
    fi

    if [ ! -f "$file_path" ] || [ -L "$file_path" ]; then
        echo "SIZE: "
        echo "LINES: "
        echo ""
        echo "[missing or non-regular file — contents skipped]"
        echo ""
        return
    fi

    local size lines
    size=$(du -h "$file_path" 2>/dev/null </dev/null | cut -f1)
    lines=$(wc -l < "$file_path" 2>/dev/null | xargs)

    echo "SIZE: ${size:-?}"
    echo "LINES: ${lines:-?}"
    echo ""

    local tmp_content
    tmp_content=$(mktemp -t dump_content.XXXXXX)
    dump_file_content "$file_path" > "$tmp_content"
    local kind=$?

    case "$kind" in
        0)
            cat "$tmp_content"
            ;;
        124)
            echo "[file read timed out after ${PER_FILE_TIMEOUT}s — contents skipped]"
            if [ -s "$POISON_FILE" ]; then
                grep -Fxq "$rel" "$POISON_FILE" 2>/dev/null || echo "$rel" >> "$POISON_FILE"
            else
                echo "$rel" >> "$POISON_FILE"
            fi
            ;;
        *)
            echo "[binary file — contents skipped]"
            ;;
    esac

    rm -f "$tmp_content"
    echo ""
}

# ---------- Precompute file list ----------
echo -e "${YELLOW}🔍 Scanning project for source files...${NC}"
SCAN_START=$(date +%s)

TMP_LIST="$(mktemp -t dump_filelist.XXXXXX)"
TOP_DIRS_FILE="$(mktemp -t dump_topdirs.XXXXXX)"
ROOT_FILES_FILE="$(mktemp -t dump_rootfiles.XXXXXX)"
trap 'rm -f "$TMP_LIST" "$TOP_DIRS_FILE" "$ROOT_FILES_FILE"' EXIT

find "$PROJECT_ROOT" \
    $PRUNE_EXPR -o \
    -type f -print 2>/dev/null </dev/null \
    | while IFS= read -r p; do
        [ -L "$p" ] && continue
        [ -f "$p" ] || continue
        [ "$p" = "$PROJECT_ROOT/$OUTPUT_FILE" ] && continue
        [ "$p" = "$PROJECT_ROOT/$POISON_FILE" ] && continue
        echo "$p" | grep -Eq "$EXCLUDE_FILE_RE" && continue
        echo "$p" | grep -Eq "$EXCLUDE_NAME_RE" && continue
        echo "$p" | grep -Eq "$EXCLUDE_ENV_RE"  && continue
        printf '%s\n' "$p"
      done \
    | LC_ALL=C sort > "$TMP_LIST"

SCAN_END=$(date +%s)
SCAN_SECS=$((SCAN_END - SCAN_START))

TOTAL_FILES=$(wc -l < "$TMP_LIST" | xargs)

if [ "$TOTAL_FILES" -eq 0 ]; then
    echo -e "${RED}❌ No source files found. Check your project root.${NC}"
    echo -e "${YELLOW}Debug: running find -prune directly...${NC}"
    find "$PROJECT_ROOT" $PRUNE_EXPR -o -type f -print 2>&1 | head -20
    exit 1
fi

echo -e "${GREEN}✅ Found ${BOLD}${TOTAL_FILES}${NC}${GREEN} source files to dump (scan took ${SCAN_SECS}s)${NC}"
echo ""

# ---------- Progress bar ----------
CURRENT=0
START_TS=$(date +%s)

render_progress() {
    local rel_path="$1"
    local pct=$((CURRENT * 100 / TOTAL_FILES))
    local now elapsed
    now=$(date +%s)
    elapsed=$((now - START_TS))

    local bar_width=30
    local filled=$((pct * bar_width / 100))
    local empty=$((bar_width - filled))
    local bar="" i
    for ((i=0; i<filled; i++)); do bar+="█"; done
    for ((i=0; i<empty;  i++)); do bar+="░"; done

    if [ ${#rel_path} -gt 60 ]; then
        rel_path="...${rel_path: -57}"
    fi

    printf "\r${CYAN}[%3d/%3d]${NC} ${GREEN}[%s]${NC} %3d%% ${YELLOW}(%ds)${NC}  ${DIM}%s${NC}\033[K" \
        "$CURRENT" "$TOTAL_FILES" "$bar" "$pct" "$elapsed" "$rel_path" >&2
}

# ---------- Top-level dirs and root files ----------
find "$PROJECT_ROOT" -mindepth 1 -maxdepth 1 -type d -not -name ".*" 2>/dev/null </dev/null \
    | grep -Ev "$EXCLUDE_DIR_RE" \
    | LC_ALL=C sort > "$TOP_DIRS_FILE"

find "$PROJECT_ROOT" -mindepth 1 -maxdepth 1 -type f 2>/dev/null </dev/null \
    | while IFS= read -r p; do
        [ -L "$p" ] && continue
        [ -f "$p" ] || continue
        [ "$p" = "$PROJECT_ROOT/$OUTPUT_FILE" ] && continue
        [ "$p" = "$PROJECT_ROOT/$POISON_FILE" ] && continue
        echo "$p" | grep -Eq "$EXCLUDE_FILE_RE" && continue
        echo "$p" | grep -Eq "$EXCLUDE_NAME_RE" && continue
        echo "$p" | grep -Eq "$EXCLUDE_ENV_RE"  && continue
        printf '%s\n' "$p"
      done \
    | LC_ALL=C sort > "$ROOT_FILES_FILE"

# ============================================================
# BEGIN DUMP
# ============================================================
{
    # ---------- 0. HEADER ----------
    cat <<HEADER
================================================================================
COMPLETE CODEBASE DUMP
================================================================================
Generated:     $(date)
Project:       $PROJECT_NAME
Host:          $(hostname 2>/dev/null || echo unknown)
Project root:  $PROJECT_ROOT
Total files:   $TOTAL_FILES
Scan time:     ${SCAN_SECS}s
Per-file TO:   ${PER_FILE_TIMEOUT}s
Excluded:      all .env files, celerybeat-schedule, previous dump files,
               poison sentinel, .git, .git-projects-old, sessions/, node_modules/
Included:      baileys-gateway/ source (excl. node_modules/ and sessions/)
Pruned dirs:   .git, .git-projects-old, node_modules, build, dist, sessions, …
================================================================================

HEADER

    # ---------- 1. TOP-LEVEL OVERVIEW ----------
    cat <<'SECTION'

================================================================================
1. TOP-LEVEL OVERVIEW
================================================================================

SECTION

    echo "Top-level entries in project root:"
    echo ""
    ls -la "$PROJECT_ROOT" 2>/dev/null </dev/null
    echo ""

    echo "Immediate subdirectories:"
    echo ""
    find "$PROJECT_ROOT" -mindepth 1 -maxdepth 1 -type d -not -name ".*" 2>/dev/null </dev/null | LC_ALL=C sort
    echo ""

    # ---------- 2. DIRECTORY TREE ----------
    cat <<'SECTION'

================================================================================
2. DIRECTORY TREE STRUCTURE
================================================================================

SECTION

    echo "Full directory tree (excluding build artifacts, deps, binaries, .env files):"
    echo ""

    # ✅ baileys-gateway removed from TREE_EXCLUDE so the tree renderer
    #    shows the directory. node_modules and sessions are still hidden.
    TREE_EXCLUDE='node_modules|__pycache__|.git|.git-projects-old|.expo|.expo-shared|build|dist|out|coverage|sessions|logs|media|staticfiles|.metro|.gradle|.kotlin|.cache|.vscode|.idea|.npm|.yarn|venv|env|.venv|.tox|.mypy_cache|.pytest_cache|Pods|.next|.nuxt|.turbo|.parcel-cache|.serverless|.terraform|.husky|_build|target|vendor|.env|celerybeat-schedule|complete_codebase_dump_*.txt'

    if command -v tree &>/dev/null; then
        if [ "$HAS_GTIMEOUT" = "1" ]; then
            gtimeout -s KILL 30 tree -a -L 8 -I "$TREE_EXCLUDE" --dirsfirst -F --charset utf-8 "$PROJECT_ROOT" 2>/dev/null \
                | sed "s|$PROJECT_ROOT|.|g"
        else
            tree -a -L 8 -I "$TREE_EXCLUDE" --dirsfirst -F --charset utf-8 "$PROJECT_ROOT" 2>/dev/null \
                | sed "s|$PROJECT_ROOT|.|g"
        fi
    else
        echo "(tree not installed — falling back to find -prune)"
        echo ""
        find "$PROJECT_ROOT" \
            $PRUNE_EXPR -o \
            -type d -print 2>/dev/null </dev/null \
            | sed "s|$PROJECT_ROOT|.|g" \
            | LC_ALL=C sort
    fi

    echo ""

    # ---------- 3. FILE STATISTICS ----------
    cat <<'SECTION'

================================================================================
3. FILE STATISTICS
================================================================================

SECTION

    echo "Total files (excluding build artifacts):"
    echo ""
    echo "  All source files: $TOTAL_FILES"
    echo ""

    echo "By extension (top 30):"
    echo ""
    cat "$TMP_LIST" \
        | sed -E 's/.*\.([A-Za-z0-9_]+)$/\1/' \
        | grep -E '^[A-Za-z0-9_]+$' \
        | tr 'A-Z' 'a-z' \
        | LC_ALL=C sort | uniq -c | LC_ALL=C sort -rn | head -30 \
        | awk '{printf "  %-6s %s\n", $1, $2}'
    echo ""

    echo "Per top-level directory:"
    echo ""
    while IFS= read -r d; do
        [ -z "$d" ] && continue
        [ -d "$d" ] || continue
        name=$(basename "$d")
        count=$(grep -c "^${d}/" "$TMP_LIST" || true)
        printf "  %-30s %s files\n" "$name" "$count"
    done < "$TOP_DIRS_FILE"
    echo ""

    # ---------- 4. DATABASE SCHEMA ----------
    cat <<'SECTION'

================================================================================
4. DATABASE SCHEMA (PostgreSQL)
================================================================================

SECTION

    DB_UP=0
    if command -v docker >/dev/null 2>&1; then
        if docker info >/dev/null 2>&1 </dev/null; then
            if docker compose ps postgres 2>/dev/null </dev/null | grep -q "Up"; then
                DB_UP=1
            fi
        fi
    fi

    if [ "$DB_UP" = "1" ]; then
        echo "✅ Database is running. Fetching schema..."
        echo ""

        echo "--- TABLES ---"
        echo ""
        docker compose exec -T postgres psql -U ticketvolt -d ticketvolt -c "\dt" </dev/null 2>/dev/null

        echo ""
        echo "--- COLUMN DETAILS ---"
        echo ""

        TABLES=$(docker compose exec -T postgres psql -U ticketvolt -d ticketvolt -t -c \
            "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" </dev/null 2>/dev/null \
            | tr -d ' ' | grep -v '^$')

        while IFS= read -r table; do
            [ -z "$table" ] && continue
            echo ""
            echo "========== TABLE: $table =========="
            echo ""
            docker compose exec -T postgres psql -U ticketvolt -d ticketvolt -c "\d $table" </dev/null 2>/dev/null
            ROW_COUNT=$(docker compose exec -T postgres psql -U ticketvolt -d ticketvolt -t -c "SELECT COUNT(*) FROM $table;" </dev/null 2>/dev/null | tr -d ' ')
            echo "Row count: ${ROW_COUNT:-0}"
            echo ""
        done <<< "$TABLES"

        echo ""
        echo "--- FOREIGN KEY RELATIONSHIPS ---"
        echo ""
        docker compose exec -T postgres psql -U ticketvolt -d ticketvolt -c "
        SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public'
        ORDER BY tc.table_name;" </dev/null 2>/dev/null

        echo ""
        echo "--- INDEXES ---"
        echo ""
        docker compose exec -T postgres psql -U ticketvolt -d ticketvolt -c "
        SELECT tablename, indexname FROM pg_indexes WHERE schemaname='public' ORDER BY tablename, indexname;" </dev/null 2>/dev/null

        echo ""
        echo "--- DATABASE SIZE ---"
        echo ""
        docker compose exec -T postgres psql -U ticketvolt -d ticketvolt -c "
        SELECT pg_size_pretty(pg_database_size(current_database())) AS size;" </dev/null 2>/dev/null
    else
        echo "⚠️ Database not running (or docker unavailable). Skipping DB section."
    fi
    echo ""

    # ---------- 5. FULL SOURCE DUMP ----------
    cat <<'SECTION'

================================================================================
5. FULL SOURCE DUMP
================================================================================

Each file begins with:
    @@@FILE@@@ <relative/path>

If a file cannot be read within the per-file timeout, its contents are
replaced with a "[file read timed out]" placeholder and the dump continues.
Files that time out are recorded in .dump_poison_files and skipped on
subsequent runs. Delete that file to force a retry of all files.

SECTION

    # ----- 5.0 Root files -----
    if [ -s "$ROOT_FILES_FILE" ]; then
        echo ""
        echo "################################################################################"
        echo "# ROOT-LEVEL FILES"
        echo "################################################################################"
        echo ""
        ROOT_CONTENTS="$(cat "$ROOT_FILES_FILE")"
        while IFS= read -r f; do
            [ -z "$f" ] && continue
            CURRENT=$((CURRENT + 1))
            render_progress "${f#$PROJECT_ROOT/}"
            dump_file_to_stdout "$f" "Root-level file"
        done <<< "$ROOT_CONTENTS"
    fi

    # ----- 5.x Each top-level dir -----
    TOP_DIRS_CONTENTS="$(cat "$TOP_DIRS_FILE")"
    while IFS= read -r dir; do
        [ -z "$dir" ] && continue
        [ -d "$dir" ] || continue
        dir_name=$(basename "$dir")

        echo ""
        echo "################################################################################"
        echo "# DIRECTORY: $dir_name/"
        echo "################################################################################"
        echo ""

        DIR_CONTENTS=$(grep "^${dir}/" "$TMP_LIST" || true)
        DIR_COUNT=$(printf '%s\n' "$DIR_CONTENTS" | grep -c . || true)

        if [ "$DIR_COUNT" -eq 0 ]; then
            echo "(no source files found in $dir_name/)"
            continue
        fi

        echo "Files in $dir_name/: $DIR_COUNT"
        echo ""

        while IFS= read -r f; do
            [ -z "$f" ] && continue
            CURRENT=$((CURRENT + 1))
            render_progress "${f#$PROJECT_ROOT/}"
            dump_file_to_stdout "$f" "Source file under $dir_name/"
        done <<< "$DIR_CONTENTS"
    done <<< "$TOP_DIRS_CONTENTS"

    # ---------- 6. MIGRATIONS LISTING ----------
    cat <<'SECTION'

================================================================================
6. MIGRATIONS (listing only — contents omitted)
================================================================================

SECTION

    find "$PROJECT_ROOT" \
        $PRUNE_EXPR -o \
        -type f -path "*/migrations/*.py" -not -name "__init__.py" -print 2>/dev/null </dev/null \
        | sed "s|$PROJECT_ROOT|.|g" \
        | LC_ALL=C sort
    echo ""

    # ---------- 7. END ----------
    cat <<FOOTER

================================================================================
7. END OF DUMP
================================================================================

Generated:     $(date)
Project:       $PROJECT_NAME
Project root:  $PROJECT_ROOT
Output file:   $OUTPUT_FILE
Total files:   $TOTAL_FILES
Scan time:     ${SCAN_SECS}s
Per-file TO:   ${PER_FILE_TIMEOUT}s

================================================================================
FOOTER

} > "$OUTPUT_FILE"

# ============================================================
# FINISH
# ============================================================
END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))

# ---------- Robust marker counting via set intersection ----------
EXPECTED_TMP=$(mktemp -t dump_expected.XXXXXX)
ACTUAL_TMP=$(mktemp -t dump_actual.XXXXXX)
MISSING_TMP=$(mktemp -t dump_missing.XXXXXX)
trap 'rm -f "$TMP_LIST" "$TOP_DIRS_FILE" "$ROOT_FILES_FILE" "$EXPECTED_TMP" "$ACTUAL_TMP" "$MISSING_TMP"' EXIT

sed "s|^${PROJECT_ROOT}/||" "$TMP_LIST" | LC_ALL=C sort -u > "$EXPECTED_TMP"

grep "^${FILE_MARKER} " "$OUTPUT_FILE" 2>/dev/null \
    | sed "s|^${FILE_MARKER} ||" \
    | LC_ALL=C sort -u > "$ACTUAL_TMP"

TOTAL_MARKERS=$(LC_ALL=C comm -12 "$EXPECTED_TMP" "$ACTUAL_TMP" | wc -l | xargs)

LC_ALL=C comm -23 "$EXPECTED_TMP" "$ACTUAL_TMP" > "$MISSING_TMP"
MISSING_COUNT=$(grep -c . "$MISSING_TMP" || true)

FRONTEND_COUNT=$(grep -c '^frontend/' "$ACTUAL_TMP" || true)
BACKEND_COUNT=$(grep -c '^backend/' "$ACTUAL_TMP" || true)
SCANNER_COUNT=$(grep -c '^QRScannerApp/' "$ACTUAL_TMP" || true)
BAILEYS_COUNT=$(grep -c '^baileys-gateway/' "$ACTUAL_TMP" || true)
ENV_LEAKS=$(grep -cE '(^|/)\.env(\.|$)' "$ACTUAL_TMP" || true)
CELERY_LEAKS=$(grep -cE '(^|/)celerybeat-schedule$' "$ACTUAL_TMP" || true)
SESSION_LEAKS=$(grep -cE '(^|/)sessions/' "$ACTUAL_TMP" || true)
TIMEOUT_COUNT=$(safe_grep_count "timed out" "$OUTPUT_FILE")

TOPLEVEL_BUCKETS_FILE="$(mktemp -t dump_buckets.XXXXXX)"
grep "^${FILE_MARKER} " "$OUTPUT_FILE" 2>/dev/null \
    | sed -E "s|^${FILE_MARKER} ([^/]+)/.*|\1/|; s|^${FILE_MARKER} ([^/]+)$|\1|" \
    | LC_ALL=C sort | uniq -c | LC_ALL=C sort -rn > "$TOPLEVEL_BUCKETS_FILE"

echo "" >&2
echo "" >&2
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅  DUMP COMPLETE                                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}📄 Output file:${NC}  $OUTPUT_FILE"
echo -e "${CYAN}📁 Full path:${NC}    $(pwd)/$OUTPUT_FILE"
echo ""
echo -e "${BLUE}📊 Statistics:${NC}"
echo -e "   • Files expected:  ${BOLD}${TOTAL_FILES}${NC}"
echo -e "   • Files dumped:    ${BOLD}${TOTAL_MARKERS}${NC}"
echo -e "   • Timed-out files: ${BOLD}${TIMEOUT_COUNT}${NC}"
echo -e "   • Scan time:       ${BOLD}${SCAN_SECS}s${NC}"
echo -e "   • Dump time:       ${BOLD}${ELAPSED}s${NC}"
echo -e "   • File size:       ${BOLD}$(du -h "$OUTPUT_FILE" | cut -f1)${NC}"
echo ""
echo -e "${YELLOW}🔍 Sanity check:${NC}"
echo -e "   • frontend/ files:        ${BOLD}${FRONTEND_COUNT}${NC}"
echo -e "   • backend/ files:         ${BOLD}${BACKEND_COUNT}${NC}"
echo -e "   • QRScannerApp/ files:    ${BOLD}${SCANNER_COUNT}${NC}"
echo -e "   • baileys-gateway/ files: ${BOLD}${BAILEYS_COUNT}${NC} (expected: >0)"
echo -e "   • .env leaks:             ${BOLD}${ENV_LEAKS}${NC} (expected: 0)"
echo -e "   • sessions/ leaks:        ${BOLD}${SESSION_LEAKS}${NC} (expected: 0)"
echo -e "   • celerybeat-schedule:    ${BOLD}${CELERY_LEAKS}${NC} (expected: 0)"
echo ""
echo -e "${YELLOW}📂 Top-level buckets (from output markers):${NC}"
awk '{printf "   • %-30s %s files\n", $2, $1}' "$TOPLEVEL_BUCKETS_FILE"
echo ""

if [ "$MISSING_COUNT" -gt 0 ]; then
    echo -e "${RED}⚠️  MISSING ${MISSING_COUNT} file(s) from the dump. First 20:${NC}"
    head -20 "$MISSING_TMP" | sed 's/^/      /'
    if [ "$MISSING_COUNT" -gt 20 ]; then
        echo -e "${RED}      ...and $((MISSING_COUNT - 20)) more.${NC}"
    fi
else
    echo -e "${GREEN}✅ All ${TOTAL_FILES} files dumped successfully.${NC}"
fi

if [ -s "$POISON_FILE" ]; then
    POISON_COUNT_NOW=$(grep -c . "$POISON_FILE" || true)
    if [ "$POISON_COUNT_NOW" -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}⚠️  ${POISON_COUNT_NOW} poison file(s) recorded in ${POISON_FILE}:${NC}"
        head -10 "$POISON_FILE" | sed 's/^/      /'
        if [ "$POISON_COUNT_NOW" -gt 10 ]; then
            echo -e "${YELLOW}      ...and $((POISON_COUNT_NOW - 10)) more.${NC}"
        fi
        echo -e "${DIM}    These will be skipped instantly on the next run.${NC}"
        echo -e "${DIM}    Delete .dump_poison_files to retry them.${NC}"
    fi
fi

rm -f "$TOPLEVEL_BUCKETS_FILE"

echo ""
echo -e "${GREEN}✅ Ready to upload for analysis.${NC}"
echo ""