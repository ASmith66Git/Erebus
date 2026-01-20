import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { router } from 'expo-router';
import ThemedBackground from '@/components/ThemedBackground';

export default function TermsScreen() {
  const { colors } = useTheme();

  return (
    <ThemedBackground>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Terms & Conditions</Text>
        <View style={styles.placeholder} />
      </View>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
          Terms and conditions content will be added here.
        </Text>
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 40,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  placeholderText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
});
