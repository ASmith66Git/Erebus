import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  ActivityIndicator, 
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/utils/authFetch';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';

interface RoadmapFeature {
  id: number;
  title: string;
  description: string | null;
  status: string;
  predicted_go_live: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  planned: { label: 'Planned', color: '#6B7280', icon: 'time-outline' },
  in_development: { label: 'In Development', color: '#3B82F6', icon: 'code-slash-outline' },
  testing: { label: 'Testing', color: '#F59E0B', icon: 'bug-outline' },
  ready: { label: 'Ready', color: '#10B981', icon: 'checkmark-circle-outline' },
  released: { label: 'Released', color: '#8B5CF6', icon: 'rocket-outline' },
};

const getStatusConfig = (status: string) => {
  return STATUS_CONFIG[status] || STATUS_CONFIG.planned;
};

export default function RoadmapScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const [features, setFeatures] = useState<RoadmapFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchFeatures();
  }, []);

  const fetchFeatures = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await authFetch('/api/roadmap', token);

      if (response.ok) {
        const data = await response.json();
        setFeatures(data.features || []);
      } else if (response.status !== 401) {
        setError('Failed to load roadmap');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchFeatures();
    setRefreshing(false);
  }, [fetchFeatures]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const groupedFeatures = features.reduce((acc, feature) => {
    const status = feature.status;
    if (!acc[status]) acc[status] = [];
    acc[status].push(feature);
    return acc;
  }, {} as Record<string, RoadmapFeature[]>);

  const statusOrder = ['in_development', 'testing', 'ready', 'planned', 'released'];

  if (isLoading && features.length === 0) {
    return (
      <ThemedBackground style={styles.container}>
        <PageHeader title="Roadmap" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground style={styles.container}>
      <PageHeader title="Roadmap" />

      <ScrollView 
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={[styles.introCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="rocket-outline" size={32} color={colors.primary} />
          <Text style={[styles.introTitle, { color: colors.text }]}>What's Coming</Text>
          <Text style={[styles.introText, { color: colors.textSecondary }]}>
            See what features we're working on and what's planned for the future of Erebus.
          </Text>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        ) : features.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="sparkles-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Stay Tuned</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              We're working on exciting new features. Check back soon!
            </Text>
          </View>
        ) : (
          statusOrder.map(status => {
            const statusFeatures = groupedFeatures[status];
            if (!statusFeatures || statusFeatures.length === 0) return null;
            
            const config = getStatusConfig(status);
            return (
              <View key={status} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionIcon, { backgroundColor: config.color + '20' }]}>
                    <Ionicons name={config.icon as any} size={18} color={config.color} />
                  </View>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>{config.label}</Text>
                  <View style={[styles.countBadge, { backgroundColor: config.color }]}>
                    <Text style={styles.countText}>{statusFeatures.length}</Text>
                  </View>
                </View>

                {statusFeatures.map(feature => (
                  <View 
                    key={feature.id} 
                    style={[styles.featureCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Text style={[styles.featureTitle, { color: colors.text }]}>{feature.title}</Text>
                    {feature.description && (
                      <Text style={[styles.featureDescription, { color: colors.textSecondary }]}>
                        {feature.description}
                      </Text>
                    )}
                    {feature.predicted_go_live && (
                      <View style={styles.dateRow}>
                        <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                        <Text style={[styles.dateText, { color: colors.textSecondary }]}>
                          Expected: {formatDate(feature.predicted_go_live)}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            );
          })
        )}

        <View style={[styles.feedbackCard, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.primary} />
          <Text style={[styles.feedbackTitle, { color: colors.text }]}>Have a Feature Request?</Text>
          <Text style={[styles.feedbackText, { color: colors.textSecondary }]}>
            We'd love to hear your ideas! Reach out through the app's feedback option.
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  introCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  introTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 8,
  },
  introText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  errorText: {
    fontSize: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  featureCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 8,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  dateText: {
    fontSize: 12,
  },
  feedbackCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    marginTop: 8,
  },
  feedbackTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 6,
  },
  feedbackText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
