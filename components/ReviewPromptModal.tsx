import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { recordReviewCompleted } from '@/services/reviewPromptService';

const APP_STORE_URL =
  'https://apps.apple.com/app/id6780519891?action=write-review';

interface Props {
  visible: boolean;
  userId: number | string;
  onClose: () => void;
}

export default function ReviewPromptModal({ visible, userId, onClose }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const [selected, setSelected] = useState(0); // 0 = nothing chosen yet
  const [stage, setStage] = useState<'rate' | 'positive' | 'negative'>('rate');

  const reset = () => {
    setSelected(0);
    setStage('rate');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleStarPress = (star: number) => {
    setSelected(star);
    if (star >= 4) {
      setStage('positive');
    } else {
      setStage('negative');
    }
  };

  const handleGoToAppStore = async () => {
    await recordReviewCompleted(userId);
    await Linking.openURL(APP_STORE_URL);
    handleClose();
  };

  const handleContactSupport = () => {
    handleClose();
    // Small delay so modal fully closes before navigating
    setTimeout(() => {
      router.push('/(app)/(tabs)/help-support');
    }, 300);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.cardBackground, borderColor: colors.border },
          ]}
        >
          {/* ── Stage 1: Star rating ── */}
          {stage === 'rate' && (
            <>
              <View style={styles.iconRow}>
                <Ionicons name="water" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>
                Enjoying Erebus?
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                You've just logged your first dive — how are we doing?
              </Text>

              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable
                    key={star}
                    onPress={() => handleStarPress(star)}
                    style={styles.starButton}
                  >
                    <Ionicons
                      name={star <= selected ? 'star' : 'star-outline'}
                      size={38}
                      color={star <= selected ? '#FFD700' : colors.textSecondary}
                    />
                  </Pressable>
                ))}
              </View>

              <Pressable onPress={handleClose} style={styles.dismissButton}>
                <Text style={[styles.dismissText, { color: colors.textSecondary }]}>
                  Maybe later
                </Text>
              </Pressable>
            </>
          )}

          {/* ── Stage 2a: Positive (4–5 stars) ── */}
          {stage === 'positive' && (
            <>
              <View style={styles.iconRow}>
                <Ionicons name="heart" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>
                That's great to hear!
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Would you take a moment to leave us a review on the App Store?
                It really helps others discover Erebus.
              </Text>

              <Pressable
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={handleGoToAppStore}
              >
                <Ionicons name="star" size={16} color="#fff" />
                <Text style={styles.primaryButtonText}>Rate on App Store</Text>
              </Pressable>

              <Pressable onPress={handleClose} style={styles.dismissButton}>
                <Text style={[styles.dismissText, { color: colors.textSecondary }]}>
                  No thanks
                </Text>
              </Pressable>
            </>
          )}

          {/* ── Stage 2b: Negative (1–3 stars) ── */}
          {stage === 'negative' && (
            <>
              <View style={styles.iconRow}>
                <Ionicons name="chatbubble-ellipses" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>
                We're sorry to hear that
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Your feedback helps us improve. Would you tell us what's not
                working so we can fix it?
              </Text>

              <Pressable
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={handleContactSupport}
              >
                <Ionicons name="chatbubble-outline" size={16} color="#fff" />
                <Text style={styles.primaryButtonText}>Tell us what's wrong</Text>
              </Pressable>

              <Pressable onPress={handleClose} style={styles.dismissButton}>
                <Text style={[styles.dismissText, { color: colors.textSecondary }]}>
                  Maybe later
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  iconRow: {
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 8,
  },
  starButton: {
    padding: 4,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
    width: '100%',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dismissButton: {
    paddingVertical: 8,
  },
  dismissText: {
    fontSize: 14,
  },
});
