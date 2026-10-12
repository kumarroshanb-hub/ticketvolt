#!/usr/bin/env bash
# ============================================================================
# frontend/fix-branding.sh
# ----------------------------------------------------------------------------
# Bulk-replaces hardcoded brand hex values with theme tokens, so pages
# respect theme/tokens.js without needing a full rewrite.
#
# Usage:
#   bash fix-branding.sh              # apply changes
#   bash fix-branding.sh --dry-run    # preview only, no changes
#   bash fix-branding.sh --restore    # restore from latest backup
#
# Always run `git diff` afterwards to review.
# ============================================================================

set -euo pipefail

SRC="src"
DRY_RUN=0
RESTORE=0

# -------- Parse args --------
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=1 ;;
        --restore) RESTORE=1 ;;
        -h|--help)
            cat <<HELP
Usage: bash fix-branding.sh [OPTIONS]

Options:
  --dry-run     Show what would change without modifying files
  --restore     Restore from the most recent backup
  -h, --help    Show this help

The script replaces hardcoded brand hex values with MUI theme semantic
paths (e.g., '#4f46e5' → 'primary.main'). Review changes with 'git diff'.
HELP
            exit 0
            ;;
        *)
            echo "❌ Unknown option: $arg"
            echo "   Run with --help for usage."
            exit 1
            ;;
    esac
done

# ============================================================================
# RESTORE MODE
# ============================================================================
if [ "$RESTORE" = "1" ]; then
    LATEST=$(ls -td .branding-backup-* 2>/dev/null | head -1 || true)
    if [ -z "$LATEST" ]; then
        echo "❌ No backups found in $(pwd)"
        exit 1
    fi
    echo "📦 Restoring from: $LATEST"
    read -p "   This will overwrite $SRC/. Continue? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "   Aborted."
        exit 0
    fi
    rm -rf "$SRC"
    mv "$LATEST" "$SRC"
    echo "✅ Restored $SRC from $LATEST"
    exit 0
fi

# ============================================================================
# VALIDATE
# ============================================================================
if [ ! -d "$SRC" ]; then
    echo "❌ Directory '$SRC' not found."
    echo "   Run this script from your 'frontend/' directory."
    exit 1
fi

if [ ! -f "$SRC/theme/tokens.js" ]; then
    echo "⚠️  $SRC/theme/tokens.js not found."
    echo "   Make sure you've created the tokens file before running this."
    echo "   (Continuing anyway — you can create it after.)"
    echo
fi

BACKUP=".branding-backup-$(date +%s)"

# ============================================================================
# REPLACEMENT MAP
# ----------------------------------------------------------------------------
# Format: "search_pattern|replace_with"
# Longest/most-specific patterns first to avoid partial matches.
# ============================================================================
REPLACEMENTS=(
    # ====================================================================
    # PRIMARY BRAND COLOR — indigo/purple → semantic primary
    # ====================================================================
    "bgcolor: '#4f46e5'|bgcolor: 'primary.main'"
    "bgcolor: \"#4f46e5\"|bgcolor: 'primary.main'"
    "bgcolor: '#5B5FEF'|bgcolor: 'primary.main'"
    "bgcolor: '#4F46E5'|bgcolor: 'primary.main'"

    "color: '#4f46e5'|color: 'primary.main'"
    "color: \"#4f46e5\"|color: 'primary.main'"
    "color: '#5B5FEF'|color: 'primary.main'"

    "borderColor: '#4f46e5'|borderColor: 'primary.main'"
    "borderColor: '#c7d2fe'|borderColor: 'rgba(51, 51, 51, 0.30)'"

    "'2px solid #4f46e5'|'2px solid rgba(51, 51, 51, 1)'"
    "'1px solid #4f46e5'|'1px solid rgba(51, 51, 51, 1)'"
    "borderColor: '#4f46e5'|borderColor: 'primary.main'"

    "background: '#4f46e5'|background: 'primary.main'"
    "background: '#5B5FEF'|background: 'primary.main'"

    "border: '1px solid #e2e8f0'|border: '1px solid rgba(226, 232, 240, 1)'"

    # ====================================================================
    # SECONDARY / ACCENT — purple → semantic secondary
    # ====================================================================
    "bgcolor: '#7c3aed'|bgcolor: 'secondary.main'"
    "bgcolor: '#8B5CF6'|bgcolor: 'secondary.main'"
    "color: '#7c3aed'|color: 'secondary.main'"
    "color: '#8B5CF6'|color: 'secondary.main'"
    "borderColor: '#ddd6fe'|borderColor: 'rgba(255, 42, 42, 0.30)'"

    # ====================================================================
    # TEXT COLORS — slate scale → semantic text
    # ====================================================================
    "color: '#0f172a'|color: 'text.primary'"
    "color: '#1a202c'|color: 'text.primary'"
    "color: '#334155'|color: 'text.primary'"
    "color: '#475569'|color: 'text.secondary'"
    "color: '#64748b'|color: 'text.secondary'"
    "color: '#94a3b8'|color: 'text.disabled'"

    # ====================================================================
    # BACKGROUNDS / SURFACES
    # ====================================================================
    "bgcolor: '#f8fafc'|bgcolor: 'background.default'"
    "bgcolor: '#f1f5f9'|bgcolor: 'action.hover'"
    "bgcolor: '#ffffff'|bgcolor: 'background.paper'"
    "bgcolor: 'white'|bgcolor: 'background.paper'"

    # ====================================================================
    # BORDERS
    # ====================================================================
    "borderColor: '#e2e8f0'|borderColor: 'divider'"
    "border: '1px solid #e2e8f0'|border: '1px solid rgba(226, 232, 240, 1)'"
    "border: '1px dashed #e2e8f0'|border: '1px dashed rgba(226, 232, 240, 1)'"
    "borderTop: '1px solid #e2e8f0'|borderTop: '1px solid rgba(226, 232, 240, 1)'"
    "borderTop: '1px solid #f1f5f9'|borderTop: '1px solid rgba(241, 245, 249, 1)'"
    "borderBottom: '1px solid #e2e8f0'|borderBottom: '1px solid rgba(226, 232, 240, 1)'"

    # ====================================================================
    # STATUS COLORS
    # ====================================================================
    # Success / green
    "bgcolor: '#dcfce7'|bgcolor: 'rgba(16, 185, 129, 0.10)'"
    "color: '#16a34a'|color: 'success.main'"
    "color: '#15803d'|color: 'success.dark'"
    "color: '#10b981'|color: 'success.main'"
    "color: '#22c55e'|color: 'success.main'"
    "bgcolor: '#dcfce7'|bgcolor: 'rgba(16, 185, 129, 0.10)'"

    # Warning / amber
    "bgcolor: '#fef3c7'|bgcolor: 'rgba(245, 158, 11, 0.10)'"
    "color: '#d97706'|color: 'warning.dark'"
    "color: '#b45309'|color: 'warning.dark'"
    "color: '#f59e0b'|color: 'warning.main'"
    "color: '#fbbf24'|color: 'warning.light'"

    # Error / red
    "bgcolor: '#fee2e2'|bgcolor: 'rgba(239, 68, 68, 0.10)'"
    "bgcolor: '#fecaca'|bgcolor: 'rgba(239, 68, 68, 0.15)'"
    "color: '#dc2626'|color: 'error.main'"
    "color: '#ef4444'|color: 'error.main'"
    "color: '#b91c1c'|color: 'error.dark'"

    # Info / blue
    "bgcolor: '#dbeafe'|bgcolor: 'rgba(59, 130, 246, 0.10)'"
    "color: '#2563eb'|color: 'info.dark'"
    "color: '#3b82f6'|color: 'info.main'"
    "color: '#60a5fa'|color: 'info.light'"

    # ====================================================================
    # NEUTRAL GRAYS (backgrounds)
    # ====================================================================
    "bgcolor: '#eef2ff'|bgcolor: 'rgba(51, 51, 51, 0.08)'"

    # ====================================================================
    # EXTRA PATTERNS FROM LARGER PAGES
    # ====================================================================
    # CreateBooking.js specific
    "border: selectedEvent?.id === event.id|border: selectedEvent?.id === event.id"
    "bgcolor: isDraft ? 'rgba(255,200,0,0.03)' : 'white'|bgcolor: isDraft ? 'rgba(255,200,0,0.03)' : 'background.paper'"
    "bgcolor: qty > 0 ? '#f1f5f9' : '#f8fafc'|bgcolor: qty > 0 ? 'action.hover' : 'background.default'"
    "bgcolor: qty < maxQty ? '#eef2ff' : '#f8fafc'|bgcolor: qty < maxQty ? 'rgba(51, 51, 51, 0.08)' : 'background.default'"

    # BookingTickets.js specific
    "border: '1px solid #fecaca'|border: '1px solid rgba(239, 68, 68, 0.30)'"
    "bgcolor: 'rgba(254, 202, 202, 0.1)'|bgcolor: 'rgba(239, 68, 68, 0.06)'"
    "backgroundColor: 'rgba(254, 202, 202, 0.15)'|backgroundColor: 'rgba(239, 68, 68, 0.08)'"
    "backgroundColor: 'rgba(254, 202, 202, 0.25)'|backgroundColor: 'rgba(239, 68, 68, 0.12)'"
    "border: selected ? '2px solid #ef4444' : '1px solid #e2e8f0'|border: selected ? '2px solid rgba(239, 68, 68, 1)' : '1px solid rgba(226, 232, 240, 1)'"
    "boxShadow: '0 24px 64px rgba(0, 0, 0, 0.12)'|boxShadow: '0 24px 64px rgba(0, 0, 0, 0.12)'"

    # Analytics / Discounts / Users specific
    "background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'|background: 'linear-gradient(135deg, #333333 0%, #555555 100%)'"
    "background: 'linear-gradient(135deg, #5B5FEF 0%, #8B5CF6 100%)'|background: 'linear-gradient(135deg, #333333 0%, #555555 100%)'"
    "background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)'|background: 'linear-gradient(135deg, #333333 0%, #555555 100%)'"

    # Users.js specific
    "background: #4f46e5|background: #333333"
    "color: '#5B5FEF'|color: 'primary.main'"
    "background: '#5B5FEF'|background: 'primary.main'"
)

# ============================================================================
# RUN
# ============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   🎨 TicketVolt — Branding Fix Script                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [ "$DRY_RUN" = "1" ]; then
    echo "🔍 DRY RUN MODE — no files will be modified"
    echo ""
else
    echo "📦 Backing up $SRC → $BACKUP"
    cp -R "$SRC" "$BACKUP"
    echo ""
fi

echo "🔧 Scanning for hardcoded hex values..."
echo ""

TOTAL_CHANGES=0
TOTAL_FILES=0

for pair in "${REPLACEMENTS[@]}"; do
    find_pat="${pair%%|*}"
    repl_pat="${pair##*|}"

    # Skip no-op replacements
    if [ "$find_pat" = "$repl_pat" ]; then
        continue
    fi

    # Find matching files (excluding node_modules and backup dir)
    matching_files=$(grep -rlF "$find_pat" "$SRC" --include="*.js" 2>/dev/null || true)

    if [ -z "$matching_files" ]; then
        continue
    fi

    file_count=$(echo "$matching_files" | wc -l | tr -d ' ')
    match_count=$(grep -rF "$find_pat" "$SRC" --include="*.js" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$DRY_RUN" = "1" ]; then
        printf "  🔍 %-45s → %-40s (%s file(s), %s match(es))\n" \
            "$find_pat" "$repl_pat" "$file_count" "$match_count"
    else
        printf "  ✅ %-45s → %-40s (%s file(s), %s match(es))\n" \
            "$find_pat" "$repl_pat" "$file_count" "$match_count"

        # Portable in-place sed
        if sed --version >/dev/null 2>&1; then
            # GNU sed
            echo "$matching_files" | xargs -r sed -i "s|${find_pat}|${repl_pat}|g"
        else
            # BSD sed (macOS)
            echo "$matching_files" | xargs -r sed -i '' "s|${find_pat}|${repl_pat}|g"
        fi
    fi

    TOTAL_CHANGES=$((TOTAL_CHANGES + match_count))
    TOTAL_FILES=$((TOTAL_FILES + file_count))
done

echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

if [ "$DRY_RUN" = "1" ]; then
    echo "📊 DRY RUN SUMMARY:"
    echo "   • Patterns matched:  ${#REPLACEMENTS[@]}"
    echo "   • Total matches:     $TOTAL_CHANGES"
    echo "   • Files affected:    $TOTAL_FILES (may overlap)"
    echo ""
    echo "💡 Run without --dry-run to apply changes."
else
    echo "📊 SUMMARY:"
    echo "   • Total matches replaced:  $TOTAL_CHANGES"
    echo "   • Files affected:          $TOTAL_FILES (may overlap)"
    echo ""
    echo "✅ Done."
    echo ""
    echo "Next steps:"
    echo "  1. Review:      git diff $SRC"
    echo "  2. Fix any remaining hardcoded values manually (see below)"
    echo "  3. Test:        npm start"
    echo ""
    echo "💾 Backup: $BACKUP"
    echo "   Restore with: bash fix-branding.sh --restore"
fi

echo ""
echo "🔎 Remaining hardcoded brand colors (please review manually):"
echo ""

REMAINING=$(grep -rnE "#(4f46e5|5B5FEF|7c3aed|8B5CF6|4F46E5|7C3AED)" \
    "$SRC" --include="*.js" 2>/dev/null || true)

if [ -z "$REMAINING" ]; then
    echo "  ✅ None found. All brand colors are tokenized."
else
    echo "$REMAINING" | head -30 | sed 's/^/     /'
    REMAINING_COUNT=$(echo "$REMAINING" | wc -l | tr -d ' ')
    if [ "$REMAINING_COUNT" -gt 30 ]; then
        echo "     ... and $((REMAINING_COUNT - 30)) more"
    fi
    echo ""
    echo "  💡 These need manual review — they may be:"
    echo "     • Complex multi-line patterns (borders on dynamic states)"
    echo "     • Custom styled-components definitions"
    echo "     • Section headers in comments"
fi

echo ""
echo "🔍 Related checks:"
echo ""

# Font family
FONT_HITS=$(grep -rn "'Inter'" "$SRC" --include="*.js" 2>/dev/null || true)
if [ -n "$FONT_HITS" ]; then
    echo "  ⚠️  Found 'Inter' font references:"
    echo "$FONT_HITS" | head -10 | sed 's/^/     /'
else
    echo "  ✅ No 'Inter' font references."
fi

# Missing theme import
NO_IMPORT=$(grep -rln "#4f46e5\|#5B5FEF" "$SRC" --include="*.js" 2>/dev/null \
    | xargs -r grep -L "from '.*theme/tokens'" 2>/dev/null || true)
if [ -n "$NO_IMPORT" ]; then
    echo ""
    echo "  ⚠️  Files with hardcoded hex but NO theme import:"
    echo "$NO_IMPORT" | head -10 | sed 's/^/     /'
fi

echo ""
echo "════════════════════════════════════════════════════════════════"