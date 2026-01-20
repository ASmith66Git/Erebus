import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ImageBackground, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { router } from 'expo-router';

const darkCoralBackground = require('@/assets/images/coral-background-dark.jpg');

export default function PrivacyScreen() {
  const { colors } = useTheme();

  return (
    <ImageBackground source={darkCoralBackground} style={styles.backgroundImage} resizeMode="cover">
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.headerTitle}>Privacy Policy</Text>
            <View style={styles.placeholder} />
          </View>
          <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={styles.placeholderText}>
              Privacy policy content will be added here.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
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
    color: 'rgba(255,255,255,0.7)',
  },
});
