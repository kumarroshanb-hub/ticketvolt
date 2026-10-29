#!/bin/bash
# ============================================================
# TicketVolt — Complete Codebase Dump (v5.2 — progress + timing fixes)
# ------------------------------------------------------------
# New in v5.2 over v5.1:
#   1. ✅ FIX: progress bar start-time is now passed explicitly to
#      render_progress instead of relying on the global START_TS.
#      Split dumps no longer report inflated elapsed times.
#   2. ✅ FIX: every progress bar is terminated with a real \n,
#      so frames no longer appear frozen at an old percentage.
#   3. ✅ NEW: combined-pass summary line printed after the dump
#      block ("✅ Combined pass: N files in Ns"), overwriting
#      the stale mid-run frame.
#   4. ✅ NEW: progress bar only redraws every Nth file (default 5)
#      to reduce terminal churn on 300+ file runs. Configure with
#      PROGRESS_EVERY=N.
#   5. ✅ NEW: lists the files that timed out (from .dump_poison_files)
#      at the end of the run, so you can inspect them.
#
# New in v5.1 over v5:
#   - bash 3.2 compatible (no `declare -A`)
#   - fixed `paste -sd,` banner crash
#   - .github/.gitlab/.circleci/.husky now dumped
#   - stale `.dump_leak_report_*` excluded
#   - tree exclusion anchored on `.git$`
#   - one split failure no longer aborts the whole run
#
# New in v5 over v4:
#   - per-folder / per-file split dumps
#   - --no-split, --split-dirs, --split-targets
#   - per-split leak scan (removes only the bad split)
#   - strict mode: combined leak removes all splits
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
PER_FILE_TIMEOUT="${PER_FILE_TIMEOUT:-20}"
MAX_FILE_BYTES="${MAX_FILE_BYTES:-5242880}"
MIN_TIMEOUT=8
MAX_TIMEOUT=60
PROGRESS_EVERY="${PROGRESS_EVERY:-5}"   # redraw progress every N files

# ---------- Split output config ----------
SPLIT_DIRS="${SPLIT_DIRS:-frontend,backend,QRScannerApp,baileys-gateway}"

SPLIT_TARGETS="${SPLIT_TARGETS:-}"
if [ -z "$SPLIT_TARGETS" ]; then
    SPLIT_TARGETS="dir:frontend,dir:backend,dir:QRScannerApp,dir:baileys-gateway"
    SPLIT_TARGETS+=",dir:shared,dir:sample_configs"
    SPLIT_TARGETS+=",file:package-lock.json"
    SPLIT_TARGETS+=",file:docker-compose.yml"
    SPLIT_TARGETS+=",file:docker-compose.prod.yml"
    SPLIT_TARGETS+=",file:README.md"
    SPLIT_TARGETS+=",file:DEPLOYMENT.md"
fi

# Optional expected-count map for per-split verification.
# bash 3.2 has no associative arrays, so this is a plain string:
#   "label|count;label|count;..."
EXPECTED_COUNTS_STR="${EXPECTED_COUNTS_STR:-}"
if [ -z "$EXPECTED_COUNTS_STR" ]; then
    EXPECTED_COUNTS_STR="frontend|148;backend|106;QRScannerApp|46;baileys-gateway|10;"
    EXPECTED_COUNTS_STR+="shared|7;sample_configs|1;"
    EXPECTED_COUNTS_STR+="package-lock.json|1;docker-compose.yml|1;docker-compose.prod.yml|1;"
    EXPECTED_COUNTS_STR+="README.md|1;DEPLOYMENT.md|1"
fi

expected_count_for() {
    local needle="$1" entry
    local _ifs="$IFS"
    IFS=';'
    for entry in $EXPECTED_COUNTS_STR; do
        [ -z "$entry" ] && continue
        local k="${entry%%|*}"
        local v="${entry##*|}"
        if [ "$k" = "$needle" ]; then
            IFS="$_ifs"
            printf '%s' "$v"
            return 0
        fi
    done
    IFS="$_ifs"
    return 1
}

SKIP_SPLIT=0
SCAN_SPLITS=1
STRICT_SPLIT_CLEANUP=1

# ---------- Args ----------
SKIP_LEAK_SCAN=0
INCLUDE_BUILD=0
ONLY_LEAK_REPORT=0
args=("$@")
i=0
while [ $i -lt ${#args[@]} ]; do
    arg="${args[$i]}"
    case "$arg" in
        --skip-leak-scan)      SKIP_LEAK_SCAN=1 ;;
        --include-build)       INCLUDE_BUILD=1 ;;
        --only-leak-report)    ONLY_LEAK_REPORT=1 ;;
        --no-split)            SKIP_SPLIT=1 ;;
        --scan-splits)         SCAN_SPLITS=1 ;;
        --no-scan-splits)      SCAN_SPLITS=0 ;;
        --no-strict-split)     STRICT_SPLIT_CLEANUP=0 ;;
        --split-dirs)
            i=$((i+1))
            if [ $i -lt ${#args[@]} ]; then
                SPLIT_DIRS="${args[$i]}"
                SPLIT_TARGETS=""
            fi
            ;;
        --split-targets)
            i=$((i+1))
            if [ $i -lt ${#args[@]} ]; then
                SPLIT_TARGETS="${args[$i]}"
            fi
            ;;
        --help|-h)
            cat <<EOF
Usage: $0 [PROJECT_ROOT] [options]

Options:
  --skip-leak-scan         Skip the leak scan entirely (still writes report)
  --include-build          Include build/ and .cxx/ (NOT recommended)
  --only-leak-report       Just re-scan the existing dump and print the report
  --no-split               Skip all per-folder/per-file split dumps
  --scan-splits            Leak-scan each split file independently (default)
  --no-scan-splits         Skip per-split leak scan (combined scan still runs)
  --no-strict-split        Keep split files even if combined dump leaks
  --split-dirs "a,b,c"     Legacy: also dump these top-level dirs individually
  --split-targets "..."    Rich: comma-separated list of
                             dir:<name>
                             file:<relpath>
                             group:<label>:<a,b,c>
                           (default: legacy four dirs + shared, sample_configs,
                            + five root files individually)
  -h, --help               Show this help

Environment:
  PER_FILE_TIMEOUT         Baseline timeout in seconds (default: 20)
  MAX_FILE_BYTES           Skip redaction above this size (default: 5 MB)
  PROGRESS_EVERY           Redraw progress bar every N files (default: 5)
  SPLIT_TARGETS            Same as --split-targets
  SPLIT_DIRS               Same as --split-dirs
  EXPECTED_COUNTS_STR      "label|count;label|count;..." for verification
EOF
            exit 0
            ;;
    esac
    i=$((i+1))
done

# Translate legacy SPLIT_DIRS -> SPLIT_TARGETS if needed.
if [ -z "$SPLIT_TARGETS" ] && [ -n "$SPLIT_DIRS" ]; then
    _acc=""
    IFS=',' read -ra _dirs <<< "$SPLIT_DIRS"
    for _d in "${_dirs[@]}"; do
        _d="${_d// /}"
        [ -z "$_d" ] && continue
        _acc+="dir:${_d},"
    done
    SPLIT_TARGETS="${_acc%,}"
fi

# ---------- Output file ----------
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="complete_codebase_dump_${TIMESTAMP}.txt"
FILE_MARKER='@@@FILE@@@'

# ---------- Sentinel files ----------
POISON_FILE=".dump_poison_files"
LEAK_REPORT=".dump_leak_report"
touch "$POISON_FILE" 2>/dev/null || true

# ---------- Exclusions ----------
EXCLUDE_DIR_RE='(^|/)(node_modules|__pycache__|\.git|\.git-projects-old|\.expo|\.expo-shared|build|dist|out|coverage|sessions|logs|media|staticfiles|\.metro|\.gradle|\.kotlin|\.cache|\.vscode|\.idea|\.npm|\.yarn|venv|env|\.venv|\.tox|\.mypy_cache|\.pytest_cache|Pods|\.next|\.nuxt|\.turbo|\.parcel-cache|\.serverless|\.terraform|\.husky|_build|target|vendor|\.cxx|cmake|intermediates|derived|\.android|\.gradle-cache|\.rustup|\.cargo)(/|$)'

EXCLUDE_FILE_RE='\.(pyc|pyo|so|dylib|dll|exe|o|obj|a|lib|class|jar|apk|aab|ipa|log|lock|map|min\.js|min\.css|png|jpg|jpeg|gif|ico|bmp|webp|tiff|pdf|zip|tar|gz|bz2|xz|7z|rar|db|sqlite|sqlite3|woff|woff2|ttf|otf|eot|mp3|mp4|mov|avi|webm|DS_Store|bak|swp|swo|ninja|ninja_log|ninja_deps|check_cache|verify_globs)$'

EXCLUDE_NAME_RE='(\.DS_Store|Thumbs\.db|celerybeat-schedule|\.dump_poison_files|\.dump_leak_report.*|complete_codebase_dump_.*\.txt|CMakeCache\.txt|CMakeFiles|\.cmake|build\.ninja|rules\.ninja|compile_commands\.json|\.ninja_deps|\.ninja_log|cmake\.check_cache|cmake\.verify_globs)$'

EXCLUDE_ENV_RE='(^|/)\.env(\..*)?$'

if [ "$INCLUDE_BUILD" = "1" ]; then
    EXCLUDE_DIR_RE='(^|/)(node_modules|__pycache__|\.git|\.git-projects-old|\.expo|\.expo-shared|sessions|logs|media|staticfiles|\.metro|\.vscode|\.idea|\.npm|\.yarn|venv|env|\.venv|\.tox|\.mypy_cache|\.pytest_cache|Pods|\.next|\.nuxt|\.turbo|\.parcel-cache|\.serverless|\.terraform|\.husky|target|vendor)(/|$)'
fi

# ---------- Secrets to redact ----------
SECRETS_KEYS_RE='SECRET_KEY|PASSWORD|ADMIN_TOKEN|API_KEY|DJANGO_SUPERUSER_PASSWORD|POSTGRES_PASSWORD|JWT_SECRET|JWT_SIGNING_KEY|AWS_SECRET|PRIVATE_KEY|ACCESS_TOKEN|REFRESH_TOKEN|BOT_PASSWORD'

REDACT_SED_DQ="s/^([[:space:]]*(export[[:space:]]+)?(${SECRETS_KEYS_RE})[A-Z0-9_]*[[:space:]]*)=[[:space:]]*\"[^\"]*\"/\\1= \"[REDACTED]\"/g"
REDACT_SED_SQ="s/^([[:space:]]*(export[[:space:]]+)?(${SECRETS_KEYS_RE})[A-Z0-9_]*[[:space:]]*)=[[:space:]]*'[^']*'/\\1= '[REDACTED]'/g"

# ---------- find -prune expression ----------
PRUNE_EXPR='-type d ( -name node_modules -o -name __pycache__ -o -name .git -o -name .git-projects-old -o -name .expo -o -name .expo-shared -o -name build -o -name dist -o -name out -o -name coverage -o -name sessions -o -name logs -o -name media -o -name staticfiles -o -name .metro -o -name .gradle -o -name .kotlin -o -name .cache -o -name .vscode -o -name .idea -o -name .npm -o -name .yarn -o -name venv -o -name env -o -name .venv -o -name .tox -o -name .mypy_cache -o -name .pytest_cache -o -name Pods -o -name .next -o -name .nuxt -o -name .turbo -o -name .parcel-cache -o -name .serverless -o -name .terraform -o -name .husky -o -name _build -o -name target -o -name vendor -o -name .cxx -o -name cmake -o -name intermediates -o -name derived -o -name .android ) -prune'

if [ "$INCLUDE_BUILD" = "1" ]; then
    PRUNE_EXPR='-type d ( -name node_modules -o -name __pycache__ -o -name .git -o -name .git-projects-old -o -name .expo -o -name .expo-shared -o -name sessions -o -name logs -o -name media -o -name staticfiles -o -name .metro -o -name .vscode -o -name .idea -o -name .npm -o -name .yarn -o -name venv -o -name env -o -name .venv -o -name .tox -o -name .mypy_cache -o -name .pytest_cache -o -name Pods -o -name .next -o -name .nuxt -o -name .turbo -o -name .parcel-cache -o -name .serverless -o -name .terraform -o -name .husky -o -name target -o -name vendor ) -prune'
fi

# ---------- Banner ----------
if [ "$ONLY_LEAK_REPORT" = "0" ]; then
    clear 2>/dev/null || true
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   📦  TicketVolt — Complete Codebase Dump (v5.2)            ║${NC}"
    echo -e "${BLUE}║       per-folder / per-file split dumps                      ║${NC}"
    echo -e "${BLUE}║       progress + timing fixes                                ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
fi

# ---------- Locate project root ----------
PROJECT_ROOT=""
for arg in "$@"; do
    if [ -d "$arg" ]; then
        PROJECT_ROOT="$arg"
        break
    fi
done

if [ -n "$PROJECT_ROOT" ]; then
    cd "$PROJECT_ROOT" </dev/null || { echo -e "${RED}❌ Cannot cd into $PROJECT_ROOT${NC}"; exit 1; }
fi

PROJECT_ROOT="$(pwd)"
PROJECT_NAME="$(basename "$PROJECT_ROOT")"

# ---------- --only-leak-report mode ----------
if [ "$ONLY_LEAK_REPORT" = "1" ]; then
    LATEST_DUMP=$(ls -t complete_codebase_dump_*.txt 2>/dev/null | head -1)
    if [ -z "$LATEST_DUMP" ]; then
        echo -e "${RED}❌ No existing dump found in $PROJECT_ROOT${NC}"
        exit 1
    fi
    echo -e "${CYAN}Re-scanning:${NC} $LATEST_DUMP"
    echo -e "${YELLOW}Re-scan not yet implemented; use --skip-leak-scan on a fresh run.${NC}"
    exit 0
fi

echo -e "${CYAN}Project root:${NC} $PROJECT_ROOT"
echo -e "${CYAN}Output file:${NC}  $OUTPUT_FILE"
echo -e "${CYAN}Leak scan:${NC}    $([ "$SKIP_LEAK_SCAN" = "1" ] && echo "SKIPPED (--skip-leak-scan)" || echo "ENABLED")"
echo -e "${CYAN}Build dirs:${NC}   $([ "$INCLUDE_BUILD" = "1" ] && echo "INCLUDED (--include-build)" || echo "EXCLUDED")"
echo -e "${CYAN}Split dumps:${NC}  $([ "$SKIP_SPLIT" = "1" ] && echo "SKIPPED (--no-split)" || echo "ENABLED")"
if [ "$SKIP_SPLIT" = "0" ]; then
    echo -e "${CYAN}Split scan:${NC}   $([ "$SCAN_SPLITS" = "1" ] && echo "per-file" || echo "combined-only")"
    echo -e "${CYAN}Split targets:${NC}"
    printf '%s' "$SPLIT_TARGETS" \
        | sed -E 's/,(dir:|file:|group:)/\n\1/g' \
        | sed 's/^/                  • /'
    echo ""
fi

if command -v gtimeout >/dev/null 2>&1; then
    HAS_GTIMEOUT=1
    echo -e "${CYAN}Timeout bin:${NC}  gtimeout (fast)"
else
    HAS_GTIMEOUT=0
    echo -e "${CYAN}Timeout bin:${NC}  built-in poll wrapper"
    echo -e "${DIM}               brew install coreutils  (for faster timeouts)${NC}"
fi

POISON_COUNT=0
if [ -s "$POISON_FILE" ]; then
    POISON_COUNT=$(grep -c . "$POISON_FILE" || true)
fi
if [ "$POISON_COUNT" -gt 0 ]; then
    echo -e "${CYAN}Poison files:${NC} ${POISON_COUNT} (skipped; rm .dump_poison_files to retry)"
fi
echo ""

# ============================================================
# HELPERS
# ============================================================
count_matches() {
    local pattern="$1" file="$2"
    local n
    n=$(grep -c "$pattern" "$file" 2>/dev/null) || n=0
    printf '%s' "$n"
}

run_read_timeout() {
    local secs="$1"; shift
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

adaptive_timeout() {
    local file="$1"
    local size_kb
    size_kb=$(du -k "$file" 2>/dev/null | cut -f1)
    size_kb=${size_kb:-1}
    local extra=$((size_kb / 100))
    local t=$((MIN_TIMEOUT + extra))
    [ "$t" -gt "$MAX_TIMEOUT" ] && t=$MAX_TIMEOUT
    echo "$t"
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

    local size_bytes
    size_bytes=$(wc -c < "$file_path" 2>/dev/null | xargs)
    size_bytes=${size_bytes:-0}

    if [ "$size_bytes" -gt "$MAX_FILE_BYTES" ]; then
        cat "$file_path"
        return 0
    fi

    local t
    t=$(adaptive_timeout "$file_path")

    run_read_timeout "$t" \
        sed -E -e "$REDACT_SED_DQ" -e "$REDACT_SED_SQ" "$file_path"
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

# v5.2: render_progress now takes start_ts as an explicit second arg.
# Falls back to $START_TS if omitted (for backward compat with any
# remaining call sites). Only redraws every PROGRESS_EVERY files
# (except the final one) to cut terminal churn.
render_progress() {
    local rel_path="$1"
    local start_ts="${2:-${START_TS:-$(date +%s)}}"
    local total="${PROGRESS_TOTAL:-$TOTAL_FILES}"
    [ "$total" -le 0 ] && total=1

    # Throttle redraws; always render the final frame.
    if [ "$CURRENT" -lt "$total" ] && [ "$PROGRESS_EVERY" -gt 1 ]; then
        if [ $((CURRENT % PROGRESS_EVERY)) -ne 0 ]; then
            return 0
        fi
    fi

    local pct=$((CURRENT * 100 / total))
    local now elapsed eta
    now=$(date +%s)
    elapsed=$((now - start_ts))
    [ "$elapsed" -lt 0 ] && elapsed=0

    if [ "$CURRENT" -gt 0 ] && [ "$elapsed" -gt 0 ]; then
        local remaining=$((total - CURRENT))
        eta=$((elapsed * remaining / CURRENT))
    else
        eta=0
    fi

    local bar_width=30
    local filled=$((pct * bar_width / 100))
    local empty=$((bar_width - filled))
    local bar="" i
    for ((i=0; i<filled; i++)); do bar+="█"; done
    for ((i=0; i<empty;  i++)); do bar+="░"; done

    if [ ${#rel_path} -gt 60 ]; then
        rel_path="...${rel_path: -57}"
    fi

    printf "\r${CYAN}[%3d/%3d]${NC} ${GREEN}[%s]${NC} %3d%% ${YELLOW}(%ds, ETA %ds)${NC}  ${DIM}%s${NC}\033[K" \
        "$CURRENT" "$total" "$bar" "$pct" "$elapsed" "$eta" "$rel_path" >&2
}

emit_files_section() {
    local title="$1" desc_prefix="$2" f
    if [ -n "$title" ]; then
        echo ""
        echo "################################################################################"
        echo "# $title"
        echo "################################################################################"
        echo ""
    fi
    while IFS= read -r f; do
        [ -z "$f" ] && continue
        CURRENT=$((CURRENT + 1))
        render_progress "${f#$PROJECT_ROOT/}" "$START_TS"
        dump_file_to_stdout "$f" "$desc_prefix"
    done
}

# ============================================================
# LEAK SCAN
# ============================================================
scan_for_leaks() {
    local dump_file="$1"
    local findings=0

    : > "$LEAK_REPORT"

    local prefix_re='(tid_[A-Za-z0-9]{8,}|tsec_[A-Za-z0-9]{8,}|re_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|sk_live_[A-Za-z0-9]{20,}|sk_test_[A-Za-z0-9]{20,}|pk_live_[A-Za-z0-9]{20,}|pk_test_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[bps]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})'

    local prefix_hits
    prefix_hits=$(grep -nE "$prefix_re" "$dump_file" 2>/dev/null || true)
    if [ -n "$prefix_hits" ]; then
        {
            echo "================================================================"
            echo "LEAK: known API key prefixes found in dump"
            echo "================================================================"
            echo "$prefix_hits" | head -50
            echo ""
        } >> "$LEAK_REPORT"
        findings=$((findings + $(printf '%s\n' "$prefix_hits" | grep -c .)))
    fi

    local entropy_hits
    entropy_hits=$(awk '
        {
            line = $0

            if (line ~ /^@@@FILE@@@ /)   next
            if (line ~ /^LOCATION: /)    next
            if (line ~ /^DESCRIPTION: /) next
            if (line ~ /^SIZE: /)        next
            if (line ~ /^LINES: /)       next

            if (line ~ /^\/Users\//)     next
            if (line ~ /^\/home\//)      next
            if (line ~ /^\/tmp\//)       next
            if (line ~ /^[A-Z]:\\/)      next
            if (line ~ /^\.\.?\//)       next
            if (line ~ /CMakeCache/)     next
            if (line ~ /CMakeFiles/)     next
            if (line ~ /cmake\/api/)     next
            if (line ~ /\.cxx\//)        next
            if (line ~ /Library\/Android/) next
            if (line ~ /node_modules\//) next
            if (line ~ /\.gradle\//)     next
            if (line ~ /ndk\//)          next

            gsub(/\[REDACTED\]/, "", line)

            n = split(line, tokens, /[ \t]+/)
            for (i = 1; i <= n; i++) {
                t = tokens[i]

                gsub(/^["'\''`\(\)\[\]\{\}<>;,]+/, "", t)
                gsub(/["'\''`\(\)\[\]\{\}<>;,]+$/, "", t)

                L = length(t)
                if (L < 32) continue

                if (t ~ /^iVBOR/)  continue
                if (t ~ /^\/9j\//) continue
                if (t ~ /^R0lGOD/) continue
                if (t ~ /^sha(1|256|384|512)-/) continue

                if (t !~ /^[A-Za-z0-9+\/=_.\-]+$/) continue
                if (t ~ /[\/\.]/) continue
                if (t ~ /cmake|android|ndk|gradle|node_modules/) continue

                has_digit = (t ~ /[0-9]/)
                has_upper = (t ~ /[A-Z]/)
                has_lower = (t ~ /[a-z]/)
                if (!(has_digit && has_upper && has_lower)) continue

                if (L == 32 && t ~ /^[0-9a-fA-F]+$/) continue
                if (L == 40 && t ~ /^[0-9a-fA-F]+$/) continue
                if (L == 64 && t ~ /^[0-9a-fA-F]+$/) continue

                print FILENAME ":" NR ": " substr(t, 1, 120)
            }
        }
    ' "$dump_file" 2>/dev/null || true)

    if [ -n "$entropy_hits" ]; then
        {
            echo "================================================================"
            echo "LEAK: high-entropy strings found in dump (first 50)"
            echo "================================================================"
            echo "$entropy_hits" | head -50
            echo ""
        } >> "$LEAK_REPORT"
        findings=$((findings + $(printf '%s\n' "$entropy_hits" | grep -c .)))
    fi

    echo "$findings"
}

# ============================================================
# PREPARE TEMP FILES
# ============================================================
TMP_LIST="$(mktemp -t dump_filelist.XXXXXX)"
TOP_DIRS_FILE="$(mktemp -t dump_topdirs.XXXXXX)"
ROOT_FILES_FILE="$(mktemp -t dump_rootfiles.XXXXXX)"
EXPECTED_TMP="$(mktemp -t dump_expected.XXXXXX)"
ACTUAL_TMP="$(mktemp -t dump_actual.XXXXXX)"
MISSING_TMP="$(mktemp -t dump_missing.XXXXXX)"
TOPLEVEL_BUCKETS_FILE="$(mktemp -t dump_buckets.XXXXXX)"
TMP_OUTPUT="$(mktemp -t dump_output.XXXXXX)"

cleanup() {
    rm -f "$TMP_LIST" "$TOP_DIRS_FILE" "$ROOT_FILES_FILE" \
          "$EXPECTED_TMP" "$ACTUAL_TMP" "$MISSING_TMP" \
          "$TOPLEVEL_BUCKETS_FILE" "$TMP_OUTPUT"
}
trap cleanup EXIT

# ============================================================
# BUILD FILE LIST
# ============================================================
echo -e "${YELLOW}🔍 Scanning project for source files...${NC}"
SCAN_START=$(date +%s)

: > "$TMP_LIST"
while IFS= read -r -d '' p; do
    [ -L "$p" ] && continue
    [ -f "$p" ] || continue
    [ "$p" = "$PROJECT_ROOT/$OUTPUT_FILE" ] && continue
    [ "$p" = "$PROJECT_ROOT/$POISON_FILE" ] && continue
    [ "$p" = "$PROJECT_ROOT/$LEAK_REPORT" ] && continue
    echo "$p" | grep -Eq "$EXCLUDE_FILE_RE" && continue
    echo "$p" | grep -Eq "$EXCLUDE_NAME_RE" && continue
    echo "$p" | grep -Eq "$EXCLUDE_ENV_RE"  && continue
    printf '%s\n' "$p"
done < <(find "$PROJECT_ROOT" $PRUNE_EXPR -o -type f -print0 2>/dev/null </dev/null) \
    | LC_ALL=C sort > "$TMP_LIST"

SCAN_END=$(date +%s)
SCAN_SECS=$((SCAN_END - SCAN_START))

TOTAL_FILES=$(wc -l < "$TMP_LIST" | xargs)

if [ "$TOTAL_FILES" -eq 0 ]; then
    echo -e "${RED}❌ No source files found. Check your project root.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Found ${BOLD}${TOTAL_FILES}${NC}${GREEN} source files (scan took ${SCAN_SECS}s)${NC}"
echo ""

# ============================================================
# TOP-LEVEL DIRS + ROOT FILES
# (v5.1: allowlist CI dotfolders; other dotdirs stay excluded)
# ============================================================
find "$PROJECT_ROOT" -mindepth 1 -maxdepth 1 -type d \
    \( -name ".github" -o -name ".gitlab" -o -name ".circleci" -o -name ".husky" -o -not -name ".*" \) \
    2>/dev/null </dev/null \
    | grep -Ev "$EXCLUDE_DIR_RE" \
    | LC_ALL=C sort > "$TOP_DIRS_FILE"

: > "$ROOT_FILES_FILE"
while IFS= read -r -d '' p; do
    [ -L "$p" ] && continue
    [ -f "$p" ] || continue
    [ "$p" = "$PROJECT_ROOT/$OUTPUT_FILE" ] && continue
    [ "$p" = "$PROJECT_ROOT/$POISON_FILE" ] && continue
    [ "$p" = "$PROJECT_ROOT/$LEAK_REPORT" ] && continue
    echo "$p" | grep -Eq "$EXCLUDE_FILE_RE" && continue
    echo "$p" | grep -Eq "$EXCLUDE_NAME_RE" && continue
    echo "$p" | grep -Eq "$EXCLUDE_ENV_RE"  && continue
    printf '%s\n' "$p"
done < <(find "$PROJECT_ROOT" -mindepth 1 -maxdepth 1 -type f -print0 2>/dev/null </dev/null) \
    | LC_ALL=C sort > "$ROOT_FILES_FILE"

# ============================================================
# PROGRESS STATE
# ============================================================
CURRENT=0
START_TS=$(date +%s)
PROGRESS_TOTAL="$TOTAL_FILES"

# ============================================================
# BEGIN DUMP (atomic)
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
Per-file TO:   adaptive (${MIN_TIMEOUT}-${MAX_TIMEOUT}s, scale by size)
Redaction:     v4 (line-anchored, JSON-safe)
Leak scan:     $([ "$SKIP_LEAK_SCAN" = "1" ] && echo "SKIPPED" || echo "enabled (path-aware entropy filter)")
Build dirs:    $([ "$INCLUDE_BUILD" = "1" ] && echo "INCLUDED" || echo "excluded")
Split dumps:   $([ "$SKIP_SPLIT" = "1" ] && echo "disabled" || echo "enabled")
Excluded:      .env files, celerybeat-schedule, previous dumps,
               node_modules/, build/, .cxx/, cmake/, intermediates/,
               .gradle/, sessions/, .git/, .git-projects-old/
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
    while IFS= read -r _d; do
        [ -n "$_d" ] && echo "$_d"
    done < "$TOP_DIRS_FILE"
    echo ""

    # ---------- 2. DIRECTORY TREE ----------
    cat <<'SECTION'

================================================================================
2. DIRECTORY TREE STRUCTURE
================================================================================

SECTION

    echo "Full directory tree (excluding build artifacts, deps, binaries, .env files):"
    echo ""

    TREE_EXCLUDE='node_modules|__pycache__|^\.git$|\.git-projects-old|\.expo|\.expo-shared|build|dist|out|coverage|sessions|logs|media|staticfiles|\.metro|\.gradle|\.kotlin|\.cache|\.vscode|\.idea|\.npm|\.yarn|venv|env|\.venv|\.tox|\.mypy_cache|\.pytest_cache|Pods|\.next|\.nuxt|\.turbo|\.parcel-cache|\.serverless|\.terraform|_build|target|vendor|\.cxx|cmake|intermediates|derived|\.android|\.env|celerybeat-schedule|complete_codebase_dump_.*\.txt|\.dump_leak_report'

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
        JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
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

Redaction v4: line-anchored. Only literal string assignments at the
beginning of a line are redacted. JSON like {"PASSWORD": "x"} is NOT
matched (avoids source corruption).

If a file cannot be read within its adaptive timeout, its contents are
replaced with a "[file read timed out]" placeholder and the dump continues.

SECTION

    # ----- 5.0 Root files -----
    if [ -s "$ROOT_FILES_FILE" ]; then
        emit_files_section "ROOT-LEVEL FILES" "Root-level file" < "$ROOT_FILES_FILE"
    fi

    # ----- 5.x Each top-level dir (including allowlisted CI dotfolders) -----
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

        printf '%s\n' "$DIR_CONTENTS" \
            | emit_files_section "" "Source file under $dir_name/"
    done < "$TOP_DIRS_FILE"

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
Per-file TO:   adaptive (${MIN_TIMEOUT}-${MAX_TIMEOUT}s)

================================================================================
FOOTER

} > "$TMP_OUTPUT"

# ============================================================
# ATOMIC MOVE + terminate the progress line
# ============================================================
if [ ! -s "$TMP_OUTPUT" ]; then
    printf '\n' >&2
    echo -e "${RED}❌ Dump produced empty output — aborting.${NC}" >&2
    exit 1
fi
mv "$TMP_OUTPUT" "$OUTPUT_FILE"

END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))

# v5.2: overwrite the last rendered progress frame with a truthful
# summary line, terminated with a real newline so it scrolls cleanly.
printf '\r%s✅ Combined pass: %d files in %ds%s\033[K\n' \
    "$GREEN" "$TOTAL_FILES" "$ELAPSED" "$NC" >&2

# ============================================================
# SPLIT DUMPS
# ============================================================
SPLIT_OUTPUTS=()
SPLIT_FAILURES=0

resolve_split_spec() {
    local spec="$1"
    local kind="${spec%%:*}"
    local rest="${spec#*:}"
    local label="" files=""

    case "$kind" in
        dir)
            label="$rest"
            local d="$PROJECT_ROOT/$rest"
            [ -d "$d" ] || return 1
            files="$(grep "^${d}/" "$TMP_LIST" || true)"
            ;;
        file)
            label="$(basename "$rest")"
            local f="$PROJECT_ROOT/$rest"
            [ -f "$f" ] || return 1
            if grep -Fxq "$f" "$TMP_LIST"; then
                files="$f"
            else
                return 1
            fi
            ;;
        group)
            label="${rest%%:*}"
            local members="${rest#*:}"
            IFS=',' read -ra _m <<< "$members"
            local one
            for one in "${_m[@]}"; do
                one="${one// /}"
                [ -z "$one" ] && continue
                local fp="$PROJECT_ROOT/$one"
                [ -f "$fp" ] || continue
                if grep -Fxq "$fp" "$TMP_LIST"; then
                    files+="$fp"$'\n'
                fi
            done
            files="${files%$'\n'}"
            ;;
        *)
            return 1
            ;;
    esac

    [ -z "$files" ] && return 1
    printf '%s\t%s' "$label" "$files"
}

write_split_dump() {
    local spec="$1"
    local resolved
    resolved="$(resolve_split_spec "$spec")" || {
        echo -e "${DIM}   • ${spec} matched 0 files — skipping${NC}" >&2
        return 0
    }

    local label="${resolved%%$'\t'*}"
    local files="${resolved#*$'\t'}"
    local split_count
    split_count=$(printf '%s\n' "$files" | grep -c . || true)
    [ "$split_count" -eq 0 ] && return 0

    local slug="${label//\//_}"
    slug="${slug// /_}"
    local split_file="complete_codebase_dump_${slug}_${TIMESTAMP}.txt"
    local split_tmp
    split_tmp="$(mktemp -t dump_split.XXXXXX)"

    echo -e "${YELLOW}🗂️  Writing split dump: ${BOLD}${label}${NC}${YELLOW} (${split_count} files) -> ${split_file}${NC}" >&2

    # v5.2: save combined state, reset to split-local state. All of
    # these writes are visible to emit_files_section because it runs
    # in the same scope (not a subshell within this function).
    local _saved_current="$CURRENT"
    local _saved_start="$START_TS"
    local _saved_total="$PROGRESS_TOTAL"
    CURRENT=0
    START_TS=$(date +%s)
    PROGRESS_TOTAL="$split_count"

    {
        cat <<SPLIT_HEADER
================================================================================
COMPLETE CODEBASE DUMP — SUBSET: ${label}
================================================================================
Generated:     $(date)
Project:       $PROJECT_NAME
Host:          $(hostname 2>/dev/null || echo unknown)
Project root:  $PROJECT_ROOT
Subset:        ${label}
Spec:          ${spec}
Files in dump: ${split_count}
Per-file TO:   adaptive (${MIN_TIMEOUT}-${MAX_TIMEOUT}s, scale by size)
Redaction:     v4 (line-anchored, JSON-safe)
Leak scan:     $([ "$SKIP_LEAK_SCAN" = "1" ] && echo "SKIPPED" || echo "enabled (path-aware entropy filter)")
Build dirs:    $([ "$INCLUDE_BUILD" = "1" ] && echo "INCLUDED" || echo "excluded")
================================================================================

SPLIT_HEADER

        echo ""
        echo "################################################################################"
        echo "# SUBSET: ${label}"
        echo "################################################################################"
        echo ""
        echo "Files in subset: ${split_count}"
        echo ""

        printf '%s\n' "$files" \
            | emit_files_section "" "Source file under ${label}"

        cat <<SPLIT_FOOTER

================================================================================
END OF SUBSET DUMP: ${label}
================================================================================
Generated:     $(date)
Files in dump: ${split_count}
================================================================================
SPLIT_FOOTER
    } > "$split_tmp"

    local _split_elapsed=$(( $(date +%s) - START_TS ))

    # Restore combined state so the next split starts clean.
    CURRENT="$_saved_current"
    START_TS="$_saved_start"
    PROGRESS_TOTAL="$_saved_total"

    # v5.2: terminate the progress line and print truthful summary.
    printf '\r%s✅ %s: %d files in %ds%s\033[K\n' \
        "$GREEN" "$label" "$split_count" "$_split_elapsed" "$NC" >&2

    if [ ! -s "$split_tmp" ]; then
        echo -e "${RED}   ❌ ${label} split dump was empty — discarding${NC}" >&2
        rm -f "$split_tmp"
        SPLIT_FAILURES=$((SPLIT_FAILURES + 1))
        return 1
    fi

    mv "$split_tmp" "$split_file"

    # Optional per-split leak scan.
    if [ "$SKIP_LEAK_SCAN" = "0" ] && [ "$SCAN_SPLITS" = "1" ]; then
        local _saved_report
        _saved_report="$(cat "$LEAK_REPORT" 2>/dev/null || true)"
        local sc
        sc=$(scan_for_leaks "$split_file" | tr -d '[:space:]')
        [ -z "$sc" ] && sc=0
        if [ "$sc" -gt 0 ] 2>/dev/null; then
            echo -e "${RED}   ❌ Leak in ${split_file} (${sc} hit(s)) — removing${NC}" >&2
            cp "$LEAK_REPORT" "leak_report_${slug}_${TIMESTAMP}.txt" 2>/dev/null || true
            rm -f "$split_file"
            printf '%s\n' "$_saved_report" > "$LEAK_REPORT"
            SPLIT_FAILURES=$((SPLIT_FAILURES + 1))
            return 1
        fi
        printf '%s\n' "$_saved_report" > "$LEAK_REPORT"
    fi

    SPLIT_OUTPUTS+=("$split_file")

    local _expected
    if _expected="$(expected_count_for "$label")" && [ -n "$_expected" ]; then
        if [ "$split_count" -eq "$_expected" ]; then
            echo -e "${GREEN}   ✅ ${split_file} (${split_count} files, $(du -h "$split_file" | cut -f1))${NC}" >&2
        else
            echo -e "${YELLOW}   ⚠️  ${split_file} (${split_count} files, expected ${_expected})${NC}" >&2
        fi
    else
        echo -e "${GREEN}   ✅ ${split_file} (${split_count} files, $(du -h "$split_file" | cut -f1))${NC}" >&2
    fi
    return 0
}

if [ "$SKIP_SPLIT" = "0" ] && [ -n "$SPLIT_TARGETS" ]; then
    echo "" >&2
    echo -e "${CYAN}🗂️  Writing split dumps...${NC}" >&2
    _spec_list="$(printf '%s' "$SPLIT_TARGETS" | sed -E 's/,(dir:|file:|group:)/\n\1/g')"
    while IFS= read -r _spec; do
        [ -z "$_spec" ] && continue
        # Run in a subshell so a crash in one split target does NOT
        # abort the loop. Subshell state (CURRENT/START_TS/etc.) is
        # discarded on exit, which is exactly what we want.
        (
            write_split_dump "$_spec"
        ) || {
            echo -e "${YELLOW}   ⚠️  Split '${_spec}' failed — continuing with remaining targets${NC}" >&2
            SPLIT_FAILURES=$((SPLIT_FAILURES + 1))
        }
    done <<< "$_spec_list"
fi

# ============================================================
# LEAK SCAN (combined)
# ============================================================
if [ "$SKIP_LEAK_SCAN" = "1" ]; then
    echo "" >&2
    echo -e "${YELLOW}⏭️  Leak scan skipped (--skip-leak-scan).${NC}" >&2
else
    echo "" >&2
    echo -e "${YELLOW}🔎 Scanning combined dump for leaked secrets...${NC}" >&2
    LEAK_COUNT=$(scan_for_leaks "$OUTPUT_FILE" | tr -d '[:space:]')
    [ -z "$LEAK_COUNT" ] && LEAK_COUNT=0

    if [ "$LEAK_COUNT" -gt 0 ] 2>/dev/null; then
        echo "" >&2
        echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}" >&2
        echo -e "${RED}║   ❌  LEAK DETECTED — DUMP ABORTED                           ║${NC}" >&2
        echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}" >&2
        echo "" >&2
        echo -e "${RED}${LEAK_COUNT} suspicious string(s) found.${NC}" >&2
        echo -e "${RED}Report:${NC} $(pwd)/${LEAK_REPORT}" >&2
        echo "" >&2
        echo -e "${YELLOW}First 20 hits:${NC}" >&2
        head -20 "$LEAK_REPORT" | sed 's/^/      /' >&2
        echo "" >&2
        if [ "$STRICT_SPLIT_CLEANUP" = "1" ] && [ "${#SPLIT_OUTPUTS[@]}" -gt 0 ]; then
            echo -e "${RED}Removing ${#SPLIT_OUTPUTS[@]} split dump(s) due to combined leak.${NC}" >&2
            rm -f "${SPLIT_OUTPUTS[@]}"
        fi
        echo -e "${YELLOW}If these are false positives (paths, cmake, ndk), run:${NC}" >&2
        echo -e "  ./$(basename "$0") --skip-leak-scan" >&2
        echo "" >&2
        exit 2
    fi

    echo -e "${GREEN}✅ No leaks detected in combined dump.${NC}" >&2
fi
echo "" >&2

# ============================================================
# STATISTICS
# ============================================================
sed "s|^${PROJECT_ROOT}/||" "$TMP_LIST" | LC_ALL=C sort -u > "$EXPECTED_TMP"

grep "^${FILE_MARKER} " "$OUTPUT_FILE" 2>/dev/null \
    | sed "s|^${FILE_MARKER} ||" \
    | LC_ALL=C sort -u > "$ACTUAL_TMP"

TOTAL_MARKERS=$(LC_ALL=C comm -12 "$EXPECTED_TMP" "$ACTUAL_TMP" | wc -l | xargs)

LC_ALL=C comm -23 "$EXPECTED_TMP" "$ACTUAL_TMP" > "$MISSING_TMP"
MISSING_COUNT=$(count_matches '.' "$MISSING_TMP")

FRONTEND_COUNT=$(count_matches '^frontend/' "$ACTUAL_TMP")
BACKEND_COUNT=$(count_matches '^backend/' "$ACTUAL_TMP")
SCANNER_COUNT=$(count_matches '^QRScannerApp/' "$ACTUAL_TMP")
BAILEYS_COUNT=$(count_matches '^baileys-gateway/' "$ACTUAL_TMP")
SHARED_COUNT=$(count_matches '^shared/' "$ACTUAL_TMP")
SAMPLE_CONFIGS_COUNT=$(count_matches '^sample_configs/' "$ACTUAL_TMP")
GITHUB_COUNT=$(count_matches '^\.github/' "$ACTUAL_TMP")
ENV_LEAKS=$(count_matches '(^|/)\.env(\.|$)' "$ACTUAL_TMP")
CELERY_LEAKS=$(count_matches '(^|/)celerybeat-schedule$' "$ACTUAL_TMP")
SESSION_LEAKS=$(count_matches '(^|/)sessions/' "$ACTUAL_TMP")
TIMEOUT_COUNT=$(count_matches "timed out" "$OUTPUT_FILE")

grep "^${FILE_MARKER} " "$OUTPUT_FILE" 2>/dev/null \
    | sed -E "s|^${FILE_MARKER} ([^/]+)/.*|\1/|; s|^${FILE_MARKER} ([^/]+)$|\1|" \
    | LC_ALL=C sort | uniq -c | LC_ALL=C sort -rn > "$TOPLEVEL_BUCKETS_FILE"

echo "" >&2
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅  DUMP COMPLETE                                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}📄 Combined dump:${NC}  $OUTPUT_FILE"
echo -e "${CYAN}📁 Full path:${NC}      $(pwd)/$OUTPUT_FILE"
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
echo -e "   • shared/ files:          ${BOLD}${SHARED_COUNT}${NC}"
echo -e "   • sample_configs/ files:  ${BOLD}${SAMPLE_CONFIGS_COUNT}${NC}"
echo -e "   • .github/ files:         ${BOLD}${GITHUB_COUNT}${NC}"
echo -e "   • .env leaks:             ${BOLD}${ENV_LEAKS}${NC} (expected: 0)"
echo -e "   • sessions/ leaks:        ${BOLD}${SESSION_LEAKS}${NC} (expected: 0)"
echo -e "   • celerybeat-schedule:    ${BOLD}${CELERY_LEAKS}${NC} (expected: 0)"
echo ""
echo -e "${YELLOW}📂 Top-level buckets (from output markers):${NC}"
awk '{printf "   • %-30s %s files\n", $2, $1}' "$TOPLEVEL_BUCKETS_FILE"
echo ""

if [ "$MISSING_COUNT" -gt 0 ]; then
    echo -e "${RED}⚠️  MISSING ${MISSING_COUNT} file(s) from the combined dump. First 20:${NC}"
    head -20 "$MISSING_TMP" | sed 's/^/      /'
    if [ "$MISSING_COUNT" -gt 20 ]; then
        echo -e "${RED}      ...and $((MISSING_COUNT - 20)) more.${NC}"
    fi
else
    echo -e "${GREEN}✅ All ${TOTAL_FILES} files dumped successfully.${NC}"
fi

if [ "${#SPLIT_OUTPUTS[@]}" -gt 0 ]; then
    echo ""
    echo -e "${CYAN}🗂️  Split dumps written (${#SPLIT_OUTPUTS[@]}):${NC}"
    for s in "${SPLIT_OUTPUTS[@]}"; do
        n=$(grep -c "^${FILE_MARKER} " "$s" 2>/dev/null || echo 0)
        printf "   • %-55s %3s files, %s\n" "$s" "$n" "$(du -h "$s" | cut -f1)"
    done
fi
if [ "$SPLIT_FAILURES" -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}⚠️  ${SPLIT_FAILURES} split target(s) failed — see warnings above.${NC}"
fi

# v5.2: explicitly list timed-out files so they can be inspected.
if [ -s "$POISON_FILE" ]; then
    POISON_COUNT_NOW=$(grep -c . "$POISON_FILE" || true)
    if [ "$POISON_COUNT_NOW" -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}⏱️  Files skipped due to timeout (${POISON_COUNT_NOW}):${NC}"
        head -20 "$POISON_FILE" | sed 's/^/      /'
        if [ "$POISON_COUNT_NOW" -gt 20 ]; then
            echo -e "${YELLOW}      ...and $((POISON_COUNT_NOW - 20)) more.${NC}"
        fi
        echo -e "${DIM}    These will be skipped instantly on the next run.${NC}"
        echo -e "${DIM}    Delete .dump_poison_files to retry them.${NC}"
        echo -e "${DIM}    Hint: PER_FILE_TIMEOUT=60 ./$(basename "$0") to retry with more time.${NC}"
    fi
fi

echo ""
echo -e "${GREEN}✅ Ready to upload for analysis.${NC}"
echo ""