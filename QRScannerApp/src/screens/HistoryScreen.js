// QRScannerApp/src/screens/HistoryScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { scannerApi } from '../services/api';
import { theme } from '../theme';

const C = theme.colors;
const F = theme.fonts;

// ---------------------------------------------------------------------------
// Map one backend /checkin/history/ row into the shape this screen renders.
//
// The backend contract is:
//   { id, ticket_code, attendee_name, event, status, scanned_at, scanner }
//
// The UI wants:
//   { id, code, attendee_name, event, status, checked_in_at, scanned_by }
//
// We do the translation here, in ONE place, with fallbacks so a future
// rename on either side is visible (returns null instead of silently
// substituting "now") and easy to trace.
// ---------------------------------------------------------------------------
function mapHistoryRow(item, index) {
  if (__DEV__ && !item?.ticket_code && !item?.code) {
    console.warn(
      `[history] row ${index} has no ticket code. Keys:`,
      Object.keys(item || {}),
    );
  }

  return {
    id: item?.id || String(index),

    // Backend: `ticket_code`. Legacy fallbacks kept so older builds
    // / different endpoints don't silently render "N/A".
    code: item?.ticket_code || item?.code || 'N/A',

    attendee_name: item?.attendee_name || 'Unknown',
    event: item?.event || 'Event',
    status: item?.status || 'success',

    // Backend: `scanned_at`. Do NOT fall back to `new Date()` — a fake
    // timestamp hides bugs. `formatDate()` below renders 'N/A' if null.
    checked_in_at: item?.scanned_at || item?.checked_in_at || null,

    // Backend: `scanner` (username). Older builds may still send
    // `scanned_by` / `device_id`; keep those as fallbacks.
    scanned_by: item?.scanner || item?.scanned_by || 'Unknown',
    device_id: item?.device_id || null,
  };
}

export default function HistoryScreen({ navigation }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('📋 Loading history...');
      const response = await scannerApi.getHistory(20);
      console.log('📋 Response:', response.data);

      let historyData = [];
      if (response.data?.history && Array.isArray(response.data.history)) {
        historyData = response.data.history;
      } else if (Array.isArray(response.data)) {
        historyData = response.data;
      }

      const formatted = historyData.map(mapHistoryRow);

      setHistory(formatted);
      console.log(`✅ Loaded ${formatted.length} formatted records`);
    } catch (err) {
      console.error('❌ Error loading history:', err);
      setError('Failed to load authentication history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory();
  }, [loadHistory]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  };

  const renderItem = (item, index) => {
    // Three-way mapping matching the web admin's StatusChip semantics:
    //   success   → green
    //   cancelled → amber  (undone, not a failure)
    //   failed    → red    (default for anything unknown)
    const isSuccess = item.status === 'success';
    const isCancelled = item.status === 'cancelled';

    return (
      <View
        key={item.id || index}
        style={[styles.item, index % 2 === 0 ? styles.itemEven : styles.itemOdd]}
      >
        <View style={styles.itemLeft}>
          <Text style={styles.index}>#{String(index + 1).padStart(3, '0')}</Text>
          <View style={styles.itemContent}>
            <Text style={styles.code}>{item.code}</Text>
            <Text style={styles.attendee}>{item.attendee_name}</Text>
            <Text style={styles.event}>{item.event}</Text>
          </View>
        </View>

        <View style={styles.itemRight}>
          <View
            style={[
              styles.badge,
              isSuccess && styles.badgeSuccess,
              !isSuccess && !isCancelled && styles.badgeError,
              isCancelled && styles.badgeWarning,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                isSuccess && styles.badgeTextSuccess,
                !isSuccess && !isCancelled && styles.badgeTextError,
                isCancelled && styles.badgeTextWarning,
              ]}
            >
              {isSuccess ? '✓' : isCancelled ? '↺' : '✗'}
            </Text>
          </View>

          <Text style={styles.time}>{formatDate(item.checked_in_at)}</Text>

          {/* Backend sends `scanner` (username). Only render when it's a
              real value, not the 'Unknown' placeholder. */}
          {item.scanned_by && item.scanned_by !== 'Unknown' && (
            <Text style={styles.device}>by {item.scanned_by}</Text>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>📋 AUTH LOG</Text>
          <Text style={styles.subtitle}>Loading records...</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.secondary} />
          <Text style={styles.loadingText}>Fetching authentication history...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📋 AUTH LOG</Text>
        <View style={styles.headerRow}>
          <Text style={styles.subtitle}>Records: {history.length}</Text>
          <View style={styles.statusIndicator}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Live</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.secondary}
            colors={[C.secondary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>⚠️</Text>
            <Text style={styles.emptyTitle}>Connection Error</Text>
            <Text style={styles.emptySubtitle}>{error}</Text>
            <TouchableOpacity style={styles.actionButton} onPress={loadHistory}>
              <Text style={styles.actionButtonText}>⟳ RETRY</Text>
            </TouchableOpacity>
          </View>
        ) : history.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📡</Text>
            <Text style={styles.emptyTitle}>No Authentication Records</Text>
            <Text style={styles.emptySubtitle}>Scan QR codes to build history</Text>
            <View style={styles.tipsContainer}>
              <Text style={styles.tip}>💡 Point camera at a ticket QR code</Text>
              <Text style={styles.tip}>📱 Make sure backend is running</Text>
              <Text style={styles.tip}>🔗 Check API connection in Settings</Text>
            </View>
            <TouchableOpacity style={styles.actionButton} onPress={onRefresh}>
              <Text style={styles.actionButtonText}>⟳ REFRESH</Text>
            </TouchableOpacity>
          </View>
        ) : (
          history.map((item, index) => renderItem(item, index))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bgDark,
  },
  header: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: C.bgDarkBorder,
  },
  title: {
    fontSize: 20,
    fontFamily: F.familyBold,
    color: C.textInverse,
    letterSpacing: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },
  subtitle: {
    color: C.textMuted,
    fontSize: 12,
    fontFamily: F.family,
    letterSpacing: 1,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.success,
    marginRight: 6,
  },
  statusText: {
    color: C.textMuted,
    fontSize: 10,
    fontFamily: F.family,
    letterSpacing: 1,
  },
  scrollContent: {
    padding: 15,
    paddingBottom: 30,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 15,
    marginBottom: 8,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: C.bgDarkBorder,
  },
  itemEven: {
    backgroundColor: C.bgDarkCard,
  },
  itemOdd: {
    backgroundColor: C.bgPrimary,
  },
  itemLeft: {
    flexDirection: 'row',
    flex: 1,
  },
  index: {
    color: C.textLight,
    fontSize: 10,
    fontFamily: F.familyMono,
    marginRight: 12,
    paddingTop: 2,
  },
  itemContent: {
    flex: 1,
  },
  code: {
    color: C.textInverse,
    fontSize: 14,
    fontFamily: F.familyMono,
    fontWeight: 'bold',
  },
  attendee: {
    color: C.textInverse,
    fontSize: 13,
    fontFamily: F.family,
    marginTop: 2,
  },
  event: {
    color: C.textMuted,
    fontSize: 11,
    fontFamily: F.family,
    marginTop: 1,
  },
  itemRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginLeft: 10,
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 4,
    borderWidth: 1,
  },
  badgeSuccess: {
    backgroundColor: `${C.success}26`,
    borderColor: `${C.success}4D`,
  },
  badgeError: {
    backgroundColor: `${C.error}26`,
    borderColor: `${C.error}4D`,
  },
  badgeWarning: {
    backgroundColor: `${C.warning}26`,
    borderColor: `${C.warning}4D`,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: F.familyBold,
  },
  badgeTextSuccess: {
    color: C.success,
  },
  badgeTextError: {
    color: C.error,
  },
  badgeTextWarning: {
    color: C.warning,
  },
  time: {
    color: C.textMuted,
    fontSize: 10,
    fontFamily: F.family,
    marginTop: 4,
  },
  device: {
    color: C.textLight,
    fontSize: 9,
    fontFamily: F.family,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: C.textMuted,
    fontSize: 14,
    fontFamily: F.family,
    marginTop: 15,
    letterSpacing: 1,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 15,
  },
  emptyTitle: {
    color: C.textInverse,
    fontSize: 18,
    fontFamily: F.familySemiBold,
    marginBottom: 5,
  },
  emptySubtitle: {
    color: C.textMuted,
    fontSize: 14,
    fontFamily: F.family,
    textAlign: 'center',
  },
  tipsContainer: {
    marginTop: 15,
    alignItems: 'center',
  },
  tip: {
    color: C.textMuted,
    fontSize: 12,
    fontFamily: F.family,
    marginBottom: 4,
    textAlign: 'center',
  },
  actionButton: {
    marginTop: 20,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.bgDarkBorder,
    backgroundColor: C.bgDarkCard,
  },
  actionButtonText: {
    color: C.textInverse,
    fontSize: 14,
    fontFamily: F.familySemiBold,
    letterSpacing: 2,
  },
});