import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import Logo from './Logo';

interface PageHeaderProps {
  title: string;
  rightAction?: React.ReactNode;
}

export default function PageHeader({ title, rightAction }: PageHeaderProps) {
  const { colors, isDark, toggleTheme } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const openDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  return (
    <View 
      style={[
        styles.header, 
        { 
          backgroundColor: colors.headerBackground, 
          borderBottomColor: colors.border,
          paddingTop: Math.max(insets.top, 8) + 8,
        }
      ]}
    >
      <Pressable onPress={openDrawer} style={styles.menuButton}>
        <Ionicons name="menu-outline" size={24} color={colors.text} />
      </Pressable>
      <View style={styles.headerCenter}>
        <View style={styles.logoWrapper}>
          <Logo size={28} primaryColor={colors.primary} />
        </View>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
      </View>
      <View style={styles.rightActions}>
        {rightAction}
        <Pressable onPress={toggleTheme} style={styles.themeButton}>
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={22} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  menuButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoWrapper: {
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  themeButton: {
    padding: 8,
  },
});
