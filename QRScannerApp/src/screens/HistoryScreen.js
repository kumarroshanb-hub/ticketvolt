// QRScannerApp/src/screens/HistoryScreen.js - FULLY WORKING WITH SCROLLVIEW
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
import { LinearGradient } from 'expo-linear-gradient';
import { scannerApi } from '../services/api';

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
        console.log(`✅ Found ${historyData.length} records from API`);
      } else if (Array.isArray(response.data)) {
        historyData = response.data;
        console.log(`✅ Found ${historyData.length} records (array)`);
      }
      
      // Format the data
      const formatted = historyData.map((item, index) => ({
        id: String(index),
        code: item.code || 'N/A',
        attendee_name: item.attendee_name || 'Unknown',
        event: item.event || 'Event',
        checked_in_at: item.checked_in_at || new Date().toISOString(),
        device_id: item.device_id || 'Unknown',
        scanned_by: item.scanned_by || 'Unknown',
        status: item.status || 'success'
      }));
      
      setHistory(formatted);
      console.log(`✅ Loaded ${formatted.length} formatted records`);
      
    } catch (error) {
      console.error('❌ Error loading history:', error);
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

  // Render a single history item
  const renderItem = (item, index) => (
    <View key={item.id || index} style={[styles.item, index % 2 === 0 ? styles.itemEven : styles.itemOdd]}>
      <View style={styles.itemLeft}>
        <Text style={styles.index}>#{String(index + 1).padStart(3, '0')}</Text>
        <View style={styles.itemContent}>
          <Text style={styles.code}>{item.code}</Text>
          <Text style={styles.attendee}>{item.attendee_name}</Text>
          <Text style={styles.event}>{item.event}</Text>
        </View>
      </View>
      <View style={styles.itemRight}>
        <View style={[
          styles.badge,
          item.status === 'success' ? styles.badgeSuccess : styles.badgeError
        ]}>
          <Text style={[
            styles.badgeText,
            item.status === 'success' ? styles.badgeTextSuccess : styles.badgeTextError
          ]}>
            {item.status === 'success' ? '✓' : '✗'}
          </Text>
        </View>
        <Text style={styles.time}>{formatDate(item.checked_in_at)}</Text>
        {item.device_id && item.device_id !== 'Unknown' && (
          <Text style={styles.device}>{item.device_id}</Text>
        )}
      </View>
    </View>
  );

  // Loading state
  if (loading) {
    return (
      <LinearGradient colors={['#0a0a0f', '#1a0a2e']} style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>📋 AUTH LOG</Text>
          <Text style={styles.subtitle}>Loading records...</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00f5ff" />
          <Text style={styles.loadingText}>Fetching authentication history...</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0a0a0f', '#1a0a2e']} style={styles.container}>
      {/* Header */}
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

      {/* Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#00f5ff"
            colors={['#00f5ff']}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          // Error state
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>⚠️</Text>
            <Text style={styles.emptyTitle}>Connection Error</Text>
            <Text style={styles.emptySubtitle}>{error}</Text>
            <TouchableOpacity style={styles.actionButton} onPress={loadHistory}>
              <LinearGradient
                colors={['rgba(0,245,255,0.15)', 'rgba(0,102,255,0.15)']}
                style={styles.actionButtonGradient}
              >
                <Text style={styles.actionButtonText}>⟳ RETRY</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : history.length === 0 ? (
          // Empty state
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
              <LinearGradient
                colors={['rgba(0,245,255,0.15)', 'rgba(0,102,255,0.15)']}
                style={styles.actionButtonGradient}
              >
                <Text style={styles.actionButtonText}>⟳ REFRESH</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          // List of items
          history.map((item, index) => renderItem(item, index))
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,245,255,0.1)',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#00f5ff',
    fontFamily: 'monospace',
    textShadowColor: '#00f5ff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
    letterSpacing: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },
  subtitle: {
    color: '#8899aa',
    fontSize: 12,
    fontFamily: 'monospace',
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
    backgroundColor: '#00f5ff',
    marginRight: 6,
    shadowColor: '#00f5ff',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 5,
  },
  statusText: {
    color: '#00f5ff',
    fontSize: 10,
    fontFamily: 'monospace',
    opacity: 0.7,
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.05)',
  },
  itemEven: {
    backgroundColor: 'rgba(26,10,46,0.4)',
  },
  itemOdd: {
    backgroundColor: 'rgba(10,10,15,0.6)',
  },
  itemLeft: {
    flexDirection: 'row',
    flex: 1,
  },
  index: {
    color: '#8899aa',
    fontSize: 10,
    fontFamily: 'monospace',
    marginRight: 12,
    paddingTop: 2,
  },
  itemContent: {
    flex: 1,
  },
  code: {
    color: '#00f5ff',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  attendee: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  event: {
    color: '#8899aa',
    fontSize: 11,
    fontFamily: 'monospace',
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
    backgroundColor: 'rgba(0,245,255,0.15)',
    borderColor: 'rgba(0,245,255,0.2)',
  },
  badgeError: {
    backgroundColor: 'rgba(255,0,85,0.15)',
    borderColor: 'rgba(255,0,85,0.2)',
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'monospace',
  },
  badgeTextSuccess: {
    color: '#00f5ff',
  },
  badgeTextError: {
    color: '#ff0055',
  },
  time: {
    color: '#8899aa',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  device: {
    color: 'rgba(136,153,170,0.5)',
    fontSize: 8,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#8899aa',
    fontSize: 14,
    fontFamily: 'monospace',
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
    color: '#ffffff',
    fontSize: 18,
    fontFamily: 'monospace',
    marginBottom: 5,
  },
  emptySubtitle: {
    color: '#8899aa',
    fontSize: 14,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  tipsContainer: {
    marginTop: 15,
    alignItems: 'center',
  },
  tip: {
    color: '#8899aa',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
    textAlign: 'center',
  },
  actionButton: {
    marginTop: 20,
    borderRadius: 8,
    overflow: 'hidden',
  },
  actionButtonGradient: {
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.2)',
    borderRadius: 8,
  },
  actionButtonText: {
    color: '#00f5ff',
    fontSize: 14,
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
});