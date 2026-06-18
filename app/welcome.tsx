import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import Svg, { Path, Circle, Ellipse, G } from 'react-native-svg';

function DiverIcon({ color, size = 120 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <Circle cx="60" cy="60" r="56" fill={color + '18'} />
      <Circle cx="60" cy="60" r="42" fill={color + '10'} />
      <G>
        <Ellipse cx="60" cy="38" rx="14" ry="16" fill={color} opacity="0.9" />
        <Path
          d="M46 54 Q44 62 48 70 L52 68 Q50 62 52 56Z"
          fill={color}
          opacity="0.85"
        />
        <Path
          d="M74 54 Q76 62 72 70 L68 68 Q70 62 68 56Z"
          fill={color}
          opacity="0.85"
        />
        <Path
          d="M52 68 Q60 80 68 68 L66 62 Q60 72 54 62Z"
          fill={color}
          opacity="0.9"
        />
        <Path
          d="M48 70 Q44 76 42 82 L48 84 Q50 78 54 74Z"
          fill={color}
          opacity="0.75"
        />
        <Path
          d="M72 70 Q76 76 78 82 L72 84 Q70 78 66 74Z"
          fill={color}
          opacity="0.75"
        />
        <Path
          d="M46 36 Q44 28 52 24 Q60 20 68 24 Q76 28 74 36"
          stroke={color}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          opacity="0.6"
        />
        <Circle cx="79" cy="32" r="5" fill={color} opacity="0.5" />
        <Circle cx="84" cy="22" r="3.5" fill={color} opacity="0.35" />
        <Circle cx="87" cy="14" r="2.5" fill={color} opacity="0.22" />
        <Circle cx="88" cy="30" r="2" fill={color} opacity="0.18" />
        <Ellipse cx="46" cy="35" rx="11" ry="7" fill={color + '22'} stroke={color} strokeWidth="2" opacity="0.7" />
        <Circle cx="43" cy="34" r="2" fill={color} opacity="0.5" />
        <Circle cx="49" cy="34" r="2" fill={color} opacity="0.5" />
      </G>
      <Path
        d="M20 92 Q30 86 40 92 Q50 98 60 92 Q70 86 80 92 Q90 98 100 92"
        stroke={color}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.4"
      />
      <Path
        d="M20 100 Q30 94 40 100 Q50 106 60 100 Q70 94 80 100 Q90 106 100 100"
        stroke={color}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.25"
      />
    </Svg>
  );
}

export default function WelcomeScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.getItem(`welcome_seen_${user.id}`).then((val) => {
      if (val === 'true') {
        router.replace('/(app)/(tabs)');
      }
    });
  }, [user?.id]);

  const handleDiveIn = async () => {
    if (user?.id) {
      await AsyncStorage.setItem(`welcome_seen_${user.id}`, 'true');
    }
    router.replace('/(app)/(tabs)');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.iconWrapper}>
          <DiverIcon color={colors.primary} size={140} />
        </View>

        <Text style={[styles.heading, { color: colors.text }]}>
          {t('welcome.heading')}
        </Text>

        <Text style={[styles.subheading, { color: colors.primary }]}>
          {t('welcome.subheading')}
        </Text>

        <View style={[styles.divider, { backgroundColor: colors.primary + '30' }]} />

        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {t('welcome.body1')}
        </Text>

        <Text style={[styles.body, styles.bodySpacing, { color: colors.textSecondary }]}>
          {t('welcome.body2')}
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={handleDiveIn}
        >
          <Text style={styles.buttonText}>{t('welcome.cta')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  iconWrapper: {
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 26,
  },
  divider: {
    width: 48,
    height: 3,
    borderRadius: 2,
    marginBottom: 24,
  },
  body: {
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
  bodySpacing: {
    marginTop: 16,
  },
  button: {
    marginTop: 40,
    paddingVertical: 18,
    paddingHorizontal: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
